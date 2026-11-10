import io

import pytest
from PIL import Image

from app.clients import image_prep
from app.clients.image_prep import BLOCK_OVERHEAD_BYTES, MAX_REQUEST_BYTES, fit_images
from app.core.errors import ParseFailedError
from tests import synthetic as syn
from tests.helpers import make_noise_image_bytes


def _b64_len(raw: int) -> int:
    return 4 * ((raw + 2) // 3)


def _open(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


def test_output_is_always_jpeg_rgb() -> None:
    png = syn.build_png(syn.RESUME_LINES)
    (out,) = fit_images([png], overhead_bytes=2000)
    img = _open(out)
    assert img.format == "JPEG" and img.mode == "RGB"


def test_rgba_png_is_flattened_on_white() -> None:
    rgba = io.BytesIO()
    Image.new("RGBA", (40, 40), (0, 0, 0, 0)).save(rgba, "PNG")  # fully transparent
    (out,) = fit_images([rgba.getvalue()], overhead_bytes=2000)
    pixel = _open(out).convert("RGB").getpixel((5, 5))
    assert min(pixel) > 240


def test_large_photo_near_10mb_fits_budget() -> None:
    photo = make_noise_image_bytes(1800, 1800, "PNG")
    assert len(photo) > 9_000_000
    overhead = 5000
    (out,) = fit_images([photo], overhead_bytes=overhead)
    assert overhead + BLOCK_OVERHEAD_BYTES + _b64_len(len(out)) <= MAX_REQUEST_BYTES


def test_five_images_share_the_budget() -> None:
    pages = [make_noise_image_bytes(1600, 1130, "PNG", seed=i) for i in range(5)]
    overhead = 8000
    outs = fit_images(pages, overhead_bytes=overhead)
    assert len(outs) == 5
    total = overhead + sum(BLOCK_OVERHEAD_BYTES + _b64_len(len(o)) for o in outs)
    assert total <= MAX_REQUEST_BYTES


def test_small_image_is_not_degraded() -> None:
    png = syn.build_png(syn.RESUME_LINES, scale=2)
    width, height = _open(png).size
    (out,) = fit_images([png], overhead_bytes=2000)
    assert _open(out).size == (width, height)  # under the edge cap: no resize


def test_floor_still_too_large_raises_parse_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(image_prep, "MAX_REQUEST_BYTES", 20_000)
    with pytest.raises(ParseFailedError):
        fit_images([make_noise_image_bytes(1200, 1200, "PNG")], overhead_bytes=1000)


def test_overhead_alone_exceeding_limit_raises() -> None:
    with pytest.raises(ParseFailedError):
        fit_images([syn.build_png(syn.RESUME_LINES)], overhead_bytes=MAX_REQUEST_BYTES)


@pytest.mark.parametrize("data", [b"", b"not an image", b"\x89PNG\r\n\x1a\n" + b"0" * 50])
def test_undecodable_image_raises_parse_failed(data: bytes) -> None:
    with pytest.raises(ParseFailedError):
        fit_images([data], overhead_bytes=1000)


def test_pixel_bomb_is_rejected_before_decoding(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(image_prep, "MAX_SOURCE_PIXELS", 1000)
    with pytest.raises(ParseFailedError):
        fit_images([syn.build_png(syn.RESUME_LINES)], overhead_bytes=1000)


def test_source_pixel_limit_is_25_million() -> None:
    assert image_prep.MAX_SOURCE_PIXELS == 25_000_000
    buf = io.BytesIO()
    Image.new("L", (5100, 5100), 255).save(buf, "PNG")  # 26.01 MP, tiny file
    with pytest.raises(ParseFailedError):
        fit_images([buf.getvalue()], overhead_bytes=1000)


@pytest.mark.parametrize("fmt", ["GIF", "BMP", "WEBP", "TIFF"])
def test_only_png_and_jpeg_are_decoded(fmt: str) -> None:
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (255, 255, 255)).save(buf, fmt)
    with pytest.raises(ParseFailedError):
        fit_images([buf.getvalue()], overhead_bytes=1000)


def test_jpeg_source_is_accepted() -> None:
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (255, 255, 255)).save(buf, "JPEG")
    assert len(fit_images([buf.getvalue()], overhead_bytes=1000)) == 1


def test_no_images_returns_empty() -> None:
    assert fit_images([], overhead_bytes=10) == []


def test_downscaled_resume_is_still_readable() -> None:
    """Synthetic resume rendered large, forced down the ladder: ink layout must survive."""
    big = syn.build_png(syn.RESUME_LINES, scale=24)  # glyphs 24 px wide: far above the cap
    reference = _open(big).convert("L")
    (out,) = fit_images([big], overhead_bytes=2000)
    small = _open(out).convert("L")
    assert max(small.size) <= image_prep.EDGE_STEPS[0]
    scaled = reference.resize(small.size, Image.Resampling.LANCZOS)
    agree = sum(
        (a < 128) == (b < 128) for a, b in zip(scaled.tobytes(), small.tobytes(), strict=True)
    )
    assert agree / (small.width * small.height) > 0.97
    # text strokes are still clearly present (not a blank or mushy page)
    ink = sum(p < 128 for p in small.tobytes()) / (small.width * small.height)
    assert 0.02 < ink < 0.6

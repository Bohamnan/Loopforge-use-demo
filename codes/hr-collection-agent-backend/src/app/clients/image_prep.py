"""Shrink images so one LLM request stays within the 1 MB limit (DL 2026-11-10).

Photos and rendered PDF pages are all converted to JPEG. The request budget (limit minus the
non-image part of the body) is split evenly between the images; for each image the ladder
"lower resolution, then lower quality" is walked from best to worst until the base64 form fits
its share. If even the floor does not fit, ParseFailedError is raised and nothing is sent.
"""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.errors import ParseFailedError

LLM_LIMIT_BYTES = 1_000_000  # "1 MB" counted as 10^6 when unsure (DL 2026-11-10)
HEADER_MARGIN_BYTES = 4 * 1024  # request headers may count against the limit on the LLM side
MAX_REQUEST_BYTES = LLM_LIMIT_BYTES - HEADER_MARGIN_BYTES  # budget for the body (incl. base64)
BLOCK_OVERHEAD_BYTES = 128  # JSON wrapper + "data:image/jpeg;base64," prefix + separators
MAX_SOURCE_PIXELS = 25_000_000  # reject pixel bombs from the header, before decoding
ALLOWED_FORMATS = ("PNG", "JPEG")  # same as the upload magic-number check
EDGE_STEPS = (1600, 1280, 1024, 800, 640)  # long edge in px, best to floor
QUALITY_STEPS = (80, 65, 50, 35)  # JPEG quality, best to floor


def _flatten(image: Image.Image) -> Image.Image:
    """Return an RGB image; transparency is composited on white."""
    if image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info:
        rgba = image.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, (255, 255, 255))
        canvas.paste(rgba, mask=rgba.getchannel("A"))
        return canvas
    return image.convert("RGB")


def _load(data: bytes) -> Image.Image:
    try:
        with Image.open(io.BytesIO(data), formats=ALLOWED_FORMATS) as opened:
            width, height = opened.size
            if width * height > MAX_SOURCE_PIXELS:
                raise ParseFailedError()
            opened.load()
            return _flatten(ImageOps.exif_transpose(opened))
    except ParseFailedError:
        raise
    except (OSError, ValueError, SyntaxError, UnidentifiedImageError, Image.DecompressionBombError):
        raise ParseFailedError() from None


def _resized(image: Image.Image, edge: int) -> Image.Image:
    longest = max(image.size)
    if longest <= edge:
        return image
    scale = edge / longest
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.resize(size, Image.Resampling.LANCZOS)


def _fit_one(image: Image.Image, max_raw_bytes: int) -> bytes:
    for edge in EDGE_STEPS:
        candidate = _resized(image, edge)
        for quality in QUALITY_STEPS:
            out = io.BytesIO()
            candidate.save(out, "JPEG", quality=quality, optimize=True)
            if out.tell() <= max_raw_bytes:
                return out.getvalue()
    raise ParseFailedError()


def fit_images(images: list[bytes], overhead_bytes: int) -> list[bytes]:
    """Return JPEG bytes per input image so the whole request body stays within the limit.

    ``overhead_bytes`` is the size of everything in the request except the image blocks.
    """
    if not images:
        return []
    available = MAX_REQUEST_BYTES - overhead_bytes
    slot = available // len(images) - BLOCK_OVERHEAD_BYTES
    max_raw = slot // 4 * 3  # base64 turns every 3 raw bytes into 4 characters
    if max_raw <= 0:
        raise ParseFailedError()
    return [_fit_one(_load(data), max_raw) for data in images]

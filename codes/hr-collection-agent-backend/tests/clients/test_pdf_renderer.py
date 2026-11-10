import struct
import threading
import zlib

import pytest

from app.clients import pdf_renderer
from app.clients.pdf_renderer import (
    LONG_EDGE_PX,
    MAX_PAGES,
    MAX_TEXT_CHARS_PER_PAGE,
    MIN_TEXT_CHARS,
    PDF_TIMEOUT_SECONDS,
    ImagePart,
    TextPart,
    render_pdf,
)
from app.core.errors import ParseFailedError
from tests import synthetic as syn


def _png_size(png: bytes) -> tuple[int, int]:
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    return struct.unpack(">II", png[16:24])


def _png_pixels(png: bytes) -> tuple[int, int, bytes]:
    """Decode an RGB/8-bit PNG produced by the renderer (no filtering assumed beyond None)."""
    width, height = _png_size(png)
    pos, idat = 8, b""
    while pos < len(png):
        (length,) = struct.unpack(">I", png[pos : pos + 4])
        kind = png[pos + 4 : pos + 8]
        if kind == b"IDAT":
            idat += png[pos + 8 : pos + 8 + length]
        pos += 12 + length
    return width, height, zlib.decompress(idat)


def test_constants_match_design() -> None:
    assert (MIN_TEXT_CHARS, MAX_PAGES, LONG_EDGE_PX) == (50, 5, 1600)


def test_text_layer_page_is_sent_as_text_only() -> None:
    result = render_pdf(syn.build_text_pdf([syn.RESUME_LINES]))
    assert result.total_pages == 1 and result.processed_pages == 1
    assert len(result.parts) == 1 and isinstance(result.parts[0], TextPart)
    assert "ZHANG SAN" in result.parts[0].text and "13800138000" in result.parts[0].text
    assert result.parts[0].page == 1


@pytest.mark.parametrize(("n", "expect_text"), [(49, False), (50, True), (51, True)])
def test_text_threshold_counts_non_whitespace_chars(n: int, expect_text: bool) -> None:
    line = " ".join(["A" * 7] * 100)[: n + (n // 7)]  # spaces do not count
    assert len("".join(line.split())) == n
    part = render_pdf(syn.build_text_pdf([[line]])).parts[0]
    assert isinstance(part, TextPart) is expect_text
    assert isinstance(part, ImagePart) is not expect_text


def test_page_without_text_layer_is_rendered_to_png() -> None:
    result = render_pdf(syn.build_scan_pdf(syn.RESUME_LINES))
    (part,) = result.parts
    assert isinstance(part, ImagePart)
    width, height = _png_size(part.png)
    assert max(width, height) == LONG_EDGE_PX
    # The scan is wider than tall, so the long edge is the width.
    assert width == LONG_EDGE_PX and height < width


def test_rendered_png_contains_ink_and_is_valid() -> None:
    (part,) = render_pdf(syn.build_scan_pdf(syn.RESUME_LINES)).parts
    assert isinstance(part, ImagePart)
    width, height, raw = _png_pixels(part.png)
    stride = 1 + width * 3
    assert len(raw) == height * stride
    assert any(b < 100 for b in raw)  # dark (ink) pixels exist


def test_portrait_page_long_edge_is_height() -> None:
    (part,) = render_pdf(syn.build_text_pdf([["AB"]])).parts  # few chars -> rendered
    assert isinstance(part, ImagePart)
    width, height = _png_size(part.png)
    assert height == LONG_EDGE_PX and width < height


def test_page_order_and_mixed_parts_preserved() -> None:
    pdf = syn.build_text_pdf([syn.RESUME_LINES, ["HI"], syn.RESUME_LINES])
    parts = render_pdf(pdf).parts
    assert [type(p) for p in parts] == [TextPart, ImagePart, TextPart]
    assert [p.page for p in parts] == [1, 2, 3]


def test_page_limit_ignores_extra_pages() -> None:
    result = render_pdf(syn.build_text_pdf([syn.RESUME_LINES] * 7))
    assert result.total_pages == 7 and result.processed_pages == MAX_PAGES == 5
    assert [p.page for p in result.parts] == [1, 2, 3, 4, 5]


def test_text_per_page_is_capped() -> None:
    long_line = "WORD " * 3000
    (part,) = render_pdf(syn.build_text_pdf([[long_line]])).parts
    assert isinstance(part, TextPart) and len(part.text) <= MAX_TEXT_CHARS_PER_PAGE


@pytest.mark.parametrize(
    "content", [b"%PDF-1.4\ngarbage", b"%PDF-", b"not a pdf at all", b"%PDF-1.4\n" + b"0" * 64]
)
def test_unreadable_pdf_is_parse_failed(content: bytes) -> None:
    with pytest.raises(ParseFailedError):
        render_pdf(content)


def test_concurrent_rendering_is_serialised_and_consistent() -> None:
    pdf = syn.build_scan_pdf(syn.RESUME_LINES)
    results: list[bytes] = []
    errors: list[BaseException] = []

    def work() -> None:
        try:
            (part,) = render_pdf(pdf).parts
            results.append(part.png)  # type: ignore[union-attr]
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=work) for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors and len(results) == 6 and len(set(results)) == 1


def test_timeout_constant() -> None:
    assert PDF_TIMEOUT_SECONDS == 20


def test_zero_budget_fails_before_any_work() -> None:
    with pytest.raises(ParseFailedError):
        render_pdf(syn.build_text_pdf([syn.RESUME_LINES]), timeout_seconds=0)


def test_deadline_is_checked_between_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    ticks = iter(range(0, 1000))
    monkeypatch.setattr(pdf_renderer, "_now", lambda: next(ticks) * 10.0)  # 10 "seconds" per call
    with pytest.raises(ParseFailedError):
        render_pdf(syn.build_text_pdf([syn.RESUME_LINES] * 5), timeout_seconds=25)


def test_generous_budget_succeeds() -> None:
    assert (
        render_pdf(syn.build_text_pdf([syn.RESUME_LINES]), timeout_seconds=20).processed_pages == 1
    )


def test_waiting_for_the_pdfium_lock_counts_against_the_budget() -> None:
    started, release = threading.Event(), threading.Event()

    def hold() -> None:
        with pdf_renderer._PDFIUM_LOCK:
            started.set()
            release.wait(5)

    t = threading.Thread(target=hold)
    t.start()
    assert started.wait(5)
    try:
        with pytest.raises(ParseFailedError):
            render_pdf(syn.build_text_pdf([syn.RESUME_LINES]), timeout_seconds=0.2)
    finally:
        release.set()
        t.join()
    assert render_pdf(syn.build_text_pdf([syn.RESUME_LINES])).processed_pages == 1  # lock released

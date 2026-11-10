"""Local PDF preparation for the model: text layer first, PNG rendering as fallback.

The model API accepts images but not PDF, so a PDF is converted here before it is sent
(ADR-001 revision). Pages with enough text layer are sent as text (cheap and exact); pages
without one are rendered to PNG. At most ``MAX_PAGES`` pages are processed.
PDFium is not thread-safe, so every call is serialised with a lock.
"""

import re
import struct
import threading
import time
import zlib
from collections.abc import Callable
from dataclasses import dataclass

import pypdfium2 as pdfium
from pypdfium2 import PdfiumError

from app.core.errors import ParseFailedError

MIN_TEXT_CHARS = 50  # non-whitespace characters a page needs to be sent as text
MAX_PAGES = 5
LONG_EDGE_PX = 1600  # rendered image long edge (about 140 DPI on A4)
MAX_TEXT_CHARS_PER_PAGE = 6000  # token guard for pathological text layers

PDF_TIMEOUT_SECONDS = 20  # total budget for lock wait + text extraction + rendering
_PDFIUM_LOCK = threading.Lock()
_WHITESPACE_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class TextPart:
    """A page sent as extracted text."""

    page: int  # 1-based page number
    text: str


@dataclass(frozen=True)
class ImagePart:
    """A page sent as a rendered PNG image."""

    page: int  # 1-based page number
    png: bytes


@dataclass(frozen=True)
class RenderedPdf:
    """Result of preparing a PDF."""

    parts: list[TextPart | ImagePart]
    total_pages: int
    processed_pages: int


def _encode_png(width: int, height: int, stride: int, pixels: bytes) -> bytes:
    """Encode 8-bit RGB pixels (rows may be padded to ``stride``) as a PNG."""
    row_bytes = width * 3
    raw = b"".join(b"\x00" + pixels[y * stride : y * stride + row_bytes] for y in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def _render_page(page: pdfium.PdfPage) -> bytes:
    width_pt, height_pt = page.get_size()
    scale = LONG_EDGE_PX / max(width_pt, height_pt) - 1e-9  # avoid ceil() overshoot
    bitmap = page.render(scale=scale, rev_byteorder=True)  # RGB, no alpha
    return _encode_png(bitmap.width, bitmap.height, bitmap.stride, bytes(bitmap.buffer))


def _page_text(page: pdfium.PdfPage) -> str:
    textpage = page.get_textpage()
    try:
        return textpage.get_text_range()
    finally:
        textpage.close()


def _now() -> float:
    return time.monotonic()


def _open(content: bytes) -> pdfium.PdfDocument:
    try:
        return pdfium.PdfDocument(content)
    except (PdfiumError, ValueError) as exc:
        raise ParseFailedError() from exc


def _process_pages(pdf: pdfium.PdfDocument, check_budget: Callable[[], None]) -> RenderedPdf:
    total = len(pdf)
    if total == 0:
        raise ParseFailedError()
    processed = min(total, MAX_PAGES)
    parts: list[TextPart | ImagePart] = []
    for index in range(processed):
        check_budget()
        page = pdf[index]
        try:
            text = _page_text(page)
            if len(_WHITESPACE_RE.sub("", text)) >= MIN_TEXT_CHARS:
                parts.append(TextPart(index + 1, text.strip()[:MAX_TEXT_CHARS_PER_PAGE]))
            else:
                parts.append(ImagePart(index + 1, _render_page(page)))
        finally:
            page.close()
    check_budget()
    return RenderedPdf(parts=parts, total_pages=total, processed_pages=processed)


def render_pdf(content: bytes, timeout_seconds: float | None = None) -> RenderedPdf:
    """Prepare up to ``MAX_PAGES`` pages of a PDF.

    Unreadable PDFs and exceeding the total time budget raise ParseFailedError. The budget is
    cooperative: it covers waiting for the PDFium lock and is checked between pages, so a
    single page operation that is already running cannot be interrupted.
    """
    budget = PDF_TIMEOUT_SECONDS if timeout_seconds is None else timeout_seconds
    deadline = _now() + budget

    def check_budget() -> None:
        if _now() >= deadline:
            raise ParseFailedError()

    check_budget()
    if not _PDFIUM_LOCK.acquire(timeout=max(budget, 0)):
        raise ParseFailedError()
    try:
        check_budget()
        pdf = _open(content)
        try:
            return _process_pages(pdf, check_budget)
        except PdfiumError as exc:
            raise ParseFailedError() from exc
        finally:
            pdf.close()
    finally:
        _PDFIUM_LOCK.release()

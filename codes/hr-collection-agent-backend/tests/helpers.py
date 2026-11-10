"""Synthetic test data helpers. All data is synthetic (B-06); no real resumes."""

PDF_HEADER = b"%PDF-1.4\n"
JPEG_HEADER = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00"
PNG_HEADER = b"\x89PNG\r\n\x1a\n"


def make_pdf_bytes(size: int = 64) -> bytes:
    """Return minimal bytes that carry a PDF magic prefix."""
    return PDF_HEADER + b"0" * max(0, size - len(PDF_HEADER))


def make_jpeg_bytes(size: int = 64) -> bytes:
    """Return minimal bytes that carry a JPEG magic prefix."""
    return JPEG_HEADER + b"0" * max(0, size - len(JPEG_HEADER))


def make_png_bytes(size: int = 64) -> bytes:
    """Return minimal bytes that carry a PNG magic prefix."""
    return PNG_HEADER + b"0" * max(0, size - len(PNG_HEADER))

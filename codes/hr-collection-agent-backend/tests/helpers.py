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


def make_noise_image_bytes(width: int, height: int, fmt: str = "PNG", seed: int = 1) -> bytes:
    """Return an incompressible (random RGB) image; the worst case for size budgets."""
    import io
    import random

    from PIL import Image

    rng = random.Random(seed)
    image = Image.frombytes("RGB", (width, height), rng.randbytes(width * height * 3))
    out = io.BytesIO()
    image.save(out, fmt, **({"quality": 95} if fmt == "JPEG" else {}))
    return out.getvalue()


def make_real_jpeg_bytes(width: int = 64, height: int = 48) -> bytes:
    """Return a small decodable JPEG (flat colour)."""
    import io

    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", (width, height), (200, 200, 200)).save(out, "JPEG")
    return out.getvalue()

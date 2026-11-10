import io

import pytest

from app.core.errors import (
    FileContentMismatchError,
    FileEmptyError,
    FileMissingError,
    FileTooLargeError,
    UnsupportedFileTypeError,
)
from app.services.upload_validation import MAX_UPLOAD_BYTES, validate_upload
from tests.helpers import make_jpeg_bytes, make_pdf_bytes, make_png_bytes


class CountingStream(io.BytesIO):
    """Records how many bytes were read, to prove oversized uploads are aborted early."""

    def __init__(self, data: bytes) -> None:
        super().__init__(data)
        self.bytes_read = 0

    def read(self, size: int = -1) -> bytes:
        chunk = super().read(size)
        self.bytes_read += len(chunk)
        return chunk


class ExplodingStream(io.BytesIO):
    def read(self, size: int = -1) -> bytes:
        raise AssertionError("the stream must not be read")


def test_limit_constant() -> None:
    assert MAX_UPLOAD_BYTES == 10485760


@pytest.mark.parametrize(
    ("filename", "content", "content_type"),
    [
        ("a.pdf", make_pdf_bytes(), "application/pdf"),
        ("a.PDF", make_pdf_bytes(), "application/pdf"),
        ("a.jpg", make_jpeg_bytes(), "image/jpeg"),
        ("a.jpeg", make_jpeg_bytes(), "image/jpeg"),
        ("A.JPEG", make_jpeg_bytes(), "image/jpeg"),
        ("a.png", make_png_bytes(), "image/png"),
        ("my.resume.v2.png", make_png_bytes(), "image/png"),
    ],
)
def test_valid_files(filename: str, content: bytes, content_type: str) -> None:
    result = validate_upload(filename, io.BytesIO(content))
    assert result.content == content and result.content_type == content_type
    assert result.original_filename == filename


@pytest.mark.parametrize("filename", [None, ""])
def test_missing_file(filename: str | None) -> None:
    with pytest.raises(FileMissingError):
        validate_upload(filename, io.BytesIO(make_pdf_bytes()))
    with pytest.raises(FileMissingError):
        validate_upload("a.pdf", None)


@pytest.mark.parametrize(
    "filename", ["a.docx", "a.txt", "a", "a.gif", "a.pdf.exe", "a.pdf ", "pdf"]
)
def test_extension_whitelist_checked_before_reading(filename: str) -> None:
    with pytest.raises(UnsupportedFileTypeError):
        validate_upload(filename, ExplodingStream(b"%PDF-"))


def test_unsupported_extension_wins_over_empty_content() -> None:
    with pytest.raises(UnsupportedFileTypeError):
        validate_upload("a.txt", io.BytesIO(b""))


def test_size_limit_boundary_exact_is_accepted() -> None:
    content = make_pdf_bytes(MAX_UPLOAD_BYTES)
    assert len(content) == 10485760
    assert len(validate_upload("a.pdf", io.BytesIO(content)).content) == 10485760


def test_one_byte_over_is_too_large_and_reading_stops_early() -> None:
    stream = CountingStream(make_pdf_bytes(MAX_UPLOAD_BYTES + 1))
    with pytest.raises(FileTooLargeError):
        validate_upload("a.pdf", stream)
    assert stream.bytes_read <= MAX_UPLOAD_BYTES + 64 * 1024 + 1


def test_far_larger_upload_is_aborted_without_reading_everything() -> None:
    stream = CountingStream(b"%PDF-" + b"0" * (MAX_UPLOAD_BYTES * 3))
    with pytest.raises(FileTooLargeError):
        validate_upload("a.pdf", stream)
    assert stream.bytes_read < MAX_UPLOAD_BYTES * 2


def test_empty_content() -> None:
    with pytest.raises(FileEmptyError):
        validate_upload("a.pdf", io.BytesIO(b""))


@pytest.mark.parametrize(
    ("filename", "content"),
    [
        ("a.pdf", make_png_bytes()),
        ("a.png", make_pdf_bytes()),
        ("a.jpg", make_png_bytes()),
        ("a.png", make_jpeg_bytes()),
        ("a.jpg", b"random bytes that are not an image"),
        ("a.pdf", b"%PD"),
        ("a.pdf", b" %PDF-1.4"),  # magic must be at offset 0
        ("a.png", b"\x89PNG"),
        ("a.jpg", b"\xff\xd8"),
        ("a.pdf", b"<html>not a pdf</html>"),
    ],
)
def test_magic_bytes_must_match_the_extension(filename: str, content: bytes) -> None:
    with pytest.raises(FileContentMismatchError):
        validate_upload(filename, io.BytesIO(content))


def test_content_type_comes_from_magic_bytes_only() -> None:
    # A .jpeg name with JPEG bytes is JPEG; there is no way to pass a client Content-Type.
    assert validate_upload("x.jpeg", io.BytesIO(make_jpeg_bytes())).content_type == "image/jpeg"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("C:\\Users\\me\\resume.pdf", "resume.pdf"),
        ("../../etc/evil.pdf", "evil.pdf"),
        ("..\\..\\evil.pdf", "evil.pdf"),
        ("dir/sub/ok.pdf", "ok.pdf"),
    ],
)
def test_original_filename_is_basename_only(raw: str, expected: str) -> None:
    assert validate_upload(raw, io.BytesIO(make_pdf_bytes())).original_filename == expected


def test_original_filename_is_truncated_to_255() -> None:
    name = "a" * 300 + ".pdf"
    result = validate_upload(name, io.BytesIO(make_pdf_bytes()))
    assert len(result.original_filename) == 255


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("re\nsu\rme.pdf", "resume.pdf"),
        ("a\x00b\x1f.pdf", "ab.pdf"),
        ("tab\there\x7f.pdf", "tabhere.pdf"),
        ("\u202eevil\u2028.pdf", "evil.pdf"),  # bidi override and line separator
        ("张三\u3000简历.pdf", "张三\u3000简历.pdf"),  # ordinary non-ASCII text is kept
    ],
)
def test_original_filename_has_control_characters_removed(raw: str, expected: str) -> None:
    assert validate_upload(raw, io.BytesIO(make_pdf_bytes())).original_filename == expected

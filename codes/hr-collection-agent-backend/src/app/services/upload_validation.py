"""Validation of an uploaded resume file. The client's Content-Type is never used."""

import unicodedata
from dataclasses import dataclass
from typing import BinaryIO

from app.core.errors import (
    FileContentMismatchError,
    FileEmptyError,
    FileMissingError,
    FileTooLargeError,
    UnsupportedFileTypeError,
)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
CHUNK_BYTES = 64 * 1024
MAX_FILENAME_CHARS = 255

_TYPE_BY_EXTENSION = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}
_MAGIC = (
    (b"%PDF-", "application/pdf"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
)


@dataclass(frozen=True)
class ValidatedUpload:
    """An upload that passed every check."""

    content: bytes
    content_type: str  # determined from the magic bytes
    original_filename: str  # basename, truncated; display only


def _extension(filename: str) -> str:
    dot = filename.rfind(".")
    return filename[dot:].lower() if dot != -1 else ""


def _display_name(filename: str) -> str:
    name = filename.replace("\\", "/").rsplit("/", 1)[-1]
    # Drop control/format characters (C*) and line/paragraph separators (Zl, Zp).
    name = "".join(
        ch
        for ch in name
        if unicodedata.category(ch)[0] != "C" and unicodedata.category(ch) not in ("Zl", "Zp")
    )
    return name[:MAX_FILENAME_CHARS]


def _detect_type(content: bytes) -> str | None:
    for prefix, content_type in _MAGIC:
        if content.startswith(prefix):
            return content_type
    return None


def _read_limited(stream: BinaryIO) -> bytes:
    """Read in chunks and abort as soon as the size limit is exceeded."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = stream.read(CHUNK_BYTES)
        if not chunk:
            return b"".join(chunks)
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise FileTooLargeError()
        chunks.append(chunk)


def validate_upload(filename: str | None, stream: BinaryIO | None) -> ValidatedUpload:
    """Checks in order: missing file, extension, size, empty, magic bytes vs extension."""
    if not filename or stream is None:
        raise FileMissingError()
    expected_type = _TYPE_BY_EXTENSION.get(_extension(filename))
    if expected_type is None:
        raise UnsupportedFileTypeError()
    content = _read_limited(stream)
    if not content:
        raise FileEmptyError()
    if _detect_type(content) != expected_type:
        raise FileContentMismatchError()
    return ValidatedUpload(content, expected_type, _display_name(filename))

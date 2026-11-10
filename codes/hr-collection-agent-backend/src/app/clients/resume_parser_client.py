"""Abstraction of the resume parsing model (the only way resume data leaves the system)."""

from typing import Protocol

from app.schemas.parse import RawParseResult


class ResumeParserClient(Protocol):
    """Parses an uploaded file into an untrusted, un-normalised result."""

    def parse(self, content: bytes, content_type: str) -> RawParseResult:
        """Parse ``content`` (``application/pdf``, ``image/jpeg`` or ``image/png``).

        Raises ParseFailedError, ParseUnavailableError or ParseTimeoutError; never retries.
        """
        ...

"""Read-only queries over the archive: list, detail, file download (REQ-BE-08, ADR-009).

Depends only on the read side of the resumes store (``ResumeReader``) and on the archive's
read-only file methods. The file name comes from the database, never from the request.
"""

from dataclasses import dataclass
from typing import BinaryIO

from app.core.errors import FileNotAvailableError, ResumeNotFoundError
from app.core.logging import log_event
from app.repositories.archive_file_store import ArchiveFileStore
from app.repositories.resume_repository import ResumeReader
from app.schemas.archive import ArchivedResume, ResumeListResponse, ResumeSummary
from app.services.archive_view import to_archived_resume


@dataclass(frozen=True)
class OpenedFile:
    """An open archived file with what the response needs to describe it."""

    stream: BinaryIO  # the caller closes it
    content_type: str
    filename: str  # original name, display only


class ArchiveQueryService:
    """Lists and reads archived resumes; there is nothing here that writes."""

    def __init__(self, resumes: ResumeReader, archive: ArchiveFileStore) -> None:
        self._resumes = resumes
        self._archive = archive

    def list(self) -> ResumeListResponse:
        """All records, most recently saved first."""
        return ResumeListResponse(
            items=[
                ResumeSummary(
                    resume_id=r.id, name=r.name, phone=r.phone, email=r.email,
                    job_title=r.job_title, saved_at=r.created_at,
                )
                for r in self._resumes.list_summaries()
            ]
        )  # fmt: skip

    def get(self, resume_id: str) -> ArchivedResume:
        """A record's values and file metadata; a missing file only flips ``file_available``."""
        detail = self._resumes.get_detail(resume_id)
        if detail is None:
            raise ResumeNotFoundError()
        return to_archived_resume(detail, self._archive.is_available(detail.file_path))

    def open_file(self, resume_id: str) -> OpenedFile:
        """Open the archived original (final names only, never a tmp, never through a link)."""
        detail = self._resumes.get_detail(resume_id)
        if detail is None:
            raise ResumeNotFoundError()
        try:
            stream = self._archive.open_final(detail.file_path)
        except (OSError, ValueError) as exc:
            log_event("archive_file_unavailable", level="warning", exc=exc, resume_id=resume_id)
            raise FileNotAvailableError() from exc
        return OpenedFile(stream, detail.content_type, detail.original_filename)

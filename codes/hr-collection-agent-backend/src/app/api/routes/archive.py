"""Archive read endpoints (interfaces 11, 12, 13). Read only; no browser identifier needed."""

import re
from collections.abc import Iterator
from typing import BinaryIO
from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.deps import get_archive_query_service
from app.schemas.archive import ArchivedResume, ResumeListResponse
from app.services.archive_query_service import ArchiveQueryService

router = APIRouter(prefix="/api/v1/resumes", tags=["archive"])

CHUNK_BYTES = 64 * 1024
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
MAX_FILENAME_CHARS = 255


def content_disposition(filename: str) -> str:
    """Attachment header with an RFC 5987 encoded name: no control characters, <= 255 chars."""
    clean = _CONTROL_RE.sub("", filename)[:MAX_FILENAME_CHARS] or "resume"
    return f"attachment; filename*=UTF-8''{quote(clean, safe='')}"


def _chunks(stream: BinaryIO) -> Iterator[bytes]:
    try:
        while chunk := stream.read(CHUNK_BYTES):
            yield chunk
    finally:
        stream.close()


@router.get("", response_model=ResumeListResponse, operation_id="listResumes")
def list_resumes(service: ArchiveQueryService = Depends(get_archive_query_service)):  # noqa: ANN201
    """Archived resumes, most recently saved first."""
    return service.list()


@router.get("/{resume_id}", response_model=ArchivedResume, operation_id="getResume")
def get_resume(
    resume_id: str, service: ArchiveQueryService = Depends(get_archive_query_service)
) -> ArchivedResume:
    """One archived resume (values only) with file metadata."""
    return service.get(resume_id)


@router.get("/{resume_id}/file", operation_id="downloadResumeFile")
def download_resume_file(
    resume_id: str, service: ArchiveQueryService = Depends(get_archive_query_service)
) -> StreamingResponse:
    """The original file as an attachment; the path comes from the database only."""
    opened = service.open_file(resume_id)
    return StreamingResponse(
        _chunks(opened.stream),
        media_type=opened.content_type,
        headers={
            "Content-Disposition": content_disposition(opened.filename),
            "X-Content-Type-Options": "nosniff",
        },
    )

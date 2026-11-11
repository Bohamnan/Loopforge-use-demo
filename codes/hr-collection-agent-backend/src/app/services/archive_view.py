"""Assemble archive DTOs from stored resumes (shared by archive queries and session reads)."""

from typing import Literal, cast

from app.repositories.resume_repository import ResumeDetail
from app.schemas.archive import ArchivedResume, ResumeValues
from app.schemas.file_info import OriginalFileInfo
from app.schemas.resume_fields import ResumeFields

ContentType = Literal["application/pdf", "image/jpeg", "image/png"]


def values_of(fields: ResumeFields) -> ResumeValues:
    """Drop the statuses: the stored (archived or candidate) form carries values only."""
    return ResumeValues.model_validate(
        {name: getattr(fields, name).value for name in ResumeFields.model_fields}
    )


def file_info(filename: str, content_type: str, size: int) -> OriginalFileInfo:
    return OriginalFileInfo(
        filename=filename, content_type=cast(ContentType, content_type), size_bytes=size
    )


def to_archived_resume(detail: ResumeDetail, file_available: bool) -> ArchivedResume:
    return ArchivedResume(
        resume_id=detail.id,
        fields=detail.values,
        original_file=file_info(detail.original_filename, detail.content_type, detail.file_size),
        file_available=file_available,
        saved_at=detail.created_at,
        updated_at=detail.updated_at,
    )

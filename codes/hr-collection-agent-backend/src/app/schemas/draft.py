"""Draft request/response DTOs (interfaces 1, 2, 3)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.resume_fields import ResumeFields, ResumeFieldsUpdate

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


class OriginalFileInfo(BaseModel):
    """Metadata of the uploaded original file."""

    filename: str  # original name, display only
    content_type: Literal["application/pdf", "image/jpeg", "image/png"]  # from magic bytes
    size_bytes: int = Field(ge=1, le=MAX_UPLOAD_BYTES)


class DraftResponse(BaseModel):
    """The current unconfirmed draft."""

    draft_id: str  # UUID, for display and logs only
    original_file: OriginalFileInfo
    fields: ResumeFields
    created_at: str  # ISO 8601 UTC
    updated_at: str  # ISO 8601 UTC
    expires_at: str  # last activity + 7 days, ISO 8601 UTC


class DraftUpdateRequest(BaseModel):
    """PATCH body. Keys present in ``fields`` become confirmed; required."""

    model_config = ConfigDict(extra="forbid")

    fields: ResumeFieldsUpdate

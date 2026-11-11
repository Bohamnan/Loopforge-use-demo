"""Session request/response DTOs (OpenAPI 0.2.0: /sessions, fields update)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.archive import ArchivedResume, ResumeValues
from app.schemas.chat import ChatMessage
from app.schemas.file_info import MAX_UPLOAD_BYTES, OriginalFileInfo
from app.schemas.resume_fields import ResumeFields, ResumeFieldsUpdate

SessionStatus = Literal["reviewing", "saved"]  # reviewing: editable; saved: read-only
UpdateState = Literal["none", "pending", "applied"]  # update candidate state (v2.1)


class UpdateCandidate(BaseModel):
    """Frozen content and file held by a pending session, awaiting confirm-update."""

    fields: ResumeValues  # values only, no statuses
    original_file: OriginalFileInfo


class SessionSummary(BaseModel):
    """One row of the session list."""

    session_id: str  # UUID
    name: str  # computed at read time: candidate name, else original file name
    status: SessionStatus
    last_active_at: str  # ISO 8601 UTC


class SessionListResponse(BaseModel):
    """Sessions of the current browser, most recently active first."""

    items: list[SessionSummary]


class SessionDetail(BaseModel):
    """A session in one of three shapes: reviewing, saved or pending."""

    session_id: str  # UUID
    name: str
    status: SessionStatus
    update_state: UpdateState
    original_file: OriginalFileInfo
    fields: ResumeFields | None  # reviewing/pending: 22 nodes with statuses; saved: null
    resume: ArchivedResume | None  # saved: archived content read from the resumes store
    update_candidate: UpdateCandidate | None  # non-null only while update_state == pending
    messages: list[ChatMessage]  # chat history, oldest first
    created_at: str  # ISO 8601 UTC
    updated_at: str  # ISO 8601 UTC
    last_active_at: str  # ISO 8601 UTC


class SessionFieldsUpdateRequest(BaseModel):
    """PATCH body. Keys present in ``fields`` become confirmed; required."""

    model_config = ConfigDict(extra="forbid")

    fields: ResumeFieldsUpdate


class SessionFieldsResponse(BaseModel):
    """Result of a partial update."""

    session_id: str  # UUID
    fields: ResumeFields
    updated_at: str  # ISO 8601 UTC


__all__ = ["MAX_UPLOAD_BYTES", "OriginalFileInfo"]

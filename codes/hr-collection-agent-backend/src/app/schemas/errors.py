"""Error response DTOs (D-06)."""

from pydantic import BaseModel

from app.core.errors import ErrorCode, IssueReason


class ErrorDetail(BaseModel):
    """Field-level problem: field path and reason only, never the value."""

    field: str  # e.g. phone, work_experiences[0].start_date
    reason: IssueReason


class ErrorResponse(BaseModel):
    """Unified error body."""

    code: ErrorCode
    message: str  # user-facing, non-sensitive
    request_id: str
    details: list[ErrorDetail] | None = None  # present for validation_failed only

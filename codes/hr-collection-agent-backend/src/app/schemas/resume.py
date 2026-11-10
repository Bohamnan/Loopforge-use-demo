"""Confirm-and-save DTOs (interface 4)."""

from pydantic import BaseModel, ConfigDict


class CreateResumeRequest(BaseModel):
    """Explicit user confirmation. Must be true; otherwise confirmation_required (B-04)."""

    model_config = ConfigDict(extra="forbid")

    confirmed: bool  # required; true means the user explicitly confirmed


class CreateResumeResponse(BaseModel):
    """Result of saving."""

    resume_id: str  # UUID of the saved record
    already_saved: bool  # true: same identity was saved before, nothing added or overwritten
    saved_at: str  # ISO 8601 UTC; first save time when already_saved is true

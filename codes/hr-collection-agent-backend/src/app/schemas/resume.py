"""Confirm-and-save and confirm-update DTOs."""

from pydantic import BaseModel, ConfigDict, StrictBool


class CreateResumeRequest(BaseModel):
    """Explicit user confirmation. Must be true; otherwise confirmation_required (B-04)."""

    model_config = ConfigDict(extra="forbid")

    confirmed: StrictBool  # required JSON boolean; only literal true counts (B-04)


class CreateResumeResponse(BaseModel):
    """Result of saving."""

    resume_id: str  # UUID of the saved record
    already_saved: bool  # true: same identity was saved before, nothing added or overwritten
    saved_at: str  # ISO 8601 UTC; first save time when already_saved is true


class UpdateResumeRequest(BaseModel):
    """Explicit user confirmation of an update; must be literal true (B-04)."""

    model_config = ConfigDict(extra="forbid")

    confirm_update: StrictBool  # required JSON boolean


class UpdateResumeResponse(BaseModel):
    """Result of a confirmed update."""

    resume_id: str  # UUID of the overwritten record
    updated_at: str  # ISO 8601 UTC

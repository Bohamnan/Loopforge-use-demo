"""Original-file metadata shared by session and archive DTOs."""

from typing import Literal

from pydantic import BaseModel, Field

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


class OriginalFileInfo(BaseModel):
    """Metadata of the uploaded original file."""

    filename: str  # original name, display only
    content_type: Literal["application/pdf", "image/jpeg", "image/png"]  # from magic bytes
    size_bytes: int = Field(ge=1, le=MAX_UPLOAD_BYTES)

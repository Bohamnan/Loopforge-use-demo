"""Draft endpoints (interfaces 1, 2, 3). Routes only parse input and convert output."""

from fastapi import APIRouter, Depends, File, Response, UploadFile

from app.api import cookies
from app.api.deps import get_draft_service, get_draft_token, get_settings
from app.core.config import Settings
from app.schemas.draft import DraftResponse
from app.services.draft_service import DraftService
from app.services.upload_validation import validate_upload

router = APIRouter(prefix="/api/v1/resume-drafts", tags=["resume-drafts"])


@router.post("", status_code=201, response_model=DraftResponse, operation_id="createResumeDraft")
def create_resume_draft(
    response: Response,
    file: UploadFile | None = File(default=None),
    old_token: str | None = Depends(get_draft_token),
    service: DraftService = Depends(get_draft_service),
    settings: Settings = Depends(get_settings),
) -> DraftResponse:
    """Upload a resume file, parse it synchronously and create a new unconfirmed draft."""
    upload = validate_upload(
        file.filename if file is not None else None, file.file if file is not None else None
    )
    created = service.create(upload, old_token)
    cookies.set_token(response, created.token, settings)
    return created.response


@router.get("/current", response_model=DraftResponse, operation_id="getCurrentResumeDraft")
def get_current_resume_draft(
    response: Response,
    token: str | None = Depends(get_draft_token),
    service: DraftService = Depends(get_draft_service),
    settings: Settings = Depends(get_settings),
) -> DraftResponse:
    """Read the current draft (page start / restore) and slide the cookie window."""
    draft = service.get(token)
    if token is not None:  # always true here: service.get raises DraftNotFoundError otherwise
        cookies.renew(response, token, settings)
    return draft

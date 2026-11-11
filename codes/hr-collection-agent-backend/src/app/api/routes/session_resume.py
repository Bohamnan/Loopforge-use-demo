"""Confirm-and-save endpoint (interface 9). Routes only parse input and convert output."""

from fastapi import APIRouter, Depends, Response

from app.api import cookies
from app.api.deps import get_browser_id, get_resume_service, get_settings
from app.core.config import Settings
from app.schemas.resume import (
    CreateResumeRequest,
    CreateResumeResponse,
    UpdateResumeRequest,
    UpdateResumeResponse,
)
from app.services.resume_service import ResumeService

router = APIRouter(prefix="/api/v1/sessions", tags=["session-resume"])


@router.post(
    "/{session_id}/resume",
    status_code=201,
    response_model=CreateResumeResponse,
    operation_id="createResume",
    responses={200: {"model": CreateResumeResponse, "description": "Already saved"}},
)
def create_resume(
    session_id: str,
    body: CreateResumeRequest,
    response: Response,
    browser_id: str | None = Depends(get_browser_id),
    service: ResumeService = Depends(get_resume_service),
    settings: Settings = Depends(get_settings),
) -> CreateResumeResponse:
    """Save the session after explicit confirmation: 201 when new, 200 when already saved.

    The browser identifier is not cleared: other sessions of this browser stay reachable.
    """
    result = service.confirm(session_id, browser_id, body.confirmed)
    if result.already_saved:
        response.status_code = 200
    if browser_id is not None:  # always true here: the service raises otherwise
        cookies.renew(response, browser_id, settings)
    return CreateResumeResponse(
        resume_id=result.resume_id, already_saved=result.already_saved, saved_at=result.saved_at
    )


@router.put(
    "/{session_id}/resume", response_model=UpdateResumeResponse, operation_id="updateResume"
)
def update_resume(
    session_id: str,
    body: UpdateResumeRequest,
    response: Response,
    browser_id: str | None = Depends(get_browser_id),
    service: ResumeService = Depends(get_resume_service),
    settings: Settings = Depends(get_settings),
) -> UpdateResumeResponse:
    """Overwrite the saved record with the session's update candidate (explicit confirmation)."""
    result = service.update_existing(session_id, browser_id, body.confirm_update)
    if browser_id is not None:  # always true here: the service raises otherwise
        cookies.renew(response, browser_id, settings)
    return result

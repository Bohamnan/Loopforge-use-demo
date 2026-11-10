"""Confirm-and-save endpoint (interface 4). Routes only parse input and convert output."""

from fastapi import APIRouter, Depends, Response

from app.api import cookies
from app.api.deps import get_draft_token, get_resume_service, get_settings
from app.core.config import Settings
from app.schemas.resume import CreateResumeRequest, CreateResumeResponse
from app.services.resume_service import ResumeService

router = APIRouter(prefix="/api/v1/resumes", tags=["resumes"])


@router.post(
    "",
    status_code=201,
    response_model=CreateResumeResponse,
    operation_id="createResume",
    responses={200: {"model": CreateResumeResponse, "description": "Already saved"}},
)
def create_resume(
    body: CreateResumeRequest,
    response: Response,
    token: str | None = Depends(get_draft_token),
    service: ResumeService = Depends(get_resume_service),
    settings: Settings = Depends(get_settings),
) -> CreateResumeResponse:
    """Save the draft after explicit confirmation: 201 when new, 200 when already saved."""
    result = service.confirm(token, body.confirmed)
    if result.already_saved:
        response.status_code = 200
    cookies.clear(response, settings)
    return CreateResumeResponse(
        resume_id=result.resume_id, already_saved=result.already_saved, saved_at=result.saved_at
    )

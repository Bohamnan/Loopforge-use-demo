"""Session endpoints. Routes only parse input and convert output."""

from fastapi import APIRouter, Depends, File, Response, UploadFile

from app.api import cookies
from app.api.deps import get_browser_id, get_session_service, get_settings
from app.core.config import Settings
from app.schemas.session import SessionDetail, SessionListResponse
from app.services.session_service import SessionService
from app.services.upload_validation import validate_upload

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


@router.post("", status_code=201, response_model=SessionDetail, operation_id="createSession")
def create_session(
    response: Response,
    file: UploadFile | None = File(default=None),
    browser_id: str | None = Depends(get_browser_id),
    service: SessionService = Depends(get_session_service),
    settings: Settings = Depends(get_settings),
) -> SessionDetail:
    """Upload a resume, parse it synchronously and create a new reviewing session."""
    upload = validate_upload(
        file.filename if file is not None else None, file.file if file is not None else None
    )
    created = service.create(upload, browser_id)
    cookies.issue(response, created.browser_id, settings)  # only reached on success
    return created.detail


@router.get("", response_model=SessionListResponse, operation_id="listSessions")
def list_sessions(
    response: Response,
    browser_id: str | None = Depends(get_browser_id),
    service: SessionService = Depends(get_session_service),
    settings: Settings = Depends(get_settings),
) -> SessionListResponse:
    """Sessions of this browser; without a valid identifier an empty list and no cookie."""
    result = service.list(browser_id)
    if browser_id is not None:
        cookies.renew(response, browser_id, settings)
    return result


@router.get("/{session_id}", response_model=SessionDetail, operation_id="getSession")
def get_session(
    session_id: str,
    response: Response,
    browser_id: str | None = Depends(get_browser_id),
    service: SessionService = Depends(get_session_service),
    settings: Settings = Depends(get_settings),
) -> SessionDetail:
    """Read a session (reviewing, saved or pending); changes nothing but renews the cookie."""
    detail = service.get(session_id, browser_id)
    if browser_id is not None:  # always true here: the service raises otherwise
        cookies.renew(response, browser_id, settings)
    return detail

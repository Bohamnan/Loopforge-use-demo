"""Chat endpoints (interfaces 6, 7, 8). Routes only parse input and convert output."""

from fastapi import APIRouter, Depends, Response

from app.api import cookies
from app.api.deps import get_browser_id, get_chat_service, get_settings
from app.core.config import Settings
from app.schemas.chat import SendMessageRequest, SendMessageResponse
from app.services.chat_service import ChatService

router = APIRouter(prefix="/api/v1/sessions", tags=["chat"])


@router.post(
    "/{session_id}/messages",
    status_code=201,
    response_model=SendMessageResponse,
    operation_id="sendMessage",
)
def send_message(
    session_id: str,
    body: SendMessageRequest,
    response: Response,
    browser_id: str | None = Depends(get_browser_id),
    service: ChatService = Depends(get_chat_service),
    settings: Settings = Depends(get_settings),
) -> SendMessageResponse:
    """Send one message; the reply may carry suggestion cards. Nothing is saved or applied."""
    result = service.send(session_id, browser_id, body.content)
    if browser_id is not None:  # always true here: the service raises otherwise
        cookies.renew(response, browser_id, settings)
    return result

"""Abstraction of the chat model (resume data leaves the system only through ``clients``)."""

from dataclasses import dataclass
from typing import Any, Protocol

from app.schemas.chat import RawChatResult


@dataclass(frozen=True)
class ChatTurn:
    """One earlier message of the conversation."""

    role: str  # 'user' | 'assistant'
    content: str


@dataclass(frozen=True)
class ChatRequest:
    """Everything the chat model may see: no original file, file name or browser identifier."""

    fields: dict[str, Any]  # the 22 fields as {"name": {"value": ..., "status": ...}, ...}
    history: list[ChatTurn]  # recent messages, oldest first
    message: str  # the new user message


class ResumeChatClient(Protocol):
    """Asks the model for a reply and suggestion candidates; never changes any data."""

    def chat(self, request: ChatRequest) -> RawChatResult:
        """Raises ChatFailedError for every failure (timeout, unavailable, bad output)."""
        ...

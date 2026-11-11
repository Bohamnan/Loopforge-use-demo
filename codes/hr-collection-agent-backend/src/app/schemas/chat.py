"""Chat DTOs (OpenAPI 0.2.0 ChatMessage/Suggestion/...) and internal model results."""

from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas import limits as L
from app.schemas.resume_fields import ResumeFields

SuggestionValue = str | list[str] | None  # scalar field: str|None; text list: full new list
SuggestionReason = Literal["required", "invalid_format", "invalid_type", "too_long"]
SuggestionStatus = Literal["pending", "applied", "cancelled"]
ChatRole = Literal["user", "assistant"]


class SendMessageRequest(BaseModel):
    """One user chat message; 1..2000 characters (schema). A whitespace-only message passes the
    schema and is rejected by ChatService as ``required`` (OpenAPI: not blank)."""

    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=L.MESSAGE_MAX)


class Suggestion(BaseModel):
    """A field-change card. Only the user can apply it; the model never changes data."""

    suggestion_id: str  # UUID
    field: str  # one of L.SUGGESTION_FIELDS
    old_value: SuggestionValue  # value at the time the card was created
    new_value: SuggestionValue  # scalar: text or null; text list: the complete new list
    applicable: bool  # false: failed validation, shown but cannot be applied
    reason: SuggestionReason | None  # set only when applicable is false
    status: SuggestionStatus  # not applicable => always pending


class ChatMessage(BaseModel):
    """One chat message; assistant messages may carry suggestions."""

    message_id: str  # UUID
    role: ChatRole
    content: str
    suggestions: list[Suggestion]  # empty for user messages
    created_at: str  # ISO 8601 UTC


class SendMessageResponse(BaseModel):
    """The stored user message and the assistant reply."""

    user_message: ChatMessage
    assistant_message: ChatMessage


class SuggestionActionResponse(BaseModel):
    """Result of applying or cancelling the suggestions of one message."""

    message_id: str  # UUID
    suggestions: list[Suggestion]  # the whole message's cards after the action
    fields: ResumeFields  # current fields (changed only by apply)
    updated_at: str  # ISO 8601 UTC


@dataclass(frozen=True)
class RawSuggestion:
    """A leniently parsed suggestion candidate, not yet validated against the whitelist."""

    field: str
    new_value: Any  # untrusted: any JSON value


@dataclass(frozen=True)
class ChatModelOutput:
    """Reply text (already truncated) and suggestion candidates in model order."""

    reply: str
    suggestions: list[RawSuggestion] = field(default_factory=list)


@dataclass(frozen=True)
class RawChatResult:
    """Structurally checked chat model output plus provider usage (cost monitoring only)."""

    output: ChatModelOutput
    prompt_tokens: int | None = None
    completion_tokens: int | None = None

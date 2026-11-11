"""Assemble chat DTOs from stored rows (shared by session reads and the chat use cases)."""

import json
from collections import defaultdict

from app.repositories.chat_repository import MessageRecord, SuggestionRecord
from app.schemas.chat import ChatMessage, Suggestion, SuggestionValue
from app.schemas.resume_fields import ResumeFields


def field_value(fields: ResumeFields, name: str) -> SuggestionValue:
    """Current value of one whitelisted field (scalar text or text list)."""
    return getattr(fields, name).value


def to_suggestion(rec: SuggestionRecord, current: ResumeFields | None) -> Suggestion:
    """``old_value`` is the current value when ``current`` is given (reviewing and pending)."""
    show_old = current is not None and rec.status == "pending"
    return Suggestion(
        suggestion_id=rec.id,
        field=rec.field,
        old_value=field_value(current, rec.field) if show_old and current else None,
        new_value=json.loads(rec.new_value_json),
        applicable=rec.applicable,
        reason=rec.reason,  # type: ignore[arg-type]
        status=rec.status,  # type: ignore[arg-type]
    )


def to_message(
    rec: MessageRecord, suggestions: list[SuggestionRecord], current: ResumeFields | None
) -> ChatMessage:
    return ChatMessage(
        message_id=rec.id,
        role=rec.role,  # type: ignore[arg-type]
        content=rec.content,
        suggestions=[to_suggestion(s, current) for s in suggestions],
        created_at=rec.created_at,
    )


def build_messages(
    messages: list[MessageRecord],
    suggestions: list[SuggestionRecord],
    current: ResumeFields | None,
) -> list[ChatMessage]:
    """Messages in time order, each with its own suggestions in card order."""
    by_message: dict[str, list[SuggestionRecord]] = defaultdict(list)
    for s in sorted(suggestions, key=lambda s: s.seq):
        by_message[s.message_id].append(s)
    return [to_message(m, by_message[m.id], current) for m in messages]

"""Chat use cases: send a message, apply or cancel a suggestion card (REQ-BE-07, ADR-007).

The model only produces text and *suggestions*. Nothing here can save or update a resume: the
constructor takes no ResumeService, resume writer or archive store (B-04, fixed by a test).
Sending is four steps so that no database connection is held while the model works (<= 60 s):
snapshot -> model call -> pure validation -> one BEGIN IMMEDIATE write. Any failure before the
write leaves no message, no suggestion and no field changed.
"""

import json

from app.clients.resume_chat_client import ChatRequest, ChatTurn, ResumeChatClient
from app.core.clock import Clock, format_utc
from app.core.errors import (
    AppError,
    ChatFailedError,
    FieldIssue,
    IssueReason,
    SessionNotFoundError,
    SessionReadOnlyError,
    ValidationFailedError,
)
from app.core.ids import IdGenerator
from app.core.logging import log_event
from app.repositories.chat_repository import ChatRepository, MessageRecord, NewSuggestion
from app.repositories.session_repository import SessionRecord, SessionRepository
from app.schemas import limits as L
from app.schemas.chat import SendMessageResponse
from app.schemas.resume_fields import ResumeFields
from app.services.chat_view import to_message
from app.services.session_service import browser_hash
from app.services.suggestion_validation import validate_suggestions


class ChatService:
    """Orchestrates the conversation of one reviewing session."""

    def __init__(
        self,
        sessions: SessionRepository,
        chats: ChatRepository,
        client: ResumeChatClient,
        clock: Clock,
        ids: IdGenerator,
    ) -> None:
        self._sessions = sessions
        self._chats = chats
        self._client = client
        self._clock = clock
        self._ids = ids

    def send(self, session_id: str, browser_id: str | None, content: str) -> SendMessageResponse:
        """Answer one user message; stores both messages and the validated suggestions."""
        if not content.strip():
            log_event("chat_message_rejected", level="warning", count=len(content))
            raise ValidationFailedError([FieldIssue("content", IssueReason.REQUIRED)])
        if len(content) > L.MESSAGE_MAX:
            log_event("chat_message_rejected", level="warning", count=len(content))
            raise ValidationFailedError([FieldIssue("content", IssueReason.TOO_LONG)])
        owner, session = self._reviewing(session_id, browser_id)
        snapshot = ResumeFields.model_validate_json(session.fields_json)
        history = [
            ChatTurn(m.role, m.content)
            for m in self._chats.recent_messages(session_id, L.HISTORY_WINDOW)
        ]
        # No connection or transaction is open here.
        result = self._ask(ChatRequest(snapshot.model_dump(mode="json"), history, content))
        drafts = validate_suggestions(result.output.suggestions, snapshot, content)
        dropped = len(result.output.suggestions) - len(drafts)
        response = self._store(session_id, owner, content, result.output.reply, drafts)
        log_event(
            "chat_replied", session_id=session_id, message_id=response.assistant_message.message_id
        )
        log_event("chat_suggestions", count=len(drafts))
        if dropped:
            log_event("chat_suggestions_dropped", count=dropped)
        return response

    # ---- steps ---------------------------------------------------------------------------

    def _reviewing(self, session_id: str, browser_id: str | None) -> tuple[str, SessionRecord]:
        if browser_id is None:
            raise SessionNotFoundError()
        owner = browser_hash(browser_id)
        record = self._sessions.get(session_id, owner)
        if record is None:
            raise SessionNotFoundError()
        if record.status != "reviewing":
            raise SessionReadOnlyError()
        return owner, record

    def _ask(self, request: ChatRequest):  # noqa: ANN202
        try:
            return self._client.chat(request)
        except AppError:
            raise
        except Exception as exc:  # noqa: BLE001 - the contract says ChatFailedError; stay safe
            log_event("chat_client_error", level="error", exc=exc)
            raise ChatFailedError() from exc

    def _store(
        self, session_id: str, owner: str, content: str, reply: str, drafts
    ) -> SendMessageResponse:  # noqa: ANN001
        """One transaction: re-check the session, write both messages and the suggestions."""
        now = format_utc(self._clock.now())
        user_id, assistant_id = self._ids.new_id(), self._ids.new_id()
        new = [
            NewSuggestion(
                self._ids.new_id(), d.field, json.dumps(d.new_value, ensure_ascii=False),
                d.applicable, d.reason,
            )
            for d in drafts
        ]  # fmt: skip
        with self._sessions.transaction() as tx:
            record = tx.get(session_id, owner)
            if record is None:
                raise SessionNotFoundError()
            if record.status != "reviewing":
                raise SessionReadOnlyError()
            current = ResumeFields.model_validate_json(record.fields_json)
            chat = self._chats.bind(tx)
            user_seq = chat.append_message(session_id, user_id, "user", content, now)
            assistant_seq = chat.append_message(session_id, assistant_id, "assistant", reply, now)
            chat.add_suggestions(session_id, assistant_id, new, now)
            tx.touch(session_id, owner, now)
            stored = chat.suggestions_of_message(assistant_id)
        user = MessageRecord(user_id, session_id, user_seq, "user", content, now)
        assistant = MessageRecord(assistant_id, session_id, assistant_seq, "assistant", reply, now)
        return SendMessageResponse(
            user_message=to_message(user, [], None),
            assistant_message=to_message(assistant, stored, current),
        )

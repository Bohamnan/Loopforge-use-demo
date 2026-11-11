"""Session use cases: create (upload + parse), list, read. No SQL, no HTTP.

Every session is addressed by (session id, browser identifier). The identifier is hashed once
here; a session that does not exist and one that belongs to another browser both end as
``SessionNotFoundError`` (ADR-008). This service only holds the read-only ``ResumeReader`` and
a read-only availability check: it cannot write resumes or touch the archive directory.
"""

import sqlite3
from collections.abc import Callable
from dataclasses import dataclass

from app.clients.resume_parser_client import ResumeParserClient
from app.core.clock import Clock, format_utc
from app.core.errors import SessionNotFoundError
from app.core.ids import IdGenerator, generate_token, hash_token
from app.core.logging import log_event
from app.repositories.chat_repository import ChatRepository
from app.repositories.draft_file_store import DraftFileStore
from app.repositories.resume_repository import ResumeReader
from app.repositories.session_repository import SessionRecord, SessionRepository
from app.schemas.resume_fields import ResumeFields
from app.schemas.session import (
    SessionDetail,
    SessionListResponse,
    SessionSummary,
    UpdateCandidate,
)
from app.services.archive_view import file_info, to_archived_resume, values_of
from app.services.chat_view import build_messages
from app.services.parse_normalizer import normalize
from app.services.upload_validation import ValidatedUpload

_CLEANUP_ERRORS = (OSError, ValueError, sqlite3.Error)
UNNAMED = "未命名简历"


def session_name(person: str | None) -> str:
    """Display name computed at read time: 'resume · name' or the unnamed placeholder."""
    text = (person or "").strip()
    return f"简历 · {text}" if text else UNNAMED


def browser_hash(browser_id: str) -> str:
    """Only the hash of the browser identifier reaches the repositories."""
    return hash_token(browser_id)


@dataclass(frozen=True)
class CreatedSession:
    """Result of an upload: the session to return and the (possibly new) browser identifier."""

    detail: SessionDetail
    browser_id: str


class SessionService:
    """Orchestrates sessions using repositories, the draft file store and the parser client."""

    def __init__(
        self,
        sessions: SessionRepository,
        chats: ChatRepository,
        files: DraftFileStore,
        parser: ResumeParserClient,
        resumes: ResumeReader,
        file_available: Callable[[str], bool],
        clock: Clock,
        ids: IdGenerator,
    ) -> None:
        self._sessions = sessions
        self._chats = chats
        self._files = files
        self._parser = parser
        self._resumes = resumes
        self._file_available = file_available
        self._clock = clock
        self._ids = ids

    def create(self, upload: ValidatedUpload, browser_id: str | None) -> CreatedSession:
        """Parse an uploaded file into a new session (REQ-BE-01, 02).

        Nothing is kept on failure: no row, no file (O-02). No other session is touched.
        A request without a valid identifier gets a new one.
        """
        identifier = browser_id or generate_token()
        session_id = self._ids.new_id()
        file_path = self._files.save(session_id, upload.content_type, upload.content)
        try:
            fields = normalize(self._parser.parse(upload.content, upload.content_type))
            now = format_utc(self._clock.now())
            record = SessionRecord(
                id=session_id,
                browser_hash=browser_hash(identifier),
                status="reviewing",
                file_path=file_path,
                original_filename=upload.original_filename,
                content_type=upload.content_type,
                file_size=len(upload.content),
                fields_json=fields.model_dump_json(),
                resume_id=None,
                update_state="none",
                created_at=now,
                updated_at=now,
                last_active_at=now,
            )
            self._sessions.insert(record)
        except BaseException:
            self._discard_file(file_path)
            raise
        log_event("session_created", session_id=session_id)
        return CreatedSession(self._detail(record), identifier)

    def list(self, browser_id: str | None) -> SessionListResponse:
        """Sessions of this browser, most recently active first; none without an identifier."""
        if browser_id is None:
            return SessionListResponse(items=[])
        records = self._sessions.list_by_browser(browser_hash(browser_id))
        saved_ids = [r.resume_id for r in records if r.status == "saved" and r.resume_id]
        names = self._resumes.get_names(saved_ids)
        items = [
            SessionSummary(
                session_id=r.id,
                name=self._name_of(r, names),
                status=r.status,  # type: ignore[arg-type]
                last_active_at=r.last_active_at,
            )
            for r in records
        ]
        return SessionListResponse(items=items)

    def get(self, session_id: str, browser_id: str | None) -> SessionDetail:
        """Read a session in its current shape; reading changes nothing (TQ-v2-05)."""
        return self._detail(self._owned(session_id, browser_id))

    # ---- helpers -------------------------------------------------------------------------

    def _owned(self, session_id: str, browser_id: str | None) -> SessionRecord:
        if browser_id is None:
            raise SessionNotFoundError()
        record = self._sessions.get(session_id, browser_hash(browser_id))
        if record is None:
            raise SessionNotFoundError()
        return record

    def _name_of(self, record: SessionRecord, names: dict[str, str]) -> str:
        if record.status == "reviewing":
            return session_name(ResumeFields.model_validate_json(record.fields_json).name.value)
        person = names.get(record.resume_id or "")
        if person is None:
            log_event("resume_name_missing", level="warning", session_id=record.id)
        return session_name(person)

    def _detail(self, record: SessionRecord) -> SessionDetail:
        messages = self._chats.messages_of_session(record.id)
        suggestions = self._chats.suggestions_of_session(record.id)
        original = file_info(record.original_filename, record.content_type, record.file_size)
        if record.status == "reviewing":
            fields = ResumeFields.model_validate_json(record.fields_json)
            return self._build(record, original, fields, None, None, messages, suggestions)
        stored = self._resumes.get_detail(record.resume_id or "")
        if stored is None:
            log_event("resume_name_missing", level="warning", session_id=record.id)
        resume = (
            to_archived_resume(stored, self._file_available(stored.file_path)) if stored else None
        )
        if record.update_state != "pending":
            return self._build(record, original, None, resume, None, messages, suggestions)
        frozen = ResumeFields.model_validate_json(record.fields_json)
        candidate = UpdateCandidate(fields=values_of(frozen), original_file=original)
        return self._build(record, original, frozen, resume, candidate, messages, suggestions)

    def _build(self, record, original, fields, resume, candidate, messages, suggestions):  # noqa: ANN001, ANN202, PLR0913
        # old_value is shown only while the live fields can still be edited or applied.
        live = fields if record.status == "reviewing" else None
        if record.status == "saved":
            person = resume.fields.name if resume else None
        else:
            person = fields.name.value if fields else None
        return SessionDetail(
            session_id=record.id,
            name=session_name(person),
            status=record.status,  # type: ignore[arg-type]
            update_state=record.update_state,  # type: ignore[arg-type]
            original_file=original,
            fields=fields,
            resume=resume,
            update_candidate=candidate,
            messages=build_messages(messages, suggestions, live),
            created_at=record.created_at,
            updated_at=record.updated_at,
            last_active_at=record.last_active_at,
        )

    def _discard_file(self, file_path: str) -> None:
        try:
            self._files.delete(file_path)
        except _CLEANUP_ERRORS as exc:
            log_event("cleanup_failed", level="warning", exc=exc)

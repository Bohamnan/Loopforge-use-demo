"""Draft use cases: create (upload + parse), read and update. No SQL, no HTTP."""

import sqlite3
from dataclasses import dataclass
from datetime import timedelta

from app.clients.resume_parser_client import ResumeParserClient
from app.core.clock import Clock, format_utc, parse_utc
from app.core.ids import IdGenerator, generate_token, hash_token
from app.core.logging import log_event
from app.repositories.draft_file_store import DraftFileStore
from app.repositories.draft_repository import DraftRecord, DraftRepository
from app.schemas.draft import DraftResponse, OriginalFileInfo
from app.schemas.resume_fields import ResumeFields
from app.services.parse_normalizer import normalize
from app.services.upload_validation import ValidatedUpload

_CLEANUP_ERRORS = (OSError, ValueError, sqlite3.Error)


@dataclass(frozen=True)
class CreatedDraft:
    """Result of an upload: the draft to return and the new access token for the cookie."""

    response: DraftResponse
    token: str


def to_response(record: DraftRecord, ttl_days: int) -> DraftResponse:
    """Build the API response; ``expires_at`` is the last activity plus the retention period."""
    expires = parse_utc(record.last_active_at) + timedelta(days=ttl_days)
    return DraftResponse(
        draft_id=record.id,
        original_file=OriginalFileInfo(
            filename=record.original_filename,
            content_type=record.content_type,  # type: ignore[arg-type]
            size_bytes=record.file_size,
        ),
        fields=ResumeFields.model_validate_json(record.fields_json),
        created_at=record.created_at,
        updated_at=record.updated_at,
        expires_at=format_utc(expires),
    )


class DraftService:
    """Orchestrates drafts using repositories, the file store and the parser client."""

    def __init__(
        self,
        repo: DraftRepository,
        files: DraftFileStore,
        parser: ResumeParserClient,
        clock: Clock,
        ids: IdGenerator,
        ttl_days: int,
    ) -> None:
        self._repo = repo
        self._files = files
        self._parser = parser
        self._clock = clock
        self._ids = ids
        self._ttl_days = ttl_days

    def create(self, upload: ValidatedUpload, old_token: str | None) -> CreatedDraft:
        """Parse an uploaded file into a new draft (REQ-BE-01, 02).

        On any failure nothing is kept: no row, no file, and the previous draft and token are
        untouched (O-02). After success a valid previous draft is deleted at once (O-03).
        """
        draft_id = self._ids.new_id()
        file_path = self._files.save(draft_id, upload.content_type, upload.content)
        try:
            raw = self._parser.parse(upload.content, upload.content_type)
            fields = normalize(raw)
            token = generate_token()
            now = format_utc(self._clock.now())
            record = DraftRecord(
                id=draft_id,
                token_hash=hash_token(token),
                file_path=file_path,
                original_filename=upload.original_filename,
                content_type=upload.content_type,
                file_size=len(upload.content),
                fields_json=fields.model_dump_json(),
                created_at=now,
                updated_at=now,
                last_active_at=now,
            )
            self._repo.insert(record)
        except BaseException:
            self._discard_file(file_path, "cleanup_failed")
            raise
        if old_token:
            self._delete_previous(old_token)
        log_event("draft_created", draft_id=draft_id)
        return CreatedDraft(to_response(record, self._ttl_days), token)

    def _discard_file(self, file_path: str, event: str) -> None:
        try:
            self._files.delete(file_path)
        except _CLEANUP_ERRORS as exc:
            log_event(event, level="warning", exc=exc)

    def _delete_previous(self, old_token: str) -> None:
        """Best effort: the new draft already exists, leftovers are cleaned up in 7 days."""
        try:
            old = self._repo.delete_by_token_hash(hash_token(old_token))
            if old is not None:
                self._files.delete(old.file_path)
        except _CLEANUP_ERRORS as exc:
            log_event("old_draft_cleanup_failed", level="warning", exc=exc)

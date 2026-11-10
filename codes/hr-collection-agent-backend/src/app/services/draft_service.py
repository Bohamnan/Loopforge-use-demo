"""Draft use cases: create (upload + parse), read and update. No SQL, no HTTP."""

import sqlite3
from dataclasses import dataclass, replace
from datetime import datetime, timedelta

from app.clients.resume_parser_client import ResumeParserClient
from app.core.clock import Clock, format_utc, parse_utc
from app.core.errors import DraftNotFoundError, ValidationFailedError
from app.core.ids import IdGenerator, generate_token, hash_token
from app.core.logging import log_event
from app.repositories.draft_file_store import DraftFileStore
from app.repositories.draft_repository import DraftRecord, DraftRepository
from app.schemas.draft import DraftResponse, OriginalFileInfo
from app.schemas.resume_fields import (
    EducationListField,
    FieldStatus,
    ProjectExperienceListField,
    ResumeFields,
    ResumeFieldsUpdate,
    StringField,
    StringListField,
    WorkExperienceListField,
)
from app.services.field_validation import validate_update
from app.services.parse_normalizer import normalize
from app.services.upload_validation import ValidatedUpload

_CLEANUP_ERRORS = (OSError, ValueError, sqlite3.Error)
_TEXT_LIST_KEYS = {"strengths", "skills", "certificates_honors", "languages"}
_BLOCK_FIELDS = {
    "work_experiences": WorkExperienceListField,
    "project_experiences": ProjectExperienceListField,
    "educations": EducationListField,
}


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


def _confirmed_node(key: str, value: object):  # noqa: ANN202
    """The node for a submitted field: the value is final, the status is ``confirmed``."""
    if key in _TEXT_LIST_KEYS:
        return StringListField(value=value, status=FieldStatus.CONFIRMED)  # type: ignore[arg-type]
    if key in _BLOCK_FIELDS:
        return _BLOCK_FIELDS[key](value=value, status=FieldStatus.CONFIRMED)
    text = value.strip() if isinstance(value, str) else None
    return StringField(value=text or None, status=FieldStatus.CONFIRMED)  # blank = confirmed empty


def merge_update(fields: ResumeFields, update: ResumeFieldsUpdate) -> ResumeFields:
    """Apply a partial update: present keys are replaced and confirmed, the rest is unchanged."""
    changes = {key: _confirmed_node(key, getattr(update, key)) for key in update.model_fields_set}
    return fields.model_copy(update=changes)


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

    def get(self, token: str | None) -> DraftResponse:
        """Return the draft for ``token`` and refresh its last activity (sliding window, O-01).

        A missing, unknown or expired token all raise DraftNotFoundError (O-10, O-12); an
        expired draft is not touched, it is left for the cleanup job.
        """
        if not token:
            raise DraftNotFoundError()
        token_hash = hash_token(token)
        now = self._clock.now()
        record = self._repo.get_by_token_hash(token_hash)
        if record is None or self._is_expired(record, now):
            raise DraftNotFoundError()
        touched = self._repo.touch_and_get(token_hash, format_utc(now))
        if touched is None:  # deleted between the two statements
            raise DraftNotFoundError()
        return to_response(touched, self._ttl_days)

    def update(self, token: str | None, update: ResumeFieldsUpdate) -> DraftResponse:
        """Apply the user's corrections (REQ-BE-03). All-or-nothing.

        Validation runs first and outside the transaction; the read-merge-write then runs in
        one BEGIN IMMEDIATE transaction so concurrent tabs cannot lose each other's changes.
        """
        issues = validate_update(update)
        if issues:
            raise ValidationFailedError(issues)
        if not token:
            raise DraftNotFoundError()
        token_hash = hash_token(token)
        now = self._clock.now()
        now_text = format_utc(now)
        with self._repo.transaction() as tx:
            record = tx.get_by_token_hash(token_hash)
            if record is None or self._is_expired(record, now):
                raise DraftNotFoundError()
            merged = merge_update(ResumeFields.model_validate_json(record.fields_json), update)
            fields_json = merged.model_dump_json()
            if not tx.update_fields(record.id, fields_json, now_text):
                raise DraftNotFoundError()
        updated = replace(
            record, fields_json=fields_json, updated_at=now_text, last_active_at=now_text
        )
        return to_response(updated, self._ttl_days)

    def _is_expired(self, record: DraftRecord, now: datetime) -> bool:
        """Same rule as the cleanup job: idle for more than the retention period."""
        return parse_utc(record.last_active_at) < now - timedelta(days=self._ttl_days)

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

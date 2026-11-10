"""Confirm-and-save use case (interface 4): the only writer of the formal database (B-04).

Order is fixed (ADR-005, design 5.3): check key -> stage -> create_aggregate -> promote ->
finish. All compensation lives here. Before the commit a failure only has to remove our own
tmp file; after the commit a failed rename keeps record and tmp together for the start-up
reconciliation. Only ``Exception`` is compensated: a process crash runs no code at all.
"""

import sqlite3
from dataclasses import dataclass
from pathlib import Path

from app.core.clock import Clock, format_utc
from app.core.errors import (
    ConfirmationRequiredError,
    DraftNotFoundError,
    DuplicateIdentityError,
    SaveFailedError,
    ValidationFailedError,
)
from app.core.ids import IdGenerator, hash_token
from app.core.logging import log_event
from app.repositories.archive_file_store import ArchiveFileStore, final_name
from app.repositories.draft_file_store import EXTENSIONS, DraftFileStore
from app.repositories.draft_repository import DraftRecord, DraftRepository
from app.repositories.resume_repository import NewResume, ResumeRef, ResumeRepository
from app.schemas.resume_fields import ResumeFields
from app.services.draft_service import is_draft_expired
from app.services.field_validation import validate_core_fields
from app.services.identity_key import Identity, build_identity

_CLEANUP_ERRORS = (OSError, ValueError, sqlite3.Error)


@dataclass(frozen=True)
class ConfirmResult:
    """Outcome of a confirm: the record id, whether it already existed, and its save time."""

    resume_id: str
    already_saved: bool
    saved_at: str  # first save time when already_saved is true


class ResumeService:
    """Saves a confirmed draft as a resume record plus archived original file."""

    def __init__(
        self,
        drafts: DraftRepository,
        draft_files: DraftFileStore,
        resumes: ResumeRepository,
        archive: ArchiveFileStore,
        clock: Clock,
        ids: IdGenerator,
        ttl_days: int,
    ) -> None:
        self._drafts = drafts
        self._draft_files = draft_files
        self._resumes = resumes
        self._archive = archive
        self._clock = clock
        self._ids = ids
        self._ttl_days = ttl_days

    def confirm(self, token: str | None, confirmed: bool | None) -> ConfirmResult:
        """Save the draft behind ``token`` once the user explicitly confirmed (B-04).

        Idempotent on the normalised identity (ADR-004): an existing record is neither
        overwritten nor duplicated. Unconfirmed fields are saved with their current draft
        values (D-03).
        """
        if confirmed is not True:
            raise ConfirmationRequiredError()
        draft = self._load_draft(token)
        fields = ResumeFields.model_validate_json(draft.fields_json)
        issues = validate_core_fields(fields.name.value, fields.phone.value, fields.email.value)
        if issues:
            raise ValidationFailedError(issues)
        identity = build_identity(
            fields.name.value or "", fields.phone.value or "", fields.email.value or ""
        )
        existing = self._find(identity)
        if existing is not None:
            return self._duplicate(draft, existing)
        return self._save_new(draft, fields, identity)

    # ---- steps ---------------------------------------------------------------------------

    def _load_draft(self, token: str | None) -> DraftRecord:
        if not token:
            raise DraftNotFoundError()
        record = self._drafts.get_by_token_hash(hash_token(token))
        if record is None or is_draft_expired(record, self._clock.now(), self._ttl_days):
            raise DraftNotFoundError()
        return record

    def _find(self, identity: Identity) -> ResumeRef | None:
        return self._resumes.find_by_identity_key(
            identity.name_key, identity.phone_key, identity.email_key
        )

    def _save_new(
        self, draft: DraftRecord, fields: ResumeFields, identity: Identity
    ) -> ConfirmResult:
        resume_id = self._ids.new_id()
        ext = EXTENSIONS[draft.content_type]
        raced = self._stage(draft, identity, resume_id, ext)
        if raced is not None:
            return self._duplicate(draft, raced)
        created_at = format_utc(self._clock.now())
        resume = self._build_resume(draft, fields, identity, resume_id, ext, created_at)
        try:
            self._resumes.create_aggregate(resume)
        except DuplicateIdentityError as exc:
            self._discard_tmp(resume_id, ext)
            existing = self._find(identity)
            if existing is None:  # the conflicting record vanished: cannot happen, fail safe
                log_event("duplicate_vanished", level="error", exc=exc, resume_id=resume_id)
                raise SaveFailedError() from exc
            return self._duplicate(draft, existing)
        except Exception as exc:
            self._discard_tmp(resume_id, ext)
            log_event("db_write_failed", level="error", exc=exc, resume_id=resume_id)
            raise SaveFailedError() from exc
        self._promote(resume_id, ext)
        self._finish(draft)
        log_event("resume_saved", resume_id=resume_id)
        return ConfirmResult(resume_id, False, created_at)

    def _stage(
        self, draft: DraftRecord, identity: Identity, resume_id: str, ext: str
    ) -> ResumeRef | None:
        """Copy the draft file to the tmp name. Returns a record only if one appeared meanwhile."""
        source = self._resolve_source(draft, resume_id)
        try:
            self._archive.stage(source, resume_id, ext)
        except FileNotFoundError as exc:
            self._discard_tmp(resume_id, ext)
            if source.exists():  # the archive side is missing, not the draft file
                log_event("stage_failed", level="error", exc=exc, resume_id=resume_id)
                raise SaveFailedError() from exc
            return self._after_source_missing(draft, identity, exc)
        except Exception as exc:
            self._discard_tmp(resume_id, ext)
            log_event("stage_failed", level="error", exc=exc, resume_id=resume_id)
            raise SaveFailedError() from exc
        return None

    def _resolve_source(self, draft: DraftRecord, resume_id: str) -> Path:
        try:
            return self._draft_files.resolve(draft.file_path)
        except ValueError as exc:
            log_event("stage_failed", level="error", exc=exc, resume_id=resume_id)
            raise SaveFailedError() from exc

    def _after_source_missing(
        self, draft: DraftRecord, identity: Identity, cause: Exception
    ) -> ResumeRef:
        """The draft file is gone: a concurrent request may have saved and finished it."""
        existing = self._find(identity)
        if existing is not None:
            return existing
        if self._drafts.get_by_token_hash(draft.token_hash) is None:
            raise DraftNotFoundError() from cause
        log_event("draft_file_missing", level="error", exc=cause, draft_id=draft.id)
        raise SaveFailedError() from cause

    def _promote(self, resume_id: str, ext: str) -> None:
        """Rename tmp to the final name; retry once. The record is already committed."""
        for attempt in (1, 2):
            try:
                self._archive.promote(resume_id, ext)
                return
            except Exception as exc:
                log_event(
                    "promote_failed", level="warning" if attempt == 1 else "error", exc=exc,
                    resume_id=resume_id, count=attempt,
                )  # fmt: skip
        # Record and tmp stay together; the start-up reconciliation rolls forward (ADR-005).
        raise SaveFailedError()

    def _duplicate(self, draft: DraftRecord, existing: ResumeRef) -> ConfirmResult:
        """Same identity already saved: our own tmp is gone, drop the draft, report it."""
        self._finish(draft)
        log_event("resume_duplicate", resume_id=existing.id)
        return ConfirmResult(existing.id, True, existing.created_at)

    def _finish(self, draft: DraftRecord) -> None:
        """Delete the draft row, then its file. Failures are logged only (cleanup job covers)."""
        try:
            self._drafts.delete(draft.id)
        except _CLEANUP_ERRORS as exc:
            log_event("draft_cleanup_failed", level="warning", exc=exc, draft_id=draft.id)
            return  # keep the file: the remaining row still points at it
        try:
            self._draft_files.delete(draft.file_path)
        except _CLEANUP_ERRORS as exc:
            log_event("draft_cleanup_failed", level="warning", exc=exc, draft_id=draft.id)

    def _discard_tmp(self, resume_id: str, ext: str) -> None:
        """Compensation must not mask the original failure: errors are only logged."""
        try:
            self._archive.discard_tmp(resume_id, ext)
        except _CLEANUP_ERRORS as exc:
            log_event("tmp_cleanup_failed", level="warning", exc=exc, resume_id=resume_id)

    @staticmethod
    def _build_resume(
        draft: DraftRecord,
        fields: ResumeFields,
        identity: Identity,
        resume_id: str,
        ext: str,
        created_at: str,
    ) -> NewResume:
        return NewResume(
            id=resume_id,
            name=identity.name,
            phone=identity.phone,
            email=identity.email,
            name_key=identity.name_key,
            phone_key=identity.phone_key,
            email_key=identity.email_key,
            file_path=final_name(resume_id, ext),
            original_filename=draft.original_filename,
            content_type=draft.content_type,
            file_size=draft.file_size,
            created_at=created_at,
            job_title=fields.job_title.value,
            expected_city=fields.expected_city.value,
            expected_salary=fields.expected_salary.value,
            available_time=fields.available_time.value,
            homepage=fields.homepage.value,
            gender=fields.gender.value,
            birth_month=fields.birth_month.value,
            political_status=fields.political_status.value,
            current_city=fields.current_city.value,
            work_years=fields.work_years.value,
            highest_education=fields.highest_education.value,
            self_evaluation=fields.self_evaluation.value,
            strengths=list(fields.strengths.value),
            skills=list(fields.skills.value),
            certificates_honors=list(fields.certificates_honors.value),
            languages=list(fields.languages.value),
            work_experiences=list(fields.work_experiences.value),
            project_experiences=list(fields.project_experiences.value),
            educations=list(fields.educations.value),
        )

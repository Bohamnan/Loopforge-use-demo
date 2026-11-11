"""Confirm-and-save use case (interface 9): a writer of the formal database (B-04, B-05).

Order is fixed (ADR-005, design 5.3): check key -> stage -> create_aggregate -> promote ->
finish. All compensation lives here. Before the commit a failure only has to remove our own
tmp file; after the commit a failed rename keeps record and tmp together for the start-up
reconciliation. Only ``Exception`` is compensated: a process crash runs no code at all.

The session stays after saving (ADR-008): "finish" is a conditional state change, never a
delete, so every "was it already handled?" question is answered by re-reading the session.
"""

import sqlite3
from dataclasses import dataclass
from pathlib import Path

from app.core.clock import Clock, format_utc
from app.core.errors import (
    ConfirmationRequiredError,
    DuplicateIdentityError,
    SaveFailedError,
    SessionNotFoundError,
    SessionReadOnlyError,
    ValidationFailedError,
)
from app.core.ids import IdGenerator
from app.core.logging import log_event
from app.repositories.archive_file_store import ArchiveFileStore, final_name
from app.repositories.draft_file_store import EXTENSIONS, DraftFileStore
from app.repositories.resume_repository import NewResume, ResumeRef, ResumeRepository
from app.repositories.session_repository import SessionRecord, SessionRepository
from app.schemas.resume_fields import ResumeFields
from app.services.field_validation import validate_core_fields
from app.services.identity_key import Identity, build_identity
from app.services.session_service import browser_hash

_CLEANUP_ERRORS = (OSError, ValueError, sqlite3.Error)


@dataclass(frozen=True)
class ConfirmResult:
    """Outcome of a confirm: the record id, whether it already existed, and its save time."""

    resume_id: str
    already_saved: bool
    saved_at: str  # first save time when already_saved is true


class ResumeService:
    """Saves a confirmed session as a resume record plus archived original file."""

    def __init__(
        self,
        sessions: SessionRepository,
        draft_files: DraftFileStore,
        resumes: ResumeRepository,
        archive: ArchiveFileStore,
        clock: Clock,
        ids: IdGenerator,
    ) -> None:
        self._sessions = sessions
        self._draft_files = draft_files
        self._resumes = resumes
        self._archive = archive
        self._clock = clock
        self._ids = ids

    def confirm(
        self, session_id: str, browser_id: str | None, confirmed: bool | None
    ) -> ConfirmResult:
        """Save the session once the user explicitly confirmed (B-04).

        Idempotent on the normalised identity (ADR-004): an existing record is neither
        overwritten nor duplicated; the session then keeps its content as an update candidate.
        Unconfirmed fields are saved with their current values (D-03).
        """
        if confirmed is not True:
            raise ConfirmationRequiredError()
        session = self._load(session_id, browser_id)
        owner = session.browser_hash
        fields = ResumeFields.model_validate_json(session.fields_json)
        issues = validate_core_fields(fields.name.value, fields.phone.value, fields.email.value)
        if issues:
            raise ValidationFailedError(issues)
        identity = build_identity(
            fields.name.value or "", fields.phone.value or "", fields.email.value or ""
        )
        existing = self._find(identity)
        if existing is not None:
            return self._duplicate(session, existing)
        return self._save_new(session, owner, fields, identity)

    # ---- steps ---------------------------------------------------------------------------

    def _load(self, session_id: str, browser_id: str | None) -> SessionRecord:
        if browser_id is None:
            raise SessionNotFoundError()
        record = self._sessions.get(session_id, browser_hash(browser_id))
        if record is None:
            raise SessionNotFoundError()
        if record.status != "reviewing":
            raise SessionReadOnlyError()  # saved sessions change only through confirm-update
        return record

    def _find(self, identity: Identity) -> ResumeRef | None:
        return self._resumes.find_by_identity_key(
            identity.name_key, identity.phone_key, identity.email_key
        )

    def _save_new(
        self, session: SessionRecord, owner: str, fields: ResumeFields, identity: Identity
    ) -> ConfirmResult:
        resume_id = self._ids.new_id()
        ext = EXTENSIONS[session.content_type]
        raced = self._stage(session, identity, resume_id, ext)
        if raced is not None:
            return self._duplicate(session, raced)
        created_at = format_utc(self._clock.now())
        resume = self._build_resume(session, fields, identity, resume_id, ext, created_at)
        try:
            self._resumes.create_aggregate(resume)
        except DuplicateIdentityError as exc:
            self._discard_tmp(resume_id, ext)
            existing = self._find(identity)
            if existing is None:  # the conflicting record vanished: cannot happen, fail safe
                log_event("duplicate_vanished", level="error", exc=exc, resume_id=resume_id)
                raise SaveFailedError() from exc
            return self._duplicate(session, existing)
        except Exception as exc:
            if not self._committed(resume_id):
                self._discard_tmp(resume_id, ext)
            log_event("db_write_failed", level="error", exc=exc, resume_id=resume_id)
            raise SaveFailedError() from exc
        self._promote(resume_id, ext)
        self._finish(session, owner, resume_id)
        log_event("resume_saved", resume_id=resume_id, session_id=session.id)
        return ConfirmResult(resume_id, False, created_at)

    def _committed(self, resume_id: str) -> bool:
        """Whether the record is (or may be) committed. Unknown counts as committed: a kept
        tmp is rolled forward or removed by reconciliation, a deleted one cannot be restored."""
        try:
            return self._resumes.exists(resume_id)
        except Exception as exc:  # noqa: BLE001 - outcome unknown, keep the tmp
            log_event("commit_check_failed", level="error", exc=exc, resume_id=resume_id)
            return True

    def _stage(
        self, session: SessionRecord, identity: Identity, resume_id: str, ext: str
    ) -> ResumeRef | None:
        """Copy the session file to the tmp name; a record is returned only if one appeared."""
        source = self._resolve_source(session, resume_id)
        try:
            self._archive.stage(source, resume_id, ext)
        except FileNotFoundError as exc:
            self._discard_tmp(resume_id, ext)
            if source.exists():  # the archive side is missing, not the session file
                log_event("stage_failed", level="error", exc=exc, resume_id=resume_id)
                raise SaveFailedError() from exc
            return self._after_source_missing(session, identity, exc)
        except Exception as exc:
            self._discard_tmp(resume_id, ext)
            log_event("stage_failed", level="error", exc=exc, resume_id=resume_id)
            raise SaveFailedError() from exc
        return None

    def _resolve_source(self, session: SessionRecord, resume_id: str) -> Path:
        try:
            return self._draft_files.resolve(session.file_path or "")
        except ValueError as exc:
            log_event("stage_failed", level="error", exc=exc, resume_id=resume_id)
            raise SaveFailedError() from exc

    def _after_source_missing(
        self, session: SessionRecord, identity: Identity, cause: Exception
    ) -> ResumeRef:
        """The session file is gone: a concurrent request may have saved and finished it."""
        existing = self._find(identity)
        if existing is not None:
            return existing
        current = self._sessions.get(session.id, session.browser_hash)
        if current is None:
            raise SessionNotFoundError() from cause
        log_event("draft_file_missing", level="error", exc=cause, session_id=session.id)
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

    def _duplicate(self, session: SessionRecord, existing: ResumeRef) -> ConfirmResult:
        """Same identity already saved: keep the session as an update candidate and report it.

        Our own tmp is already gone. If the session has meanwhile been saved to this same
        record (a concurrent duplicate submission) that is the same outcome; any other state
        change is reported as such.
        """
        now = format_utc(self._clock.now())
        try:
            moved = self._sessions.mark_candidate_pending(
                session.id, session.browser_hash, existing.id, now
            )
        except _CLEANUP_ERRORS as exc:
            log_event("session_finish_failed", level="warning", exc=exc, session_id=session.id)
            moved = True  # the answer for the user is the same; the candidate is just not kept
        if not moved:
            current = self._sessions.get(session.id, session.browser_hash)
            if current is None:
                raise SessionNotFoundError()
            if not (current.status == "saved" and current.resume_id == existing.id):
                raise SessionReadOnlyError()
        log_event("resume_duplicate", resume_id=existing.id, session_id=session.id)
        return ConfirmResult(existing.id, True, existing.created_at)

    def _finish(self, session: SessionRecord, owner: str, resume_id: str) -> None:
        """Mark the session saved, then delete its temp file. Failures are logged only
        (a leftover file is swept at start-up; a session still reviewing re-confirms as a
        duplicate)."""
        now = format_utc(self._clock.now())
        try:
            self._sessions.mark_saved(session.id, owner, resume_id, now)
        except _CLEANUP_ERRORS as exc:
            log_event("session_finish_failed", level="warning", exc=exc, session_id=session.id)
            return  # keep the file: the session row still points at it
        try:
            self._draft_files.delete(session.file_path or "")
        except _CLEANUP_ERRORS as exc:
            log_event("draft_cleanup_failed", level="warning", exc=exc, session_id=session.id)

    def _discard_tmp(self, resume_id: str, ext: str) -> None:
        """Compensation must not mask the original failure: errors are only logged."""
        try:
            self._archive.discard_tmp(resume_id, ext)
        except _CLEANUP_ERRORS as exc:
            log_event("tmp_cleanup_failed", level="warning", exc=exc, resume_id=resume_id)

    @staticmethod
    def _build_resume(
        session: SessionRecord,
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
            original_filename=session.original_filename,
            content_type=session.content_type,
            file_size=session.file_size,
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

"""Fault injection for the B-05 tests (test assembly only; production code has no branches).

The injector is plugged in by *subclassing* the real collaborators, so ResumeService itself
is unchanged. ``SimulatedCrash`` derives from ``BaseException``: like a killed process it
skips every ``except Exception`` compensation in the service.
"""

import sqlite3
import threading
from pathlib import Path

from app.repositories.archive_file_store import ArchiveFileStore, tmp_name
from app.repositories.draft_file_store import DraftFileStore
from app.repositories.resume_repository import NewResume, ResumeRef, ResumeRepository
from app.repositories.session_repository import SessionRepository


class SimulatedCrash(BaseException):
    """Stands for a process crash: no later compensation code may run."""


class FaultInjector:
    """Arms named fault points; each armed point raises ``times`` times, then goes quiet."""

    def __init__(self) -> None:
        self._armed: dict[str, tuple[BaseException, int]] = {}
        self.hits: list[str] = []

    def arm(self, point: str, error: BaseException | None = None, times: int = 1) -> None:
        self._armed[point] = (error or OSError("injected fault"), times)

    def hit(self, point: str) -> None:
        self.hits.append(point)
        armed = self._armed.get(point)
        if armed is None:
            return
        error, remaining = armed
        if remaining <= 1:
            del self._armed[point]
        else:
            self._armed[point] = (error, remaining - 1)
        raise error


class FaultyArchiveStore(ArchiveFileStore):
    """Points: ``stage_mid_copy``, ``stage``, ``promote`` (before the rename)."""

    def __init__(self, file_dir: Path, injector: FaultInjector) -> None:
        super().__init__(file_dir)
        self.injector = injector

    def stage(self, source: Path, resume_id: str, ext: str) -> str:
        self.injector.hit("stage")
        try:
            self.injector.hit("stage_mid_copy")
        except BaseException:
            # A half-written tmp file, as left by a copy that died in the middle.
            (self._root / tmp_name(resume_id, ext)).write_bytes(b"partial")
            raise
        return super().stage(source, resume_id, ext)

    def promote(self, resume_id: str, ext: str) -> str:
        self.injector.hit("promote")
        return super().promote(resume_id, ext)


class FaultyResumeRepository(ResumeRepository):
    """Points: ``db_before`` (crash before the transaction), ``db_after_main``,
    ``db_after_sub`` (inside the transaction), ``db_after_commit`` (after COMMIT).

    ``gate`` lets a test hold every thread after its first duplicate pre-check, so that two
    requests both pass the check and race for the unique index.
    """

    def __init__(self, db_path: Path, injector: FaultInjector) -> None:
        super().__init__(db_path)
        self.injector = injector
        self.gate: threading.Barrier | None = None
        self._local = threading.local()

    def find_by_identity_key(
        self, name_key: str, phone_key: str, email_key: str
    ) -> ResumeRef | None:
        found = super().find_by_identity_key(name_key, phone_key, email_key)
        if self.gate is not None and not getattr(self._local, "passed", False):
            self._local.passed = True
            self.gate.wait(timeout=10)
        return found

    def create_aggregate(self, resume: NewResume) -> None:
        self.injector.hit("db_before")
        super().create_aggregate(resume)
        self.injector.hit("db_after_commit")

    def _insert_main(self, conn: sqlite3.Connection, r: NewResume) -> None:  # type: ignore[override]
        super()._insert_main(conn, r)
        self.injector.hit("db_after_main")

    def _insert_sub_rows(  # type: ignore[override]
        self, conn: sqlite3.Connection, r: NewResume, created_at: str, updated_at: str
    ) -> None:
        super()._insert_sub_rows(conn, r, created_at, updated_at)
        self.injector.hit("db_after_sub")


class FaultySessionRepository(SessionRepository):
    """Points: ``session_mark_saved``, ``session_mark_candidate`` (before the statement)."""

    def __init__(self, db_path: Path, injector: FaultInjector) -> None:
        super().__init__(db_path)
        self.injector = injector

    def mark_saved(self, session_id: str, browser_hash: str, resume_id: str, now: str) -> bool:
        self.injector.hit("session_mark_saved")
        return super().mark_saved(session_id, browser_hash, resume_id, now)

    def mark_candidate_pending(
        self, session_id: str, browser_hash: str, resume_id: str, now: str
    ) -> bool:
        self.injector.hit("session_mark_candidate")
        return super().mark_candidate_pending(session_id, browser_hash, resume_id, now)


class FaultyDraftFileStore(DraftFileStore):
    """Point: ``draft_file_delete``."""

    def __init__(self, data_dir: Path, injector: FaultInjector) -> None:
        super().__init__(data_dir)
        self.injector = injector

    def delete(self, name: str) -> bool:
        self.injector.hit("draft_file_delete")
        return super().delete(name)

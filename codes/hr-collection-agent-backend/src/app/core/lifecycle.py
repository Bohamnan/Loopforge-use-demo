"""Application start-up and shutdown (design 5.4, ADR-005).

Start-up order, fixed and synchronous (everything finishes before the first request):

1. create ``DATA_DIR``, ``DATA_DIR/drafts`` and ``FILE_DIR``
2. initialise both SQLite databases (reconciliation must see the real records, never a
   freshly created empty database)
3. reconcile the archive directory (``ReconcileService.run``)
4. clean up drafts once (``CleanupService.run_once``)
5. start the cleanup scheduler thread

Steps 1 and 2 may stop the start-up (the service cannot work without them). Steps 3 and 4 never
do: their failures are logged and the service starts anyway.

Only a single process with a single worker is supported (``uvicorn --workers 1``). Reconciliation
deletes files that have no record, which is only safe while no other process is saving. It runs
exactly once, here, before requests are accepted, in the starting thread. It is not a runtime
service: the scheduler thread only runs ``CleanupService``.
"""

import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.clock import Clock
from app.core.config import Settings
from app.core.db import init_drafts_db, init_resumes_db
from app.core.logging import log_event
from app.repositories.archive_file_store import ArchiveFileStore
from app.repositories.draft_file_store import DraftFileStore
from app.repositories.draft_repository import DraftRepository
from app.repositories.resume_repository import ResumeRepository
from app.services.cleanup_service import CleanupService
from app.services.reconcile_service import ReconcileService

STOP_JOIN_TIMEOUT_SECONDS = 5.0


class Lifecycle:
    """Runs the start-up sequence and owns the cleanup scheduler thread.

    Every step is a separate method so tests can replace single steps with recording fakes.
    ``interval_seconds`` overrides ``CLEANUP_INTERVAL_SECONDS`` (tests use tiny values).
    """

    def __init__(
        self, settings: Settings, clock: Clock, interval_seconds: float | None = None
    ) -> None:
        self._settings = settings
        self._clock = clock
        self._interval = (
            float(settings.cleanup_interval_seconds)
            if interval_seconds is None
            else interval_seconds
        )
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        """Run the start-up sequence in order; returns when the service may accept requests."""
        self.prepare_directories()
        self.init_databases()
        self.reconcile()
        self.cleanup()
        self.start_scheduler()

    def stop(self) -> None:
        """Stop the scheduler thread (idempotent)."""
        self._stop.set()
        thread, self._thread = self._thread, None
        if thread is not None:
            thread.join(timeout=STOP_JOIN_TIMEOUT_SECONDS)
            if thread.is_alive():
                log_event("scheduler_stop_timeout", level="warning")

    # ---- steps ---------------------------------------------------------------------------

    def prepare_directories(self) -> None:
        self._settings.data_dir.mkdir(parents=True, exist_ok=True)
        (self._settings.data_dir / "drafts").mkdir(exist_ok=True)
        self._settings.file_dir.mkdir(parents=True, exist_ok=True)

    def init_databases(self) -> None:
        init_drafts_db(self._settings.data_dir / "drafts.db")
        init_resumes_db(self._settings.data_dir / "resumes.db")

    def reconcile(self) -> None:
        """One synchronous reconciliation; a failure is logged and never stops the start."""
        try:
            ReconcileService(
                ResumeRepository(self._settings.data_dir / "resumes.db"),
                ArchiveFileStore(self._settings.file_dir),
                self._clock,
            ).run()
        except Exception as exc:  # noqa: BLE001 - reconcile failure must not block start-up
            log_event("reconcile_failed", level="error", exc=exc)

    def cleanup(self) -> None:
        """One cleanup run; a failure is logged and never stops the thread or the start."""
        try:
            CleanupService(
                DraftRepository(self._settings.data_dir / "drafts.db"),
                DraftFileStore(self._settings.data_dir),
                self._clock,
                self._settings.draft_ttl_days,
            ).run_once()
        except Exception as exc:  # noqa: BLE001 - the scheduler must survive any failure
            log_event("cleanup_failed", level="error", exc=exc)

    def start_scheduler(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(target=self._schedule, name="draft-cleanup", daemon=True)
        self._thread.start()

    def _schedule(self) -> None:
        """Wait one interval, clean up, repeat; ``stop`` wakes the wait immediately."""
        while not self._stop.wait(self._interval):
            self.cleanup()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """FastAPI lifespan: the whole start-up sequence completes before the first request."""
    lifecycle: Lifecycle = app.state.lifecycle
    lifecycle.start()
    try:
        yield
    finally:
        lifecycle.stop()

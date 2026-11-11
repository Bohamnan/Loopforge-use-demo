"""Application start-up (design 5.4, ADR-005, ADR-008). There is no background thread.

Start-up order, fixed and synchronous (everything finishes before the first request):

1. create ``DATA_DIR``, ``DATA_DIR/drafts`` and ``FILE_DIR``
2. initialise both SQLite databases (``drafts.db`` is upgraded to v2; reconciliation must see
   the real records, never a freshly created empty database)
3. reconcile the archive directory (``ReconcileService.run``)
4. sweep orphaned session files once (``OrphanSweepService.run_once``)

Reconciliation and sweep failures are logged and never stop the start; failing to create the
directories or to initialise a database does. Only a single process with a single worker is
supported (``uvicorn --workers 1``).
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.clock import Clock
from app.core.config import Settings
from app.core.db import init_drafts_db, init_resumes_db
from app.core.logging import log_event
from app.repositories.archive_file_store import ArchiveFileStore
from app.repositories.draft_file_store import DraftFileStore
from app.repositories.resume_repository import ResumeRepository
from app.repositories.session_repository import SessionRepository
from app.services.orphan_sweep_service import OrphanSweepService
from app.services.reconcile_service import ReconcileService


class Lifecycle:
    """Runs the start-up sequence. Every step is a method so tests can replace single steps."""

    def __init__(self, settings: Settings, clock: Clock) -> None:
        self._settings = settings
        self._clock = clock

    def start(self) -> None:
        """Run the start-up sequence in order; returns when the service may accept requests."""
        self.prepare_directories()
        self.init_databases()
        self.reconcile()
        self.sweep_orphans()

    def stop(self) -> None:
        """Nothing to stop: there is no background thread."""

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

    def sweep_orphans(self) -> None:
        """One sweep of unreferenced session files; a failure is logged, never stops the start."""
        try:
            OrphanSweepService(
                SessionRepository(self._settings.data_dir / "drafts.db"),
                DraftFileStore(self._settings.data_dir),
                self._clock,
            ).run_once()
        except Exception as exc:  # noqa: BLE001 - sweep failure must not block start-up
            log_event("orphan_sweep_failed", level="error", exc=exc)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """FastAPI lifespan: the whole start-up sequence completes before the first request."""
    lifecycle: Lifecycle = app.state.lifecycle
    lifecycle.start()
    try:
        yield
    finally:
        lifecycle.stop()

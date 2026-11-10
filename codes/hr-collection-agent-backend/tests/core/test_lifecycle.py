"""Start-up sequence and cleanup scheduler (task 2.7).

The order is pinned with a recording fake of the single steps. Waiting for the scheduler uses
threading events (never ``sleep`` polling).
"""

import logging
import re
import threading
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.db import connect, init_resumes_db
from app.core.lifecycle import Lifecycle
from app.main import create_app
from app.repositories.resume_repository import ResumeRepository
from tests.fakes import FakeClock
from tests.repositories.test_resume_repository import make_resume

WAIT = 10  # seconds; only an upper bound for a hung test, never slept in full


class RecordingLifecycle(Lifecycle):
    """Real ``start``/``stop``/scheduler, fake steps that only record what ran and where."""

    def __init__(self, settings: Settings, **kwargs: object) -> None:
        super().__init__(settings, FakeClock(), **kwargs)  # type: ignore[arg-type]
        self.calls: list[str] = []
        self.threads: dict[str, int] = {}
        self.tick = threading.Event()
        self.cleanup_runs = 0

    def _note(self, name: str) -> None:
        self.calls.append(name)
        self.threads[name] = threading.get_ident()

    def prepare_directories(self) -> None:
        self._note("dirs")

    def init_databases(self) -> None:
        self._note("init")

    def reconcile(self) -> None:
        self._note("reconcile")

    def cleanup(self) -> None:
        self.cleanup_runs += 1
        self._note("cleanup")
        self.tick.set()

    def start_scheduler(self) -> None:
        self._note("scheduler")
        super().start_scheduler()


@pytest.fixture
def settings(data_dir: Path, file_dir: Path) -> Settings:
    return Settings(_env_file=None, data_dir=data_dir, file_dir=file_dir)


def test_start_order_is_dirs_init_reconcile_cleanup_scheduler(settings: Settings) -> None:
    life = RecordingLifecycle(settings, interval_seconds=3600)
    life.start()
    try:
        assert life.calls == ["dirs", "init", "reconcile", "cleanup", "scheduler"]
    finally:
        life.stop()


def test_reconcile_runs_synchronously_in_the_starting_thread(settings: Settings) -> None:
    life = RecordingLifecycle(settings, interval_seconds=3600)
    life.start()
    try:
        main = threading.get_ident()
        assert life.threads["reconcile"] == main and life.threads["cleanup"] == main
        assert life.cleanup_runs == 1  # the scheduler has not run anything yet
    finally:
        life.stop()


def test_requests_start_after_the_whole_sequence(settings: Settings) -> None:
    life = RecordingLifecycle(settings, interval_seconds=3600)
    app = create_app(settings, lifecycle=life)

    @app.get("/t/probe")
    def probe() -> dict:
        life.calls.append("request")
        return {}

    with TestClient(app) as client:
        client.get("/t/probe")
    life.calls.append("closed")

    assert life.calls == ["dirs", "init", "reconcile", "cleanup", "scheduler", "request", "closed"]


def test_reconcile_is_called_once_even_when_the_scheduler_ticks(settings: Settings) -> None:
    life = RecordingLifecycle(settings, interval_seconds=0.001)
    life.start()
    try:
        for _ in range(3):
            life.tick.clear()
            assert life.tick.wait(WAIT)
    finally:
        life.stop()
    assert life.calls.count("reconcile") == 1 and life.calls.count("init") == 1
    assert life.cleanup_runs >= 3


def test_only_the_lifecycle_module_uses_the_reconcile_service() -> None:
    src = Path(__file__).resolve().parents[2] / "src" / "app"
    users = {
        p.relative_to(src).as_posix()
        for p in src.rglob("*.py")
        if re.search(r"^(?:from|import) app\.services\.reconcile_service", p.read_text(), re.M)
    }
    assert users == {"core/lifecycle.py"}, users


# ---- scheduler --------------------------------------------------------------------------------


def test_scheduler_cleans_again_after_the_interval(settings: Settings) -> None:
    life = RecordingLifecycle(settings, interval_seconds=0.001)
    life.start()
    try:
        assert life.cleanup_runs >= 1
        life.tick.clear()
        assert life.tick.wait(WAIT)
        assert life.threads["cleanup"] != threading.get_ident()  # ran in the scheduler thread
    finally:
        life.stop()


def test_stop_joins_the_scheduler_thread(settings: Settings) -> None:
    life = RecordingLifecycle(settings, interval_seconds=3600)  # would sleep for an hour
    life.start()
    thread = life._thread
    assert thread is not None and thread.is_alive() and thread.daemon

    life.stop()

    assert not thread.is_alive()
    life.stop()  # idempotent


def test_testclient_with_block_starts_and_stops_without_leaking_threads(
    settings: Settings,
) -> None:
    before = {t.name for t in threading.enumerate()}
    with TestClient(create_app(settings)):
        assert "draft-cleanup" in {t.name for t in threading.enumerate()}
    assert "draft-cleanup" not in {t.name for t in threading.enumerate()} - before


# ---- real steps -------------------------------------------------------------------------------


def test_real_start_creates_directories_and_databases(tmp_path: Path) -> None:
    settings = Settings(_env_file=None, data_dir=tmp_path / "d", file_dir=tmp_path / "f")
    with TestClient(create_app(settings)):
        assert (tmp_path / "d" / "drafts").is_dir() and (tmp_path / "f").is_dir()
        for name in ("drafts.db", "resumes.db"):
            conn = connect(tmp_path / "d" / name)
            assert conn.execute("PRAGMA user_version").fetchone()[0] == 1
            conn.close()


def test_real_start_reconciles_before_the_first_request(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    init_resumes_db(settings.data_dir / "resumes.db")
    rid = "00000000-0000-4000-8000-000000000001"
    ResumeRepository(settings.data_dir / "resumes.db").create_aggregate(make_resume(1))
    (settings.file_dir / f".{rid}.pdf.tmp").write_bytes(b"%PDF-1.4 kept")  # crash leftover
    (settings.file_dir / ".00000000-0000-4000-8000-000000000002.pdf.tmp").write_bytes(b"x")

    with TestClient(create_app(settings)):
        # No request has been made yet: the archive is already repaired.
        assert sorted(p.name for p in settings.file_dir.iterdir()) == [f"{rid}.pdf"]
        assert (settings.file_dir / f"{rid}.pdf").read_bytes() == b"%PDF-1.4 kept"

    assert any("reconcile_done" in r.getMessage() for r in caplog.records)


def test_real_start_with_missing_database_never_wipes_the_archive(settings: Settings) -> None:
    """Databases are initialised first; an empty resumes.db must not delete archived files."""
    final = settings.file_dir / "00000000-0000-4000-8000-000000000001.pdf"
    final.write_bytes(b"%PDF-1.4 precious")

    with TestClient(create_app(settings)):
        pass

    assert final.read_bytes() == b"%PDF-1.4 precious"


def test_real_start_cleans_expired_drafts_before_the_first_request(settings: Settings) -> None:
    from app.core.db import init_drafts_db
    from app.repositories.draft_repository import DraftRecord, DraftRepository

    init_drafts_db(settings.data_dir / "drafts.db")
    (settings.data_dir / "drafts").mkdir(exist_ok=True)
    name = "00000000-0000-4000-8000-0000000000aa.pdf"
    (settings.data_dir / "drafts" / name).write_bytes(b"%PDF-1.4")
    DraftRepository(settings.data_dir / "drafts.db").insert(
        DraftRecord("d1", "h" * 64, name, "x.pdf", "application/pdf", 8, "{}",
                    "2000-01-01T00:00:00Z", "2000-01-01T00:00:00Z", "2000-01-01T00:00:00Z")
    )  # fmt: skip

    with TestClient(create_app(settings)):
        assert not (settings.data_dir / "drafts" / name).exists()
        assert (
            connect(settings.data_dir / "drafts.db")
            .execute("SELECT count(*) FROM drafts")
            .fetchone()[0]
            == 0
        )


def test_requests_and_start_up_share_the_same_directories(settings: Settings) -> None:
    app: FastAPI = create_app(settings)
    assert app.state.lifecycle._settings is app.state.settings


# ---- failures do not block the start ----------------------------------------------------------


def test_reconcile_failure_does_not_block_start_and_is_logged(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    import app.core.lifecycle as module

    class Broken:
        def __init__(self, *args: object) -> None:
            raise RuntimeError("cannot build")

    monkeypatch.setattr(module, "ReconcileService", Broken)
    cleaned: list[int] = []
    monkeypatch.setattr(Lifecycle, "cleanup", lambda self: cleaned.append(1))

    with TestClient(create_app(settings)) as client:
        assert client.get("/nope").status_code == 404  # serving

    assert cleaned  # later steps still ran
    assert any(
        r.levelno >= logging.ERROR and "RuntimeError" in r.getMessage() for r in caplog.records
    )


def test_cleanup_failure_does_not_block_start_and_does_not_kill_the_thread(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    import app.core.lifecycle as module

    runs = threading.Semaphore(0)

    class Broken:
        def __init__(self, *args: object) -> None:
            pass

        def run_once(self) -> None:
            runs.release()
            raise RuntimeError("cleanup broke")

    monkeypatch.setattr(module, "CleanupService", Broken)
    life = Lifecycle(settings, FakeClock(), interval_seconds=0.001)

    with TestClient(create_app(settings, lifecycle=life)):
        for _ in range(3):  # start-up run + two scheduler runs: the thread outlived the errors
            assert runs.acquire(timeout=WAIT)

    assert any("cleanup_failed" in r.getMessage() for r in caplog.records)


def test_database_initialisation_failure_stops_the_start(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.core.lifecycle as module

    def broken(path: Path) -> None:
        raise RuntimeError("schema too new")

    monkeypatch.setattr(module, "init_resumes_db", broken)

    with pytest.raises(RuntimeError), TestClient(create_app(settings)):
        pass  # pragma: no cover

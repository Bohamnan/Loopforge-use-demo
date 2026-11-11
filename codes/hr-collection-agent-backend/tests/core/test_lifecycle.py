"""Start-up sequence (task 2.7): dirs -> init -> reconcile -> orphan sweep, no threads.

The order is pinned with a recording fake of the single steps.
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

ORDER = ["dirs", "init", "reconcile", "sweep"]


class RecordingLifecycle(Lifecycle):
    """Real ``start``/``stop``, fake steps that only record what ran and where."""

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings, FakeClock())
        self.calls: list[str] = []
        self.threads: dict[str, int] = {}

    def _note(self, name: str) -> None:
        self.calls.append(name)
        self.threads[name] = threading.get_ident()

    def prepare_directories(self) -> None:
        self._note("dirs")

    def init_databases(self) -> None:
        self._note("init")

    def reconcile(self) -> None:
        self._note("reconcile")

    def sweep_orphans(self) -> None:
        self._note("sweep")


@pytest.fixture
def settings(data_dir: Path, file_dir: Path) -> Settings:
    return Settings(_env_file=None, data_dir=data_dir, file_dir=file_dir)


def test_start_order_is_dirs_init_reconcile_sweep_and_runs_in_the_calling_thread(
    settings: Settings,
) -> None:
    life = RecordingLifecycle(settings)
    life.start()
    assert life.calls == ORDER
    assert set(life.threads.values()) == {threading.get_ident()}


def test_requests_start_after_the_whole_sequence_and_no_thread_is_left(
    settings: Settings,
) -> None:
    life = RecordingLifecycle(settings)
    app = create_app(settings, lifecycle=life)

    @app.get("/t/probe")
    def probe() -> dict:
        life.calls.append("request")
        return {}

    with TestClient(app) as client:
        client.get("/t/probe")
    life.calls.append("closed")

    assert life.calls == [*ORDER, "request", "closed"]
    assert not any("cleanup" in t.name for t in threading.enumerate())  # no scheduler thread


def test_only_the_lifecycle_module_uses_the_reconcile_service() -> None:
    src = Path(__file__).resolve().parents[2] / "src" / "app"
    users = {
        p.relative_to(src).as_posix()
        for p in src.rglob("*.py")
        if re.search(r"^(?:from|import) app\.services\.reconcile_service", p.read_text(), re.M)
    }
    assert users == {"core/lifecycle.py"}, users


def test_real_start_creates_directories_and_databases_at_their_versions(tmp_path: Path) -> None:
    settings = Settings(_env_file=None, data_dir=tmp_path / "d", file_dir=tmp_path / "f")
    with TestClient(create_app(settings)):
        assert (tmp_path / "d" / "drafts").is_dir() and (tmp_path / "f").is_dir()
        for name, version in (("drafts.db", 2), ("resumes.db", 1)):
            conn = connect(tmp_path / "d" / name)
            assert conn.execute("PRAGMA user_version").fetchone()[0] == version
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


def test_real_start_sweeps_old_orphans_but_never_the_archive(settings: Settings) -> None:
    import os

    drafts = settings.data_dir / "drafts"
    drafts.mkdir(parents=True)
    orphan = drafts / "99999999-0000-4000-8000-000000000001.pdf"
    orphan.write_bytes(b"x")
    os.utime(orphan, (1, 1))  # ancient
    archived = settings.file_dir / "99999999-0000-4000-8000-000000000001.pdf"
    archived.write_bytes(b"%PDF-1.4 final")
    os.utime(archived, (1, 1))

    with TestClient(create_app(settings)):
        assert not orphan.exists()  # swept before the first request
        assert archived.read_bytes() == b"%PDF-1.4 final"  # reconcile keeps it (no records)


def test_requests_and_start_up_share_the_same_directories(settings: Settings) -> None:
    app: FastAPI = create_app(settings)
    assert app.state.lifecycle._settings is app.state.settings


def test_reconcile_and_sweep_failures_do_not_block_start_and_are_logged(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    import app.core.lifecycle as module

    class Broken:
        def __init__(self, *args: object) -> None:
            raise RuntimeError("cannot build")

    monkeypatch.setattr(module, "ReconcileService", Broken)
    monkeypatch.setattr(module, "OrphanSweepService", Broken)

    with TestClient(create_app(settings)) as client:
        assert client.get("/nope").status_code == 404  # serving

    text = "\n".join(r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR)
    assert "reconcile_failed" in text and "orphan_sweep_failed" in text


def test_database_initialisation_failure_stops_the_start(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.core.lifecycle as module

    def broken(path: Path) -> None:
        raise RuntimeError("schema too new")

    monkeypatch.setattr(module, "init_resumes_db", broken)

    with pytest.raises(RuntimeError), TestClient(create_app(settings)):
        pass  # pragma: no cover

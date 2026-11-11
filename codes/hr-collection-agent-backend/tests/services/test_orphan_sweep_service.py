"""OrphanSweepService: only unreferenced draft files older than one day, never file/ (2.6)."""

import logging
import os
from pathlib import Path

import pytest

from app.services.orphan_sweep_service import OrphanSweepService, SweepReport
from tests.services.conftest import BROWSER_A, SessionEnv, make_upload

DAY = 86400


def sweeper(env: SessionEnv) -> OrphanSweepService:
    return OrphanSweepService(env.sessions, env.files, env.clock)


def put_file(env: SessionEnv, name: str, age_seconds: float) -> Path:
    path = env.data_dir / "drafts" / name
    path.write_bytes(b"orphan")
    stamp = env.clock.now().timestamp() - age_seconds
    os.utime(path, (stamp, stamp))
    return path


def orphan(n: int) -> str:
    return f"99999999-0000-4000-8000-{n:012d}.pdf"


def test_unreferenced_files_are_deleted_only_after_one_day(session_env: SessionEnv) -> None:
    old = put_file(session_env, orphan(1), DAY + 1)
    edge = put_file(session_env, orphan(2), DAY)
    fresh = put_file(session_env, orphan(3), 60)

    report = sweeper(session_env).run_once()

    assert not old.exists() and edge.exists() and fresh.exists()
    assert report == SweepReport(orphans_removed=1)
    assert sweeper(session_env).run_once() == SweepReport()  # idempotent


def test_a_file_referenced_by_a_session_is_kept_however_old(session_env: SessionEnv) -> None:
    sid = session_env.service.create(make_upload(), BROWSER_A).detail.session_id
    session_env.clock.advance(days=400)
    path = session_env.data_dir / "drafts" / f"{sid}.pdf"
    os.utime(path, (1, 1))

    assert sweeper(session_env).run_once() == SweepReport()
    assert path.exists()


def test_archive_directory_is_never_changed(session_env: SessionEnv) -> None:
    put_file(session_env, orphan(1), 5 * DAY)
    archive = {orphan(1): b"same name as a draft orphan", ".x.pdf.tmp": b"tmp"}
    for name, data in archive.items():
        path = session_env.file_dir / name
        path.write_bytes(data)
        os.utime(path, (1, 1))  # ancient: would go if treated as an orphan

    assert sweeper(session_env).run_once().orphans_removed == 1
    assert {p.name: p.read_bytes() for p in session_env.file_dir.iterdir()} == archive


def test_unrecognised_files_and_symlinks_are_left_alone(
    session_env: SessionEnv, tmp_path: Path
) -> None:
    notes = put_file(session_env, "notes.txt", 5 * DAY)
    outside = tmp_path / "outside.pdf"
    outside.write_bytes(b"x")
    link = session_env.data_dir / "drafts" / orphan(4)
    link.symlink_to(outside)

    assert sweeper(session_env).run_once().failed == 0
    assert notes.exists() and link.is_symlink() and outside.exists()


def test_unreadable_reference_list_means_nothing_is_deleted(
    session_env: SessionEnv, monkeypatch: pytest.MonkeyPatch
) -> None:
    victim = put_file(session_env, orphan(1), 5 * DAY)

    def broken() -> set:
        raise OSError("db locked")

    monkeypatch.setattr(session_env.sessions, "list_file_paths", broken)

    assert sweeper(session_env).run_once().failed == 1
    assert victim.exists()


def test_one_failing_deletion_does_not_stop_the_others_and_logs_only_counts(
    session_env: SessionEnv, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    put_file(session_env, orphan(1), 5 * DAY)
    put_file(session_env, orphan(2), 5 * DAY)
    real = session_env.files.delete

    def flaky(name: str) -> bool:
        if name == orphan(1):
            raise OSError("busy")
        return real(name)

    monkeypatch.setattr(session_env.files, "delete", flaky)

    report = sweeper(session_env).run_once()

    assert (report.orphans_removed, report.failed) == (1, 1)
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert "orphan_sweep_done" in text and orphan(1) not in text

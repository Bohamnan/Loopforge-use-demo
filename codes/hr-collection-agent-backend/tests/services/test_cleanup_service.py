"""Draft cleanup (task 2.6): expired drafts, then orphan files in the drafts directory.

The clock is a FakeClock, file times are set with ``os.utime`` relative to it. Every case checks
the ``drafts`` row count and the directory listing, and that ``file/`` never changes.
"""

import logging
import os
import re
from pathlib import Path

import pytest

import app.services.cleanup_service as cleanup_module
from app.services.cleanup_service import CleanupReport, CleanupService
from tests.services.conftest import DraftEnv, make_upload

DAY = 86400


def cleanup(env: DraftEnv) -> CleanupService:
    return CleanupService(env.repo, env.files, env.clock, ttl_days=7)


def drafts_dir(env: DraftEnv) -> Path:
    return env.data_dir / "drafts"


def put_file(env: DraftEnv, name: str, age_seconds: float) -> Path:
    """An unreferenced file whose mtime is ``age_seconds`` before the fake now."""
    path = drafts_dir(env) / name
    path.write_bytes(b"orphan")
    stamp = env.clock.now().timestamp() - age_seconds
    os.utime(path, (stamp, stamp))
    return path


def orphan_name(n: int) -> str:
    return f"99999999-0000-4000-8000-{n:012d}.pdf"


def set_mtime(env: DraftEnv, path: Path, age_seconds: float) -> None:
    stamp = env.clock.now().timestamp() - age_seconds
    os.utime(path, (stamp, stamp))


# ---- step 1: expired drafts -------------------------------------------------------------------


def test_exactly_seven_days_is_kept_and_one_second_more_is_deleted(draft_env: DraftEnv) -> None:
    draft_env.service.create(make_upload(), None)
    assert len(draft_env.draft_rows()) == 1 and len(draft_env.draft_files()) == 1

    draft_env.clock.advance(days=7)
    first = cleanup(draft_env).run_once()
    assert (len(draft_env.draft_rows()), len(draft_env.draft_files())) == (1, 1)
    assert first.expired_removed == 0

    draft_env.clock.advance(seconds=1)
    second = cleanup(draft_env).run_once()
    assert (len(draft_env.draft_rows()), len(draft_env.draft_files())) == (0, 0)
    assert second.expired_removed == 1 and second.failed == 0


def test_activity_keeps_a_draft_alive(draft_env: DraftEnv) -> None:
    created = draft_env.service.create(make_upload(), None)
    draft_env.clock.advance(days=6)
    draft_env.service.get(created.token)  # refreshes last_active_at
    draft_env.clock.advance(days=6)

    cleanup(draft_env).run_once()

    assert len(draft_env.draft_rows()) == 1 and len(draft_env.draft_files()) == 1


def test_only_expired_drafts_are_removed(draft_env: DraftEnv) -> None:
    draft_env.service.create(make_upload(), None)  # old
    draft_env.service.create(make_upload(), None)
    draft_env.clock.advance(days=8)
    draft_env.service.create(make_upload(), None)  # fresh
    assert len(draft_env.draft_rows()) == 3

    report = cleanup(draft_env).run_once()

    assert report.expired_removed == 2
    assert len(draft_env.draft_rows()) == 1 and len(draft_env.draft_files()) == 1
    assert draft_env.draft_files() == {r["file_path"] for r in draft_env.draft_rows()}


def test_rows_are_deleted_before_their_files(
    draft_env: DraftEnv, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A crash between the two steps may leave an orphan file, never a row without a file."""
    draft_env.service.create(make_upload(), None)
    draft_env.clock.advance(days=8)
    seen: list[int] = []
    real = draft_env.files.delete

    def spy(name: str) -> bool:
        seen.append(len(draft_env.draft_rows()))  # row count at the moment of file deletion
        return real(name)

    monkeypatch.setattr(draft_env.files, "delete", spy)

    cleanup(draft_env).run_once()

    assert seen == [0]


def test_file_delete_failure_is_logged_not_raised_and_orphan_sweep_finishes_it(
    draft_env: DraftEnv, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    draft_env.service.create(make_upload(), None)
    draft_env.service.create(make_upload(), None)
    draft_env.clock.advance(days=8)
    for path in drafts_dir(draft_env).iterdir():  # real mtimes are "now", not fake-clock based
        set_mtime(draft_env, path, 0)
    real = draft_env.files.delete
    calls: list[str] = []

    def flaky(name: str) -> bool:
        calls.append(name)
        if len(calls) == 1:
            raise PermissionError("denied")
        return real(name)

    monkeypatch.setattr(draft_env.files, "delete", flaky)

    report = cleanup(draft_env).run_once()  # must not raise

    assert len(draft_env.draft_rows()) == 0  # both rows gone
    assert len(draft_env.draft_files()) == 1  # one file left behind
    assert report.expired_removed == 2 and report.failed == 1
    assert any(r.levelno >= logging.WARNING and "PermissionError" in r.getMessage()
               for r in caplog.records)  # fmt: skip

    monkeypatch.setattr(draft_env.files, "delete", real)
    draft_env.clock.advance(days=2)  # the leftover is now an orphan older than 1 day
    again = cleanup(draft_env).run_once()
    assert again.orphans_removed == 1 and draft_env.draft_files() == set()


# ---- step 2: orphan files ---------------------------------------------------------------------


def test_orphan_window_is_one_day(draft_env: DraftEnv) -> None:
    fresh = put_file(draft_env, orphan_name(1), 0)  # e.g. an upload in progress
    edge = put_file(draft_env, orphan_name(2), DAY)  # exactly one day: kept
    old = put_file(draft_env, orphan_name(3), DAY + 1)

    report = cleanup(draft_env).run_once()

    assert fresh.exists() and edge.exists() and not old.exists()
    assert report.orphans_removed == 1
    assert len(draft_env.draft_rows()) == 0  # no rows were involved


def test_referenced_file_is_never_an_orphan_however_old(draft_env: DraftEnv) -> None:
    draft_env.service.create(make_upload(), None)
    (name,) = draft_env.draft_files()
    set_mtime(draft_env, drafts_dir(draft_env) / name, 3 * DAY)  # old file, active row

    report = cleanup(draft_env).run_once()

    assert draft_env.draft_files() == {name} and len(draft_env.draft_rows()) == 1
    assert report == CleanupReport()


def test_orphan_deletion_failure_does_not_stop_the_others(
    draft_env: DraftEnv, monkeypatch: pytest.MonkeyPatch
) -> None:
    paths = [put_file(draft_env, orphan_name(n), 2 * DAY) for n in (1, 2, 3)]
    real = draft_env.files.delete

    def flaky(name: str) -> bool:
        if name == orphan_name(2):
            raise OSError("busy")
        return real(name)

    monkeypatch.setattr(draft_env.files, "delete", flaky)

    report = cleanup(draft_env).run_once()

    assert [p.exists() for p in paths] == [False, True, False]
    assert report.orphans_removed == 2 and report.failed == 1


def test_unrecognised_files_and_symlinks_are_left_alone(
    draft_env: DraftEnv, tmp_path: Path
) -> None:
    notes = put_file(draft_env, "notes.txt", 5 * DAY)
    outside = tmp_path / "outside.pdf"
    outside.write_bytes(b"x")
    link = drafts_dir(draft_env) / orphan_name(4)
    link.symlink_to(outside)

    report = cleanup(draft_env).run_once()

    assert notes.exists() and link.is_symlink() and outside.exists()
    assert report.failed == 0


def test_cleanup_is_idempotent(draft_env: DraftEnv) -> None:
    draft_env.service.create(make_upload(), None)
    put_file(draft_env, orphan_name(1), 2 * DAY)
    draft_env.clock.advance(days=8)

    cleanup(draft_env).run_once()
    state = (draft_env.draft_files(), len(draft_env.draft_rows()))

    assert cleanup(draft_env).run_once() == CleanupReport()
    assert (draft_env.draft_files(), len(draft_env.draft_rows())) == state == (set(), 0)


# ---- failures of the databases ----------------------------------------------------------------


def test_database_failure_when_deleting_rows_is_contained(
    draft_env: DraftEnv, monkeypatch: pytest.MonkeyPatch
) -> None:
    draft_env.service.create(make_upload(), None)
    draft_env.clock.advance(days=8)

    def broken(cutoff: str) -> list[str]:
        raise RuntimeError("database is locked")

    monkeypatch.setattr(draft_env.repo, "delete_expired", broken)

    report = cleanup(draft_env).run_once()  # does not raise

    assert report.failed >= 1
    assert len(draft_env.draft_rows()) == 1 and len(draft_env.draft_files()) == 1


def test_unreadable_row_list_means_no_orphan_is_deleted(
    draft_env: DraftEnv, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Without the referenced-file list every file would look like an orphan."""
    draft_env.service.create(make_upload(), None)
    (name,) = draft_env.draft_files()
    set_mtime(draft_env, drafts_dir(draft_env) / name, 5 * DAY)
    put_file(draft_env, orphan_name(1), 5 * DAY)

    def broken() -> set[str]:
        raise RuntimeError("database is locked")

    monkeypatch.setattr(draft_env.repo, "list_file_paths", broken)

    report = cleanup(draft_env).run_once()

    assert len(draft_env.draft_files()) == 2 and report.failed >= 1


def test_unreadable_directory_is_contained(
    draft_env: DraftEnv, monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken() -> list:
        raise PermissionError("denied")

    monkeypatch.setattr(draft_env.files, "list_files", broken)

    assert cleanup(draft_env).run_once().failed >= 1


# ---- file/ is never touched -------------------------------------------------------------------


def test_archive_directory_is_never_changed(draft_env: DraftEnv, file_dir: Path) -> None:
    draft_env.service.create(make_upload(), None)
    put_file(draft_env, orphan_name(1), 5 * DAY)
    archive = {
        "00000000-0000-4000-8000-0000000000aa.pdf": b"final",
        ".00000000-0000-4000-8000-0000000000bb.pdf.tmp": b"tmp",
        orphan_name(1): b"same name as a draft orphan",  # even the same file name
    }
    for name, data in archive.items():
        path = file_dir / name
        path.write_bytes(data)
        os.utime(path, (1, 1))  # ancient: would be deleted if treated as an orphan
    draft_env.clock.advance(days=30)

    report = cleanup(draft_env).run_once()

    assert report.expired_removed == 1 and report.orphans_removed == 1
    assert {p.name: p.read_bytes() for p in file_dir.iterdir()} == archive
    assert all(os.stat(file_dir / n).st_mtime == 1 for n in archive)


def test_service_depends_only_on_draft_repository_and_draft_file_store() -> None:
    source = Path(cleanup_module.__file__).read_text(encoding="utf-8")
    imports = set(re.findall(r"^(?:from|import) (app\.[\w.]+)", source, re.MULTILINE))
    assert imports <= {
        "app.core.clock",
        "app.core.logging",
        "app.repositories.draft_file_store",
        "app.repositories.draft_repository",
    }, imports


# ---- logs -------------------------------------------------------------------------------------


def test_logs_contain_only_counts(draft_env: DraftEnv, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    draft_env.service.create(make_upload("private-cv.pdf"), None)
    (name,) = draft_env.draft_files()
    put_file(draft_env, orphan_name(1), 5 * DAY)
    draft_env.clock.advance(days=8)

    cleanup(draft_env).run_once()

    text = "\n".join(r.getMessage() for r in caplog.records)
    assert text  # an empty log would pass the checks below for the wrong reason
    for secret in ("private-cv.pdf", name, orphan_name(1), str(draft_env.data_dir)):
        assert secret not in text

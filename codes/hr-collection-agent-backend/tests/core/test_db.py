import sqlite3
import threading
from pathlib import Path

import pytest

from app.core.db import (
    SCHEMA_VERSION,
    connect,
    init_drafts_db,
    init_resumes_db,
    transaction,
)

NOW = "2026-11-10T08:00:00Z"


def _names(conn: sqlite3.Connection, kind: str) -> set[str]:
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type = ?", (kind,)).fetchall()
    return {r[0] for r in rows}


@pytest.fixture
def drafts_path(data_dir: Path) -> Path:
    path = data_dir / "drafts.db"
    init_drafts_db(path)
    return path


@pytest.fixture
def resumes_path(data_dir: Path) -> Path:
    path = data_dir / "resumes.db"
    init_resumes_db(path)
    return path


def _draft_row(**over: object) -> dict:
    row = {
        "id": "d1", "token_hash": "h1", "file_path": "d1.pdf", "original_filename": "a.pdf",
        "content_type": "application/pdf", "file_size": 10, "fields_json": "{}",
        "created_at": NOW, "updated_at": NOW, "last_active_at": NOW,
    }  # fmt: skip
    return row | over


def _insert_draft(conn: sqlite3.Connection, **over: object) -> None:
    row = _draft_row(**over)
    cols = ", ".join(row)
    marks = ", ".join(f":{k}" for k in row)
    conn.execute(f"INSERT INTO drafts ({cols}) VALUES ({marks})", row)  # noqa: S608


def _resume_row(**over: object) -> dict:
    row = {
        "id": "r1", "name": "ZZ", "phone": "13800138000", "email": "a@b.cc",
        "name_key": "zz", "phone_key": "13800138000", "email_key": "a@b.cc",
        "file_path": "r1.pdf", "original_filename": "a.pdf",
        "content_type": "application/pdf", "file_size": 10, "created_at": NOW, "updated_at": NOW,
    }  # fmt: skip
    return row | over


def _insert_resume(conn: sqlite3.Connection, **over: object) -> None:
    row = _resume_row(**over)
    cols = ", ".join(row)
    marks = ", ".join(f":{k}" for k in row)
    conn.execute(f"INSERT INTO resumes ({cols}) VALUES ({marks})", row)  # noqa: S608


# ---- structure ----------------------------------------------------------


def test_drafts_db_structure(drafts_path: Path) -> None:
    conn = connect(drafts_path)
    assert _names(conn, "table") >= {"drafts"}
    assert _names(conn, "index") >= {"uq_drafts_token_hash", "idx_drafts_last_active"}
    assert conn.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION == 1
    assert "resumes" not in _names(conn, "table")


def test_resumes_db_structure(resumes_path: Path) -> None:
    conn = connect(resumes_path)
    assert _names(conn, "table") >= {
        "resumes", "resume_work_experiences", "resume_project_experiences", "resume_educations",
    }  # fmt: skip
    assert _names(conn, "index") >= {
        "uq_resumes_identity", "uq_resumes_file_path", "uq_work_resume_seq",
        "uq_project_resume_seq", "uq_education_resume_seq",
    }  # fmt: skip
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 1
    assert "drafts" not in _names(conn, "table")


def test_two_databases_are_separate_files(drafts_path: Path, resumes_path: Path) -> None:
    assert drafts_path != resumes_path and drafts_path.exists() and resumes_path.exists()


def test_init_is_idempotent_and_keeps_data(drafts_path: Path, resumes_path: Path) -> None:
    conn = connect(drafts_path)
    _insert_draft(conn)
    conn.close()
    rconn = connect(resumes_path)
    _insert_resume(rconn)
    rconn.close()
    init_drafts_db(drafts_path)
    init_resumes_db(resumes_path)
    assert connect(drafts_path).execute("SELECT count(*) FROM drafts").fetchone()[0] == 1
    assert connect(resumes_path).execute("SELECT count(*) FROM resumes").fetchone()[0] == 1


def test_init_creates_parent_directory(tmp_path: Path) -> None:
    path = tmp_path / "nested" / "drafts.db"
    init_drafts_db(path)
    assert path.exists()


def test_newer_schema_version_rejected(tmp_path: Path) -> None:
    path = tmp_path / "x.db"
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA user_version = 99")
    conn.close()
    with pytest.raises(RuntimeError, match="schema version"):
        init_drafts_db(path)


# ---- connection pragmas ---------------------------------------------------


def test_connect_pragmas(drafts_path: Path) -> None:
    conn = connect(drafts_path)
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == 5000
    assert conn.row_factory is sqlite3.Row


# ---- constraints -----------------------------------------------------------


def test_draft_token_hash_unique(drafts_path: Path) -> None:
    conn = connect(drafts_path)
    _insert_draft(conn)
    with pytest.raises(sqlite3.IntegrityError):
        _insert_draft(conn, id="d2")


@pytest.mark.parametrize(
    "over",
    [{"content_type": "text/plain"}, {"file_size": 0}, {"file_size": 10485761}],
)
def test_draft_checks(drafts_path: Path, over: dict) -> None:
    with pytest.raises(sqlite3.IntegrityError):
        _insert_draft(connect(drafts_path), **over)


def test_resume_identity_unique(resumes_path: Path) -> None:
    conn = connect(resumes_path)
    _insert_resume(conn)
    with pytest.raises(sqlite3.IntegrityError, match="resumes.name_key"):
        _insert_resume(conn, id="r2", file_path="r2.pdf")


def test_resume_file_path_unique(resumes_path: Path) -> None:
    conn = connect(resumes_path)
    _insert_resume(conn)
    with pytest.raises(sqlite3.IntegrityError, match="resumes.file_path"):
        _insert_resume(conn, id="r2", name_key="other")


def test_resume_json_valid_check(resumes_path: Path) -> None:
    conn = connect(resumes_path)
    with pytest.raises(sqlite3.IntegrityError):
        _insert_resume(conn, skills_json="not json")
    _insert_resume(conn, skills_json='["a"]')


def test_resume_blank_name_rejected(resumes_path: Path) -> None:
    with pytest.raises(sqlite3.IntegrityError):
        _insert_resume(connect(resumes_path), name="   ")


def test_foreign_key_enforced_and_cascade(resumes_path: Path) -> None:
    conn = connect(resumes_path)
    sub = (
        "INSERT INTO resume_educations (resume_id, seq, created_at, updated_at) VALUES (?, 0, ?, ?)"
    )
    with pytest.raises(sqlite3.IntegrityError, match="FOREIGN KEY"):
        conn.execute(sub, ("missing", NOW, NOW))
    _insert_resume(conn)
    conn.execute(sub, ("r1", NOW, NOW))
    with pytest.raises(sqlite3.IntegrityError):  # unique (resume_id, seq)
        conn.execute(sub, ("r1", NOW, NOW))
    conn.execute("DELETE FROM resumes WHERE id = 'r1'")
    assert conn.execute("SELECT count(*) FROM resume_educations").fetchone()[0] == 0


# ---- transactions ----------------------------------------------------------


def test_transaction_commits(drafts_path: Path) -> None:
    conn = connect(drafts_path)
    with transaction(conn):
        _insert_draft(conn)
    assert connect(drafts_path).execute("SELECT count(*) FROM drafts").fetchone()[0] == 1


def test_transaction_rolls_back_on_error(drafts_path: Path) -> None:
    conn = connect(drafts_path)
    with pytest.raises(RuntimeError, match="boom"), transaction(conn):
        _insert_draft(conn)
        raise RuntimeError("boom")
    assert connect(drafts_path).execute("SELECT count(*) FROM drafts").fetchone()[0] == 0


def test_begin_immediate_serialises_writers(drafts_path: Path) -> None:
    other = connect(drafts_path, busy_timeout_ms=50)
    started, release = threading.Event(), threading.Event()

    def hold() -> None:
        holder = connect(drafts_path)
        with transaction(holder):
            started.set()
            release.wait(5)

    t = threading.Thread(target=hold)
    t.start()
    assert started.wait(5)
    try:
        with pytest.raises(sqlite3.OperationalError, match="locked"), transaction(other):
            pass
    finally:
        release.set()
        t.join()
    with transaction(other):  # lock released
        _insert_draft(other)

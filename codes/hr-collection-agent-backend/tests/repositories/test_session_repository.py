import inspect
import json
import sqlite3
import threading
from pathlib import Path

import pytest

from app.core.db import connect, init_drafts_db
from app.core.ids import hash_token
from app.repositories.session_repository import (
    SessionRecord,
    SessionRepository,
    SessionTransaction,
)

T0 = "2026-11-10T08:00:00Z"
T1 = "2026-11-11T09:00:00Z"
ALICE = hash_token("alice")
BOB = hash_token("bob")


@pytest.fixture
def db_path(data_dir: Path) -> Path:
    path = data_dir / "drafts.db"
    init_drafts_db(path)
    return path


@pytest.fixture
def repo(db_path: Path) -> SessionRepository:
    return SessionRepository(db_path)


def make_record(n: int = 1, **over: object) -> SessionRecord:
    sid = f"00000000-0000-4000-8000-{n:012d}"
    base = {
        "id": sid, "browser_hash": ALICE, "status": "reviewing", "file_path": f"{sid}.pdf",
        "original_filename": "synthetic.pdf", "content_type": "application/pdf",
        "file_size": 100, "fields_json": '{"k": 1}', "resume_id": None, "update_state": "none",
        "created_at": T0, "updated_at": T0, "last_active_at": T0,
    }  # fmt: skip
    return SessionRecord(**(base | over))


def row(db_path: Path, rec: SessionRecord) -> dict:
    found = connect(db_path).execute("SELECT * FROM sessions WHERE id = ?", (rec.id,)).fetchone()
    return dict(found) if found else {}


def test_every_method_addressing_a_session_requires_browser_hash() -> None:
    """Structural guard for ADR-008: no way to fetch or change a session by id alone."""
    classes = (SessionRepository, SessionTransaction)
    for cls in classes:
        for name, fn in inspect.getmembers(cls, inspect.isfunction):
            params = inspect.signature(fn).parameters
            if "session_id" in params:
                assert "browser_hash" in params, f"{cls.__name__}.{name}"
    banned = {"delete_expired", "touch_and_get", "delete_by_token_hash"}
    assert not banned & set(dir(SessionRepository))


def test_insert_get_and_foreign_browser_sees_nothing(repo: SessionRepository) -> None:
    rec = make_record()
    repo.insert(rec)
    assert repo.get(rec.id, ALICE) == rec
    assert repo.get(rec.id, BOB) is None  # someone else's: same answer as "not found"
    assert repo.get("missing", ALICE) is None


def test_other_browser_cannot_change_or_delete(repo: SessionRepository, db_path: Path) -> None:
    rec = make_record()
    repo.insert(rec)
    assert repo.mark_saved(rec.id, BOB, "r1", T1) is False
    assert repo.mark_candidate_pending(rec.id, BOB, "r1", T1) is False
    assert repo.delete(rec.id, BOB) is None
    with repo.transaction() as tx:
        assert tx.update_fields(rec.id, BOB, "{}", T1) is False
    assert (
        row(db_path, rec)["status"] == "reviewing"
        and row(db_path, rec)["fields_json"] == '{"k": 1}'
    )


def test_list_by_browser_is_owned_and_newest_active_first(repo: SessionRepository) -> None:
    repo.insert(make_record(1, last_active_at="2026-11-10T08:00:00Z"))
    repo.insert(make_record(2, last_active_at="2026-11-10T09:00:00Z"))
    repo.insert(make_record(3, browser_hash=BOB))
    assert [r.id for r in repo.list_by_browser(ALICE)] == [make_record(2).id, make_record(1).id]
    assert repo.list_by_browser(hash_token("nobody")) == []


def test_sql_is_parameter_bound(repo: SessionRepository, db_path: Path) -> None:
    evil = "x'; DROP TABLE sessions; --"
    repo.insert(make_record(original_filename=evil))
    assert repo.get(evil, ALICE) is None
    assert repo.get(make_record().id, ALICE).original_filename == evil


def test_plain_browser_id_is_never_stored(repo: SessionRepository, db_path: Path) -> None:
    repo.insert(make_record())
    dump = "\n".join(connect(db_path).iterdump())
    assert "alice" not in dump and ALICE in dump


def test_mark_saved_is_conditional_and_clears_draft_copies(
    repo: SessionRepository, db_path: Path
) -> None:
    rec = make_record()
    repo.insert(rec)
    assert repo.mark_saved(rec.id, ALICE, "r1", T1) is True
    saved = row(db_path, rec)
    assert (saved["status"], saved["resume_id"], saved["update_state"]) == ("saved", "r1", "none")
    assert saved["file_path"] is None and saved["fields_json"] == "{}"
    assert saved["created_at"] == T0 and saved["updated_at"] == saved["last_active_at"] == T1
    assert repo.mark_saved(rec.id, ALICE, "r2", T1) is False  # second call does not take effect
    assert row(db_path, rec)["resume_id"] == "r1"


def test_candidate_pending_then_update_applied(repo: SessionRepository, db_path: Path) -> None:
    rec = make_record()
    repo.insert(rec)
    assert repo.mark_update_applied(rec.id, ALICE, T1) is False  # not pending yet
    assert repo.mark_candidate_pending(rec.id, ALICE, "r1", T1) is True
    pending = row(db_path, rec)
    assert (pending["status"], pending["update_state"]) == ("saved", "pending")
    assert pending["file_path"] == rec.file_path and pending["fields_json"] == rec.fields_json
    assert repo.mark_candidate_pending(rec.id, ALICE, "r1", T1) is False
    assert repo.mark_update_applied(rec.id, ALICE, T1) is True
    applied = row(db_path, rec)
    assert applied["update_state"] == "applied" and applied["file_path"] is None
    assert applied["fields_json"] == "{}"
    assert repo.mark_update_applied(rec.id, ALICE, T1) is False


def test_delete_returns_record_and_cascades(repo: SessionRepository, db_path: Path) -> None:
    rec = make_record()
    repo.insert(rec)
    conn = connect(db_path)
    conn.execute(
        "INSERT INTO chat_messages VALUES ('m1', ?, 1, 'user', 'hi', ?, ?)", (rec.id, T0, T0)
    )
    assert repo.delete(rec.id, ALICE) == rec
    assert repo.delete(rec.id, ALICE) is None
    assert conn.execute("SELECT count(*) FROM chat_messages").fetchone()[0] == 0


def test_list_file_paths_only_lists_existing_files(repo: SessionRepository) -> None:
    assert repo.list_file_paths() == set()
    repo.insert(make_record(1))
    repo.insert(make_record(2))
    repo.mark_saved(make_record(2).id, ALICE, "r1", T1)  # file_path becomes NULL
    assert repo.list_file_paths() == {make_record(1).file_path}


def test_transaction_rolls_back_on_error(repo: SessionRepository) -> None:
    rec = make_record()
    repo.insert(rec)
    with pytest.raises(RuntimeError, match="boom"), repo.transaction() as tx:
        tx.update_fields(rec.id, ALICE, '{"x": 1}', T1)
        raise RuntimeError("boom")
    assert repo.get(rec.id, ALICE).fields_json == rec.fields_json


def test_update_fields_only_touches_reviewing_sessions(repo: SessionRepository) -> None:
    rec = make_record()
    repo.insert(rec)
    repo.mark_saved(rec.id, ALICE, "r1", T1)
    with repo.transaction() as tx:
        assert tx.update_fields(rec.id, ALICE, '{"x": 1}', T1) is False


def test_concurrent_read_modify_write_loses_no_update(repo: SessionRepository) -> None:
    """Two threads each bump a different key; BEGIN IMMEDIATE serialises them."""
    rec = make_record(fields_json="{}")
    repo.insert(rec)
    barrier = threading.Barrier(2)
    errors: list[BaseException] = []

    def work(key: str) -> None:
        try:
            barrier.wait(5)
            for _ in range(10):
                with repo.transaction() as tx:
                    current = json.loads(tx.get(rec.id, ALICE).fields_json)
                    current[key] = current.get(key, 0) + 1
                    tx.update_fields(rec.id, ALICE, json.dumps(current), T1)
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=work, args=(k,)) for k in ("a", "b")]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    assert json.loads(repo.get(rec.id, ALICE).fields_json) == {"a": 10, "b": 10}


def test_check_constraints_are_enforced(repo: SessionRepository) -> None:
    with pytest.raises(sqlite3.IntegrityError):
        repo.insert(make_record(content_type="text/plain"))
    with pytest.raises(sqlite3.IntegrityError):
        repo.insert(make_record(status="saved"))  # saved needs resume_id

import sqlite3
import threading
from pathlib import Path

import pytest

from app.core.db import connect, init_drafts_db
from app.core.ids import hash_token
from app.repositories.draft_repository import DraftRecord, DraftRepository

T0 = "2026-11-10T08:00:00Z"


@pytest.fixture
def db_path(data_dir: Path) -> Path:
    path = data_dir / "drafts.db"
    init_drafts_db(path)
    return path


@pytest.fixture
def repo(db_path: Path) -> DraftRepository:
    return DraftRepository(db_path)


def make_record(n: int = 1, **over: object) -> DraftRecord:
    base = {
        "id": f"00000000-0000-4000-8000-{n:012d}",
        "token_hash": hash_token(f"token-{n}"),
        "file_path": f"00000000-0000-4000-8000-{n:012d}.pdf",
        "original_filename": "synthetic.pdf",
        "content_type": "application/pdf",
        "file_size": 100,
        "fields_json": '{"name": {"value": null, "status": "missing"}}',
        "created_at": T0,
        "updated_at": T0,
        "last_active_at": T0,
    }
    return DraftRecord(**(base | over))


def count(db_path: Path) -> int:
    return connect(db_path).execute("SELECT count(*) FROM drafts").fetchone()[0]


def test_insert_and_get_by_token_hash(repo: DraftRepository, db_path: Path) -> None:
    rec = make_record()
    repo.insert(rec)
    assert repo.get_by_token_hash(rec.token_hash) == rec
    assert count(db_path) == 1


def test_get_unknown_token_returns_none(repo: DraftRepository) -> None:
    assert repo.get_by_token_hash(hash_token("nope")) is None


def test_token_hash_is_unique(repo: DraftRepository) -> None:
    repo.insert(make_record(1))
    with pytest.raises(sqlite3.IntegrityError):
        repo.insert(make_record(2, token_hash=make_record(1).token_hash))


def test_plain_token_is_never_stored(repo: DraftRepository, db_path: Path) -> None:
    repo.insert(make_record())
    dump = "\n".join(connect(db_path).iterdump())
    assert "token-1" not in dump and hash_token("token-1") in dump


def test_sql_is_parameter_bound(repo: DraftRepository, db_path: Path) -> None:
    evil = "x'; DROP TABLE drafts; --"
    repo.insert(make_record(original_filename=evil))
    assert repo.get_by_token_hash(evil) is None
    assert count(db_path) == 1
    assert repo.get_by_token_hash(make_record().token_hash).original_filename == evil


def test_touch_and_get_refreshes_last_active_only(repo: DraftRepository) -> None:
    rec = make_record()
    repo.insert(rec)
    later = "2026-11-12T09:00:00Z"
    got = repo.touch_and_get(rec.token_hash, later)
    assert got is not None and got.last_active_at == later
    assert got.updated_at == T0 and got.fields_json == rec.fields_json
    assert repo.get_by_token_hash(rec.token_hash).last_active_at == later


def test_touch_and_get_unknown_returns_none(repo: DraftRepository) -> None:
    assert repo.touch_and_get(hash_token("nope"), T0) is None


def test_delete_by_token_hash_returns_deleted_record(repo: DraftRepository, db_path: Path) -> None:
    rec = make_record()
    repo.insert(rec)
    assert repo.delete_by_token_hash(rec.token_hash) == rec
    assert count(db_path) == 0
    assert repo.delete_by_token_hash(rec.token_hash) is None


def test_delete_by_id(repo: DraftRepository, db_path: Path) -> None:
    repo.insert(make_record(1))
    repo.insert(make_record(2))
    assert repo.delete(make_record(1).id) is True
    assert repo.delete(make_record(1).id) is False
    assert count(db_path) == 1


# ---- expiry (7 days is decided by the caller; the repository only applies a cutoff) -------


def test_delete_expired_boundary_and_returned_paths(repo: DraftRepository, db_path: Path) -> None:
    cutoff = "2026-11-03T08:00:00Z"
    repo.insert(make_record(1, last_active_at="2026-11-03T07:59:59Z"))  # 1 s older: expired
    repo.insert(make_record(2, last_active_at=cutoff))  # exactly at cutoff: kept
    repo.insert(make_record(3, last_active_at="2026-11-03T08:00:01Z"))  # newer: kept
    paths = repo.delete_expired(cutoff)
    assert paths == [make_record(1).file_path]
    remaining = connect(db_path).execute("SELECT id FROM drafts ORDER BY id").fetchall()
    assert [r[0] for r in remaining] == [make_record(2).id, make_record(3).id]


def test_delete_expired_with_nothing_expired(repo: DraftRepository) -> None:
    repo.insert(make_record())
    assert repo.delete_expired("2026-01-01T00:00:00Z") == []


def test_list_file_paths(repo: DraftRepository) -> None:
    assert repo.list_file_paths() == set()
    repo.insert(make_record(1))
    repo.insert(make_record(2))
    assert repo.list_file_paths() == {make_record(1).file_path, make_record(2).file_path}


# ---- transactions --------------------------------------------------------------------------


def test_transaction_read_modify_write(repo: DraftRepository) -> None:
    rec = make_record()
    repo.insert(rec)
    with repo.transaction() as tx:
        current = tx.get_by_token_hash(rec.token_hash)
        assert current == rec
        assert tx.update_fields(rec.id, '{"changed": true}', "2026-11-11T00:00:00Z") is True
    got = repo.get_by_token_hash(rec.token_hash)
    assert got.fields_json == '{"changed": true}'
    assert got.updated_at == got.last_active_at == "2026-11-11T00:00:00Z"
    assert got.created_at == T0


def test_transaction_update_unknown_id_returns_false(repo: DraftRepository) -> None:
    with repo.transaction() as tx:
        assert tx.update_fields("missing", "{}", T0) is False


def test_transaction_rolls_back_on_error(repo: DraftRepository) -> None:
    rec = make_record()
    repo.insert(rec)
    with pytest.raises(RuntimeError, match="boom"), repo.transaction() as tx:
        tx.update_fields(rec.id, '{"x": 1}', T0)
        raise RuntimeError("boom")
    assert repo.get_by_token_hash(rec.token_hash).fields_json == rec.fields_json


def test_concurrent_read_modify_write_loses_no_update(repo: DraftRepository) -> None:
    """Two threads each set a different key; BEGIN IMMEDIATE serialises them (design 5.2)."""
    import json

    rec = make_record(fields_json="{}")
    repo.insert(rec)
    barrier = threading.Barrier(2)
    errors: list[BaseException] = []

    def work(key: str) -> None:
        try:
            barrier.wait(5)
            for _ in range(10):
                with repo.transaction() as tx:
                    current = json.loads(tx.get_by_token_hash(rec.token_hash).fields_json)
                    current[key] = current.get(key, 0) + 1
                    tx.update_fields(rec.id, json.dumps(current), T0)
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=work, args=(k,)) for k in ("a", "b")]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    assert json.loads(repo.get_by_token_hash(rec.token_hash).fields_json) == {"a": 10, "b": 10}


def test_check_constraints_are_enforced(repo: DraftRepository) -> None:
    with pytest.raises(sqlite3.IntegrityError):
        repo.insert(make_record(content_type="text/plain"))
    with pytest.raises(sqlite3.IntegrityError):
        repo.insert(make_record(file_size=0))


def test_connections_are_not_leaked_between_operations(repo: DraftRepository) -> None:
    for i in range(1, 30):
        repo.insert(make_record(i))
        repo.get_by_token_hash(make_record(i).token_hash)
    assert len(repo.list_file_paths()) == 29

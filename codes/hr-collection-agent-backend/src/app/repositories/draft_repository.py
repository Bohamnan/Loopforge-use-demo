"""Draft storage (drafts.db). SQL only: no business decisions, all values parameter-bound."""

import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from dataclasses import dataclass
from pathlib import Path

from app.core.db import connect, transaction

_COLUMNS = (
    "id, token_hash, file_path, original_filename, content_type, file_size, "
    "fields_json, created_at, updated_at, last_active_at"
)


@dataclass(frozen=True)
class DraftRecord:
    """One row of ``drafts``. Times are ISO 8601 UTC text; the token is stored hashed only."""

    id: str
    token_hash: str  # sha256 hex of the draft token
    file_path: str  # server-generated name relative to {DATA_DIR}/drafts/
    original_filename: str  # display only, never logged
    content_type: str
    file_size: int
    fields_json: str
    created_at: str
    updated_at: str
    last_active_at: str


def _record(row: sqlite3.Row | None) -> DraftRecord | None:
    return None if row is None else DraftRecord(**dict(row))


class DraftTransaction:
    """Handle valid inside :meth:`DraftRepository.transaction` (one BEGIN IMMEDIATE)."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get_by_token_hash(self, token_hash: str) -> DraftRecord | None:
        row = self._conn.execute(
            f"SELECT {_COLUMNS} FROM drafts WHERE token_hash = ?",  # noqa: S608
            (token_hash,),
        ).fetchone()
        return _record(row)

    def update_fields(self, draft_id: str, fields_json: str, now: str) -> bool:
        """Replace ``fields_json`` and refresh ``updated_at`` and ``last_active_at``."""
        cursor = self._conn.execute(
            "UPDATE drafts SET fields_json = ?, updated_at = ?, last_active_at = ? WHERE id = ?",
            (fields_json, now, now, draft_id),
        )
        return cursor.rowcount == 1


class DraftRepository:
    """Access to the drafts database; every call uses its own short-lived connection."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path

    def insert(self, record: DraftRecord) -> None:
        with closing(connect(self._db_path)) as conn, transaction(conn):
            conn.execute(
                f"INSERT INTO drafts ({_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",  # noqa: S608
                (
                    record.id, record.token_hash, record.file_path, record.original_filename,
                    record.content_type, record.file_size, record.fields_json,
                    record.created_at, record.updated_at, record.last_active_at,
                ),
            )  # fmt: skip

    def get_by_token_hash(self, token_hash: str) -> DraftRecord | None:
        with closing(connect(self._db_path)) as conn:
            return DraftTransaction(conn).get_by_token_hash(token_hash)

    def touch_and_get(self, token_hash: str, now: str) -> DraftRecord | None:
        """Atomically refresh ``last_active_at`` and return the draft (None if unknown)."""
        with closing(connect(self._db_path)) as conn, transaction(conn):
            row = conn.execute(
                f"UPDATE drafts SET last_active_at = ? WHERE token_hash = ? RETURNING {_COLUMNS}",  # noqa: S608
                (now, token_hash),
            ).fetchone()
            return _record(row)

    def delete_by_token_hash(self, token_hash: str) -> DraftRecord | None:
        """Delete and return the draft so the caller can remove its file."""
        with closing(connect(self._db_path)) as conn, transaction(conn):
            row = conn.execute(
                f"DELETE FROM drafts WHERE token_hash = ? RETURNING {_COLUMNS}",  # noqa: S608
                (token_hash,),
            ).fetchone()
            return _record(row)

    def delete(self, draft_id: str) -> bool:
        with closing(connect(self._db_path)) as conn, transaction(conn):
            return conn.execute("DELETE FROM drafts WHERE id = ?", (draft_id,)).rowcount == 1

    def delete_expired(self, cutoff: str) -> list[str]:
        """Delete drafts with ``last_active_at`` strictly before ``cutoff``; return file paths.

        The retention period is the caller's decision; rows are removed before their files so
        a crash can only leave orphan files, never rows pointing at missing files.
        """
        with closing(connect(self._db_path)) as conn, transaction(conn):
            rows = conn.execute(
                "DELETE FROM drafts WHERE last_active_at < ? RETURNING file_path", (cutoff,)
            ).fetchall()
        return [r["file_path"] for r in rows]

    def list_file_paths(self) -> set[str]:
        with closing(connect(self._db_path)) as conn:
            rows = conn.execute("SELECT file_path FROM drafts").fetchall()
        return {r["file_path"] for r in rows}

    @contextmanager
    def transaction(self) -> Iterator[DraftTransaction]:
        """Open a BEGIN IMMEDIATE transaction for read-modify-write sequences."""
        with closing(connect(self._db_path)) as conn, transaction(conn):
            yield DraftTransaction(conn)

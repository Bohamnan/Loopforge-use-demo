"""Session storage (drafts.db ``sessions``). SQL only: no business decisions, bound values.

Ownership rule (ADR-008): every method that addresses one session by id also takes
``browser_hash`` and puts ``id = ? AND browser_hash = ?`` in the SQL. A session that does not
exist and one that belongs to someone else are indistinguishable (``None`` / ``False``).
There is intentionally no method that fetches a session by id alone.
"""

import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from dataclasses import dataclass
from pathlib import Path

from app.core.db import connect, transaction

_COLUMNS = (
    "id, browser_hash, status, file_path, original_filename, content_type, file_size, "
    "fields_json, resume_id, update_state, created_at, updated_at, last_active_at"
)
_OWNED = "id = ? AND browser_hash = ?"


@dataclass(frozen=True)
class SessionRecord:
    """One row of ``sessions``. Times are ISO 8601 UTC text; the browser id is stored hashed."""

    id: str
    browser_hash: str  # sha256 hex of the browser identifier
    status: str  # 'reviewing' | 'saved'
    file_path: str | None  # name relative to {DATA_DIR}/drafts/; None once the file is deleted
    original_filename: str  # display only, never logged
    content_type: str
    file_size: int
    fields_json: str  # draft fields; frozen candidate when pending; '{}' for plain saved
    resume_id: str | None  # logical reference into resumes.db
    update_state: str  # 'none' | 'pending' | 'applied'
    created_at: str
    updated_at: str
    last_active_at: str


def _record(row: sqlite3.Row | None) -> SessionRecord | None:
    return None if row is None else SessionRecord(**dict(row))


class SessionTransaction:
    """Handle valid inside :meth:`SessionRepository.transaction` (one BEGIN IMMEDIATE)."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get(self, session_id: str, browser_hash: str) -> SessionRecord | None:
        row = self._conn.execute(
            f"SELECT {_COLUMNS} FROM sessions WHERE {_OWNED}",  # noqa: S608
            (session_id, browser_hash),
        ).fetchone()
        return _record(row)

    def update_fields(self, session_id: str, browser_hash: str, fields_json: str, now: str) -> bool:
        """Replace ``fields_json`` of a reviewing session; refresh the activity times."""
        cursor = self._conn.execute(
            "UPDATE sessions SET fields_json = ?, updated_at = ?, last_active_at = ? "
            f"WHERE {_OWNED} AND status = 'reviewing'",
            (fields_json, now, now, session_id, browser_hash),
        )
        return cursor.rowcount == 1

    def mark_saved(self, session_id: str, browser_hash: str, resume_id: str, now: str) -> bool:
        """reviewing -> saved (first save). Conditional: False if the state already changed."""
        cursor = self._conn.execute(
            "UPDATE sessions SET status = 'saved', resume_id = ?, update_state = 'none', "
            "file_path = NULL, fields_json = '{}', updated_at = ?, last_active_at = ? "
            f"WHERE {_OWNED} AND status = 'reviewing'",
            (resume_id, now, now, session_id, browser_hash),
        )
        return cursor.rowcount == 1

    def mark_candidate_pending(
        self, session_id: str, browser_hash: str, resume_id: str, now: str
    ) -> bool:
        """reviewing -> saved/pending: keep fields and the temp file as the update candidate."""
        cursor = self._conn.execute(
            "UPDATE sessions SET status = 'saved', resume_id = ?, update_state = 'pending', "
            "updated_at = ?, last_active_at = ? "
            f"WHERE {_OWNED} AND status = 'reviewing'",
            (resume_id, now, now, session_id, browser_hash),
        )
        return cursor.rowcount == 1

    def mark_update_applied(self, session_id: str, browser_hash: str, now: str) -> bool:
        """pending -> applied: the candidate now lives in the record; drop its copies."""
        cursor = self._conn.execute(
            "UPDATE sessions SET update_state = 'applied', file_path = NULL, "
            "fields_json = '{}', updated_at = ?, last_active_at = ? "
            f"WHERE {_OWNED} AND status = 'saved' AND update_state = 'pending'",
            (now, now, session_id, browser_hash),
        )
        return cursor.rowcount == 1


class SessionRepository:
    """Access to the sessions table; every call uses its own short-lived connection."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path

    def insert(self, record: SessionRecord) -> None:
        with closing(connect(self._db_path)) as conn, transaction(conn):
            conn.execute(
                f"INSERT INTO sessions ({_COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",  # noqa: S608
                (
                    record.id, record.browser_hash, record.status, record.file_path,
                    record.original_filename, record.content_type, record.file_size,
                    record.fields_json, record.resume_id, record.update_state,
                    record.created_at, record.updated_at, record.last_active_at,
                ),
            )  # fmt: skip

    def get(self, session_id: str, browser_hash: str) -> SessionRecord | None:
        with closing(connect(self._db_path)) as conn:
            return SessionTransaction(conn).get(session_id, browser_hash)

    def list_by_browser(self, browser_hash: str) -> list[SessionRecord]:
        """All sessions of one browser, most recently active first."""
        with closing(connect(self._db_path)) as conn:
            rows = conn.execute(
                f"SELECT {_COLUMNS} FROM sessions WHERE browser_hash = ? "  # noqa: S608
                "ORDER BY last_active_at DESC, id",
                (browser_hash,),
            ).fetchall()
        return [SessionRecord(**dict(r)) for r in rows]

    def mark_saved(self, session_id: str, browser_hash: str, resume_id: str, now: str) -> bool:
        with closing(connect(self._db_path)) as conn, transaction(conn):
            return SessionTransaction(conn).mark_saved(session_id, browser_hash, resume_id, now)

    def mark_candidate_pending(
        self, session_id: str, browser_hash: str, resume_id: str, now: str
    ) -> bool:
        with closing(connect(self._db_path)) as conn, transaction(conn):
            return SessionTransaction(conn).mark_candidate_pending(
                session_id, browser_hash, resume_id, now
            )

    def mark_update_applied(self, session_id: str, browser_hash: str, now: str) -> bool:
        with closing(connect(self._db_path)) as conn, transaction(conn):
            return SessionTransaction(conn).mark_update_applied(session_id, browser_hash, now)

    def delete(self, session_id: str, browser_hash: str) -> SessionRecord | None:
        """Delete one owned session (messages and suggestions cascade); return it for cleanup."""
        with closing(connect(self._db_path)) as conn, transaction(conn):
            row = conn.execute(
                f"DELETE FROM sessions WHERE {_OWNED} RETURNING {_COLUMNS}",  # noqa: S608
                (session_id, browser_hash),
            ).fetchone()
            return _record(row)

    def list_file_paths(self) -> set[str]:
        """Temp file names still referenced by any session (for the orphan sweep)."""
        with closing(connect(self._db_path)) as conn:
            rows = conn.execute("SELECT file_path FROM sessions WHERE file_path IS NOT NULL")
            return {r["file_path"] for r in rows.fetchall()}

    @contextmanager
    def transaction(self) -> Iterator[SessionTransaction]:
        """Open a BEGIN IMMEDIATE transaction for read-modify-write sequences."""
        with closing(connect(self._db_path)) as conn, transaction(conn):
            yield SessionTransaction(conn)

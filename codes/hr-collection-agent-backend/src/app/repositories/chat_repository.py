"""Chat storage (drafts.db ``chat_messages`` and ``chat_suggestions``). SQL only.

Ownership is checked by the caller through ``SessionRepository`` first; this module does no
business decisions. Writes that must be atomic with a session check join the session's
transaction via :meth:`ChatRepository.bind`.
"""

import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from dataclasses import dataclass
from pathlib import Path

from app.core.db import connect, transaction
from app.repositories.session_repository import SessionTransaction

_MSG_COLUMNS = "id, session_id, seq, role, content, created_at"
_SUG_COLUMNS = (
    "id, session_id, message_id, seq, field, new_value_json, applicable, reason, status, "
    "created_at, updated_at"
)


@dataclass(frozen=True)
class MessageRecord:
    """One chat message row."""

    id: str
    session_id: str
    seq: int  # 1-based, contiguous inside a session
    role: str  # 'user' | 'assistant'
    content: str  # sensitive: never logged
    created_at: str


@dataclass(frozen=True)
class SuggestionRecord:
    """One suggestion row; the new value is stored as JSON, the old value is not stored."""

    id: str
    session_id: str
    message_id: str
    seq: int  # position inside the card
    field: str
    new_value_json: str
    applicable: bool
    reason: str | None  # reason code when not applicable
    status: str  # 'pending' | 'applied' | 'cancelled'
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class NewSuggestion:
    """A suggestion to insert (status starts as pending)."""

    id: str
    field: str
    new_value_json: str
    applicable: bool
    reason: str | None


def _message(row: sqlite3.Row | None) -> MessageRecord | None:
    return None if row is None else MessageRecord(**dict(row))


def _suggestion(row: sqlite3.Row) -> SuggestionRecord:
    data = dict(row)
    data["applicable"] = bool(data["applicable"])
    return SuggestionRecord(**data)


class ChatTransaction:
    """Handle valid inside one BEGIN IMMEDIATE transaction."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def append_message(
        self, session_id: str, message_id: str, role: str, content: str, now: str
    ) -> int:
        """Insert a message with ``seq = max(seq) + 1`` and return the new seq."""
        seq = self._conn.execute(
            "SELECT COALESCE(MAX(seq), 0) + 1 FROM chat_messages WHERE session_id = ?",
            (session_id,),
        ).fetchone()[0]
        self._conn.execute(
            "INSERT INTO chat_messages (id, session_id, seq, role, content, created_at, "
            "updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (message_id, session_id, seq, role, content, now, now),
        )
        return seq

    def add_suggestions(
        self, session_id: str, message_id: str, items: list[NewSuggestion], now: str
    ) -> None:
        for seq, item in enumerate(items, start=1):
            self._conn.execute(
                f"INSERT INTO chat_suggestions ({_SUG_COLUMNS}) "  # noqa: S608
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
                (
                    item.id, session_id, message_id, seq, item.field, item.new_value_json,
                    int(item.applicable), item.reason, now, now,
                ),
            )  # fmt: skip

    def get_message(self, session_id: str, message_id: str) -> MessageRecord | None:
        """A message of this session (a message id of another session yields None)."""
        row = self._conn.execute(
            f"SELECT {_MSG_COLUMNS} FROM chat_messages WHERE id = ? AND session_id = ?",  # noqa: S608
            (message_id, session_id),
        ).fetchone()
        return _message(row)

    def suggestions_of_message(self, message_id: str) -> list[SuggestionRecord]:
        rows = self._conn.execute(
            f"SELECT {_SUG_COLUMNS} FROM chat_suggestions WHERE message_id = ? ORDER BY seq",  # noqa: S608
            (message_id,),
        ).fetchall()
        return [_suggestion(r) for r in rows]

    def mark_suggestions(self, message_id: str, status: str, now: str) -> int:
        """pending and applicable -> ``status``; return how many rows took effect."""
        cursor = self._conn.execute(
            "UPDATE chat_suggestions SET status = ?, updated_at = ? "
            "WHERE message_id = ? AND status = 'pending' AND applicable = 1",
            (status, now, message_id),
        )
        return cursor.rowcount


class ChatRepository:
    """Access to the chat tables; reads use their own short-lived connection."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path

    @staticmethod
    def bind(tx: SessionTransaction) -> ChatTransaction:
        """Chat operations inside an already open session transaction."""
        return ChatTransaction(tx.connection)

    @contextmanager
    def transaction(self) -> Iterator[ChatTransaction]:
        with closing(connect(self._db_path)) as conn, transaction(conn):
            yield ChatTransaction(conn)

    def recent_messages(self, session_id: str, limit: int) -> list[MessageRecord]:
        """The latest ``limit`` messages, oldest first."""
        with closing(connect(self._db_path)) as conn:
            rows = conn.execute(
                f"SELECT {_MSG_COLUMNS} FROM chat_messages WHERE session_id = ? "  # noqa: S608
                "ORDER BY seq DESC LIMIT ?",
                (session_id, limit),
            ).fetchall()
        return [MessageRecord(**dict(r)) for r in reversed(rows)]

    def messages_of_session(self, session_id: str) -> list[MessageRecord]:
        with closing(connect(self._db_path)) as conn:
            rows = conn.execute(
                f"SELECT {_MSG_COLUMNS} FROM chat_messages WHERE session_id = ? "  # noqa: S608
                "ORDER BY seq",
                (session_id,),
            ).fetchall()
        return [MessageRecord(**dict(r)) for r in rows]

    def suggestions_of_session(self, session_id: str) -> list[SuggestionRecord]:
        with closing(connect(self._db_path)) as conn:
            rows = conn.execute(
                "SELECT s.* FROM chat_suggestions s JOIN chat_messages m ON m.id = s.message_id "
                "WHERE s.session_id = ? ORDER BY m.created_at, m.seq, s.seq",
                (session_id,),
            ).fetchall()
        return [_suggestion(r) for r in rows]

    def suggestions_of_message(self, message_id: str) -> list[SuggestionRecord]:
        with closing(connect(self._db_path)) as conn:
            return ChatTransaction(conn).suggestions_of_message(message_id)

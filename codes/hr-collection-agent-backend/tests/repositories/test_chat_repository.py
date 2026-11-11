from pathlib import Path

import pytest

from app.core.db import connect, init_drafts_db
from app.core.ids import hash_token
from app.repositories.chat_repository import ChatRepository, NewSuggestion
from app.repositories.session_repository import SessionRecord, SessionRepository

T0 = "2026-11-10T08:00:00Z"
T1 = "2026-11-11T09:00:00Z"
OWNER = hash_token("alice")
SID = "00000000-0000-4000-8000-000000000001"


@pytest.fixture
def db_path(data_dir: Path) -> Path:
    path = data_dir / "drafts.db"
    init_drafts_db(path)
    return path


@pytest.fixture
def repo(db_path: Path) -> ChatRepository:
    SessionRepository(db_path).insert(
        SessionRecord(
            id=SID,
            browser_hash=OWNER,
            status="reviewing",
            file_path=f"{SID}.pdf",
            original_filename="a.pdf",
            content_type="application/pdf",
            file_size=1,
            fields_json="{}",
            resume_id=None,
            update_state="none",
            created_at=T0,
            updated_at=T0,
            last_active_at=T0,
        )  # fmt: skip
    )
    return ChatRepository(db_path)


def sug(n: int, applicable: bool = True) -> NewSuggestion:
    return NewSuggestion(
        f"sg{n}", "skills", '["a"]', applicable, None if applicable else "too_long"
    )


def exchange(repo: ChatRepository, n: int, suggestions: list[NewSuggestion] | None = None) -> None:
    with repo.transaction() as tx:
        tx.append_message(SID, f"u{n}", "user", f"question {n}", T0)
        tx.append_message(SID, f"a{n}", "assistant", f"answer {n}", T0)
        tx.add_suggestions(SID, f"a{n}", suggestions or [], T0)


def test_exchange_is_written_atomically_with_contiguous_seq(
    repo: ChatRepository, db_path: Path
) -> None:
    exchange(repo, 1, [sug(1), sug(2, applicable=False)])
    exchange(repo, 2)
    msgs = repo.messages_of_session(SID)
    assert [(m.id, m.seq, m.role) for m in msgs] == [
        ("u1", 1, "user"), ("a1", 2, "assistant"), ("u2", 3, "user"), ("a2", 4, "assistant"),
    ]  # fmt: skip
    got = repo.suggestions_of_message("a1")
    assert [(s.id, s.seq, s.applicable, s.reason, s.status) for s in got] == [
        ("sg1", 1, True, None, "pending"), ("sg2", 2, False, "too_long", "pending"),
    ]  # fmt: skip
    assert connect(db_path).execute("SELECT count(*) FROM chat_suggestions").fetchone()[0] == 2


def test_failed_transaction_writes_nothing(repo: ChatRepository) -> None:
    with pytest.raises(RuntimeError, match="boom"), repo.transaction() as tx:
        tx.append_message(SID, "u1", "user", "hi", T0)
        raise RuntimeError("boom")
    assert repo.messages_of_session(SID) == []


def test_recent_messages_returns_latest_n_oldest_first(repo: ChatRepository) -> None:
    for n in (1, 2, 3):
        exchange(repo, n)
    assert [m.seq for m in repo.recent_messages(SID, 4)] == [3, 4, 5, 6]
    assert len(repo.recent_messages(SID, 100)) == 6


def test_mark_suggestions_only_takes_effect_on_pending_applicable(repo: ChatRepository) -> None:
    exchange(repo, 1, [sug(1), sug(2, applicable=False)])
    with repo.transaction() as tx:
        assert tx.mark_suggestions("a1", "applied", T1) == 1  # the non-applicable one is skipped
    by_id = {s.id: s for s in repo.suggestions_of_message("a1")}
    assert (by_id["sg1"].status, by_id["sg1"].updated_at) == ("applied", T1)
    assert (by_id["sg2"].status, by_id["sg2"].updated_at) == ("pending", T0)
    with repo.transaction() as tx:
        assert tx.mark_suggestions("a1", "cancelled", T1) == 0  # already handled


def test_get_message_is_scoped_to_its_session(repo: ChatRepository) -> None:
    exchange(repo, 1)
    with repo.transaction() as tx:
        assert tx.get_message(SID, "a1").role == "assistant"
        assert tx.get_message("another-session", "a1") is None


def test_join_the_session_transaction_so_both_commit_or_neither(
    repo: ChatRepository, db_path: Path
) -> None:
    sessions = SessionRepository(db_path)
    with pytest.raises(RuntimeError, match="boom"), sessions.transaction() as stx:
        stx.update_fields(SID, OWNER, '{"x": 1}', T1)
        ChatRepository.bind(stx).append_message(SID, "u1", "user", "hi", T1)
        raise RuntimeError("boom")
    assert sessions.get(SID, OWNER).fields_json == "{}" and repo.messages_of_session(SID) == []
    with sessions.transaction() as stx:
        stx.update_fields(SID, OWNER, '{"x": 1}', T1)
        ChatRepository.bind(stx).append_message(SID, "u1", "user", "hi", T1)
    assert (
        sessions.get(SID, OWNER).fields_json == '{"x": 1}'
        and len(repo.messages_of_session(SID)) == 1
    )


def test_deleting_the_session_removes_chat_data(repo: ChatRepository, db_path: Path) -> None:
    exchange(repo, 1, [sug(1)])
    SessionRepository(db_path).delete(SID, OWNER)
    conn = connect(db_path)
    for table in ("chat_messages", "chat_suggestions"):
        assert conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0  # noqa: S608

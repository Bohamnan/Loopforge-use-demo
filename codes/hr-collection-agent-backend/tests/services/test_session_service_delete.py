"""SessionService.delete: three states, never touches resumes or file/ (task 2.8)."""

import sqlite3

import pytest

from app.core.errors import SessionNotFoundError
from app.repositories.chat_repository import NewSuggestion
from tests.services.conftest import BROWSER_A, BROWSER_B, SessionEnv, make_upload
from tests.services.test_session_service_get import RID, store_resume

SUB_TABLES = ("resume_work_experiences", "resume_project_experiences", "resume_educations")


def make_session(env: SessionEnv) -> str:
    sid = env.service.create(make_upload(), BROWSER_A).detail.session_id
    with env.chats.transaction() as tx:
        tx.append_message(sid, "m1", "assistant", "hi", "t")
        tx.add_suggestions(sid, "m1", [NewSuggestion("s1", "skills", '["a"]', True, None)], "t")
    return sid


def mark(env: SessionEnv, sid: str, update_state: str) -> None:
    conn = sqlite3.connect(env.data_dir / "drafts.db")
    keep_file = ", file_path = file_path" if update_state == "pending" else ", file_path = NULL"
    conn.execute(
        f"UPDATE sessions SET status='saved', resume_id=?, update_state=?{keep_file} WHERE id=?",
        (RID, update_state, sid),
    )
    conn.commit()
    conn.close()


def snapshot(env: SessionEnv) -> tuple:
    names = sorted(p.name for p in env.file_dir.iterdir())
    counts = [
        env.query(f"SELECT count(*) FROM {t}", "resumes.db") for t in ("resumes", *SUB_TABLES)
    ]
    return names, counts


def test_reviewing_session_goes_with_messages_suggestions_and_temp_file(
    session_env: SessionEnv,
) -> None:
    sid = make_session(session_env)
    session_env.service.delete(sid, BROWSER_A)
    for table in ("sessions", "chat_messages", "chat_suggestions"):
        assert session_env.query(f"SELECT count(*) FROM {table}") == [(0,)]
    assert session_env.session_files() == set()
    with pytest.raises(SessionNotFoundError):
        session_env.service.delete(sid, BROWSER_A)  # repeated delete is a 404


@pytest.mark.parametrize("update_state", ["none", "pending"])
def test_saved_session_leaves_resumes_and_archive_untouched(
    session_env: SessionEnv, update_state: str
) -> None:
    store_resume(session_env)
    (session_env.file_dir / f"{RID}.pdf").write_bytes(b"%PDF-final")
    sid = make_session(session_env)
    mark(session_env, sid, update_state)
    if update_state == "none":  # saving removes the temp file; the row helper does not
        session_env.files.delete(f"{sid}.pdf")
    before = snapshot(session_env)

    session_env.service.delete(sid, BROWSER_A)

    assert snapshot(session_env) == before
    assert session_env.query("SELECT count(*) FROM sessions") == [(0,)]
    assert session_env.session_files() == set()  # a pending candidate's temp file goes too
    assert (session_env.file_dir / f"{RID}.pdf").read_bytes() == b"%PDF-final"


def test_foreign_or_unknown_session_is_404_with_no_side_effect(session_env: SessionEnv) -> None:
    sid = make_session(session_env)
    for who, target in ((BROWSER_B, sid), (BROWSER_A, "nope"), (None, sid)):
        with pytest.raises(SessionNotFoundError):
            session_env.service.delete(target, who)
    assert session_env.query("SELECT count(*) FROM sessions") == [(1,)]
    assert len(session_env.session_files()) == 1


def test_session_service_has_no_write_access_to_resumes_or_archive() -> None:
    import inspect

    from app.services import session_service

    source = inspect.getsource(session_service)
    assert "ArchiveFileStore" not in source and "create_aggregate" not in source
    assert "replace_aggregate" not in source and "ResumeRepository" not in source

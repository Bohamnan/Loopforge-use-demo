"""SessionService.get: three shapes, no side effects, one 404 for all misses (task 2.2)."""

import pytest

from app.core.errors import SessionNotFoundError
from app.core.ids import hash_token
from app.repositories.chat_repository import NewSuggestion
from app.repositories.resume_repository import NewResume
from tests.services.conftest import BROWSER_A, BROWSER_B, SessionEnv, make_upload

RID = "00000000-0000-4000-8000-0000000000aa"


def store_resume(env: SessionEnv, name: str = "SAVED PERSON") -> None:
    env.resumes.create_aggregate(
        NewResume(
            id=RID, name=name, phone="13800138000", email="a@b.cc", name_key="n", phone_key="p",
            email_key="e", file_path=f"{RID}.pdf", original_filename="orig.pdf",
            content_type="application/pdf", file_size=10, created_at="2026-11-10T08:00:00Z",
            skills=["PYTHON"],
        )
    )  # fmt: skip


def make_saved(env: SessionEnv, update_state: str) -> str:
    sid = env.service.create(make_upload(), BROWSER_A).detail.session_id
    extra = ", fields_json = fields_json" if update_state == "pending" else ""
    file_part = "" if update_state == "pending" else ", file_path = NULL"
    import sqlite3

    conn = sqlite3.connect(env.data_dir / "drafts.db")
    conn.execute(
        f"UPDATE sessions SET status='saved', resume_id=?, update_state=?{file_part}{extra} "
        "WHERE id=?",
        (RID, update_state, sid),
    )
    conn.commit()
    conn.close()
    return sid


def test_reviewing_shape_has_fields_and_messages_with_current_old_value(
    session_env: SessionEnv,
) -> None:
    sid = session_env.service.create(make_upload(), BROWSER_A).detail.session_id
    with session_env.chats.transaction() as tx:
        tx.append_message(sid, "m1", "assistant", "hi", "2026-11-10T08:01:00Z")
        tx.add_suggestions(
            sid, "m1", [NewSuggestion("s1", "current_city", '"BEIJING"', True, None)], "t"
        )
    detail = session_env.service.get(sid, BROWSER_A)
    assert detail.fields is not None and detail.resume is None and detail.update_candidate is None
    (sug,) = detail.messages[0].suggestions
    assert (sug.old_value, sug.new_value) == ("SHANGHAI", "BEIJING")


def test_saved_shape_reads_content_from_resumes_and_hides_old_value(
    session_env: SessionEnv,
) -> None:
    store_resume(session_env)
    sid = make_saved(session_env, "none")
    detail = session_env.service.get(sid, BROWSER_A)
    assert detail.fields is None and detail.update_candidate is None
    assert detail.resume is not None and detail.resume.fields.skills == ["PYTHON"]
    assert (detail.resume.file_available, detail.name) == (False, "简历 · SAVED PERSON")


def test_pending_shape_returns_existing_record_and_frozen_candidate(
    session_env: SessionEnv,
) -> None:
    store_resume(session_env)
    (session_env.file_dir / f"{RID}.pdf").write_bytes(b"%PDF-")
    sid = make_saved(session_env, "pending")
    detail = session_env.service.get(sid, BROWSER_A)
    assert detail.update_state == "pending" and detail.resume.file_available  # type: ignore[union-attr]
    assert detail.update_candidate.fields.name == "ZHANG SAN"  # type: ignore[union-attr]
    assert detail.update_candidate.original_file.filename == "synthetic.pdf"  # type: ignore[union-attr]


def test_read_changes_nothing_and_misses_are_indistinguishable(session_env: SessionEnv) -> None:
    sid = session_env.service.create(make_upload(), BROWSER_A).detail.session_id
    before = session_env.query("SELECT * FROM sessions")
    session_env.clock.advance(hours=3)
    session_env.service.get(sid, BROWSER_A)
    assert session_env.query("SELECT * FROM sessions") == before  # TQ-v2-05
    for who, target in ((BROWSER_B, sid), (BROWSER_A, "nope"), (None, sid)):
        with pytest.raises(SessionNotFoundError):
            session_env.service.get(target, who)
    assert hash_token(BROWSER_B) not in str(before)

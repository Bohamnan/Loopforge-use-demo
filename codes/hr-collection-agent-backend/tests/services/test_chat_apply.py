"""ChatService.apply / cancel (task 2.12, HIGH_RISK B-04): the only way a suggestion writes."""

import json
import sqlite3
import threading

import pytest

from app.core.errors import (
    SessionNotFoundError,
    SessionReadOnlyError,
    SuggestionUnavailableError,
)
from app.schemas.resume_fields import ResumeFieldsUpdate
from tests.fakes import make_chat_result
from tests.services.conftest import BROWSER_A, BROWSER_B, SessionEnv
from tests.services.test_chat_service import Env


@pytest.fixture
def env(session_env: SessionEnv) -> Env:
    return Env(session_env)


def card(env: Env, suggestions: list[tuple[str, object]], message: str = "BEIJING x") -> str:
    """Send a message whose reply carries ``suggestions``; returns the assistant message id."""
    env.client.result = make_chat_result("ok", suggestions)
    return env.send(message).assistant_message.message_id


def fields(env: Env) -> dict:
    return json.loads(env.session_row()[0])


def statuses(env: Env) -> list[tuple]:
    return env.base.query("SELECT field, status FROM chat_suggestions ORDER BY seq")


def test_apply_confirms_the_fields_and_marks_only_applicable_suggestions(env: Env) -> None:
    mid = card(
        env, [("current_city", "BEIJING"), ("skills", ["Go"]), ("phone", "bad")], "phone bad"
    )
    env.base.clock.advance(minutes=1)

    result = env.service.apply(env.sid, mid, BROWSER_A)

    assert fields(env)["current_city"] == {"value": "BEIJING", "status": "confirmed"}
    assert fields(env)["skills"] == {"value": ["Go"], "status": "confirmed"}
    assert fields(env)["phone"]["value"] == "13800138000"  # the invalid one never applies
    assert statuses(env) == [
        ("current_city", "applied"),
        ("skills", "applied"),
        ("phone", "pending"),
    ]
    assert [s.status for s in result.suggestions] == ["applied", "applied", "pending"]
    assert all(s.old_value is None for s in result.suggestions)
    assert (
        result.fields.current_city.value == "BEIJING" and result.updated_at == env.session_row()[1]
    )
    assert env.base.query("SELECT count(*) FROM resumes", "resumes.db") == [(0,)]  # B-04


def test_one_failing_suggestion_voids_the_whole_card(env: Env) -> None:
    mid = card(env, [("current_city", "BEIJING"), ("job_title", "NEW")])
    conn = sqlite3.connect(env.base.data_dir / "drafts.db")
    conn.execute(  # stored value became invalid after the card was created
        "UPDATE chat_suggestions SET new_value_json = ? WHERE field = 'job_title'",
        (json.dumps("x" * 501),),
    )
    conn.commit()
    conn.close()
    before = env.session_row()

    with pytest.raises(SuggestionUnavailableError):
        env.service.apply(env.sid, mid, BROWSER_A)

    assert env.session_row() == before  # fields and times unchanged, rolled back together
    assert statuses(env) == [("current_city", "pending"), ("job_title", "pending")]


def test_repeating_or_applying_after_cancel_is_unavailable(env: Env) -> None:
    applied = card(env, [("current_city", "BEIJING")])
    env.service.apply(env.sid, applied, BROWSER_A)
    with pytest.raises(SuggestionUnavailableError):
        env.service.apply(env.sid, applied, BROWSER_A)
    with pytest.raises(SuggestionUnavailableError):
        env.service.cancel(env.sid, applied, BROWSER_A)

    cancelled = card(env, [("job_title", "NEW")])
    result = env.service.cancel(env.sid, cancelled, BROWSER_A)
    assert [s.status for s in result.suggestions] == ["cancelled"]
    assert fields(env)["job_title"]["value"] == "BACKEND ENGINEER"  # cancel changes no field
    with pytest.raises(SuggestionUnavailableError):
        env.service.apply(env.sid, cancelled, BROWSER_A)
    assert fields(env)["job_title"]["value"] == "BACKEND ENGINEER"


def test_message_ids_of_other_sessions_user_messages_and_unknown_ids_are_not_found(
    env: Env,
) -> None:
    mid = card(env, [("current_city", "BEIJING")])
    user_id = env.base.query("SELECT id FROM chat_messages WHERE role = 'user'")[0][0]
    other = Env(env.base)
    for sid, who, target in (
        (other.sid, BROWSER_A, mid),  # message of another session
        (env.sid, BROWSER_A, user_id),  # a user message has no card
        (env.sid, BROWSER_A, "nope"),
        (env.sid, BROWSER_B, mid),  # foreign browser
        (env.sid, None, mid),
    ):
        with pytest.raises(SessionNotFoundError):
            env.service.apply(sid, target, who)
    assert statuses(env) == [("current_city", "pending")]


def test_saved_session_cannot_apply_or_cancel(env: Env) -> None:
    mid = card(env, [("current_city", "BEIJING")])
    conn = sqlite3.connect(env.base.data_dir / "drafts.db")
    conn.execute("UPDATE sessions SET status='saved', resume_id='r', file_path=NULL")
    conn.commit()
    conn.close()
    for action in (env.service.apply, env.service.cancel):
        with pytest.raises(SessionReadOnlyError):
            action(env.sid, mid, BROWSER_A)
    assert statuses(env) == [("current_city", "pending")]


def test_apply_and_partial_update_running_together_keep_both_changes(env: Env) -> None:
    mid = card(env, [("job_title", "FROM CARD")])
    barrier, errors = threading.Barrier(2), []

    def run(fn) -> None:  # noqa: ANN001
        try:
            barrier.wait(timeout=5)
            fn()
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    from app.services.session_service import SessionService  # same repos, other service object

    sessions = SessionService(
        env.base.sessions, env.base.chats, env.base.files, env.base.parser, env.base.resumes,
        env.base.archive.is_available, env.base.clock, env.base.ids,
    )  # fmt: skip
    update = ResumeFieldsUpdate.model_validate({"homepage": "https://example.test"})
    threads = [
        threading.Thread(target=run, args=(lambda: env.service.apply(env.sid, mid, BROWSER_A),)),
        threading.Thread(
            target=run, args=(lambda: sessions.update_fields(env.sid, BROWSER_A, update),)
        ),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(30)
    assert errors == []
    assert fields(env)["job_title"] == {"value": "FROM CARD", "status": "confirmed"}
    assert fields(env)["homepage"]["value"] == "https://example.test"

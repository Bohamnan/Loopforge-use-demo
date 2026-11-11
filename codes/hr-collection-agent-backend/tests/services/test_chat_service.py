"""ChatService.send (task 2.11, HIGH_RISK B-03/B-04). The model is always FakeChatClient."""

import inspect
import json
import logging
import re
import sqlite3
import threading
from pathlib import Path

import pytest

from app.core.errors import (
    ChatFailedError,
    SessionNotFoundError,
    SessionReadOnlyError,
    ValidationFailedError,
)
from app.services.chat_service import ChatService
from tests.fakes import FakeChatClient, make_chat_result
from tests.services.conftest import BROWSER_A, BROWSER_B, SessionEnv, make_upload

SRC = Path(__file__).resolve().parents[2] / "src" / "app"


class Env:
    def __init__(self, base: SessionEnv) -> None:
        self.base = base
        self.client = FakeChatClient(result=make_chat_result("hello"))
        self.service = ChatService(base.sessions, base.chats, self.client, base.clock, base.ids)
        self.sid = base.service.create(make_upload(), BROWSER_A).detail.session_id

    def send(self, content: str = "hi", browser: str | None = BROWSER_A, sid: str | None = None):  # noqa: ANN201
        return self.service.send(sid or self.sid, browser, content)

    def rows(self, table: str) -> int:
        return self.base.query(f"SELECT count(*) FROM {table}")[0][0]  # noqa: S608

    def session_row(self) -> tuple:
        return self.base.query("SELECT fields_json, updated_at, last_active_at FROM sessions")[0]


@pytest.fixture
def env(session_env: SessionEnv) -> Env:
    return Env(session_env)


def test_success_stores_both_messages_and_validated_suggestions_only(env: Env) -> None:
    env.client.result = make_chat_result(
        "done",
        [
            ("current_city", "BEIJING"),  # kept, applicable
            ("phone", "bad"),  # mentioned by the user but invalid: shown, not applicable
            ("name", "INVENTED NAME"),  # core value the user never wrote: dropped
            ("work_experiences", []),  # block field: dropped
        ],
    )
    fields_before, updated_before, active_before = env.session_row()
    env.base.clock.advance(minutes=5)

    resp = env.send("I moved to BEIJING, phone bad")

    assert [m.role for m in (resp.user_message, resp.assistant_message)] == ["user", "assistant"]
    cards = resp.assistant_message.suggestions
    assert [(c.field, c.applicable, c.reason, c.old_value) for c in cards] == [
        ("current_city", True, None, "SHANGHAI"),
        ("phone", False, "invalid_format", "13800138000"),
    ]
    assert env.base.query("SELECT seq, role FROM chat_messages ORDER BY seq") == [
        (1, "user"), (2, "assistant"),
    ]  # fmt: skip
    stored = env.base.query("SELECT field, applicable, status FROM chat_suggestions ORDER BY seq")
    assert stored == [
        ("current_city", 1, "pending"), ("phone", 0, "pending"),
    ]  # fmt: skip
    fields_after, updated_after, active_after = env.session_row()
    assert (fields_after, updated_after) == (fields_before, updated_before)  # fields untouched
    assert active_after != active_before  # activity refreshed


def test_whitespace_only_message_is_required_and_never_reaches_the_model(env: Env) -> None:
    for text in ("", "   \n\t"):
        with pytest.raises(ValidationFailedError) as caught:
            env.send(text)
        assert [(i.field, i.reason.value) for i in caught.value.details] == [
            ("content", "required")
        ]
    assert env.client.requests == [] and env.rows("chat_messages") == 0


@pytest.mark.parametrize("failure", [ChatFailedError(), RuntimeError("boom")])
def test_model_failure_writes_nothing(env: Env, failure: Exception) -> None:
    env.client.error = failure
    before = env.session_row()
    with pytest.raises(ChatFailedError):
        env.send()
    assert (env.rows("chat_messages"), env.rows("chat_suggestions")) == (0, 0)
    assert env.session_row() == before


@pytest.mark.parametrize("who", ["foreign", "anonymous", "unknown"])
def test_not_found_variants_are_identical_and_skip_the_model(env: Env, who: str) -> None:
    browser, sid = {
        "foreign": (BROWSER_B, env.sid), "anonymous": (None, env.sid), "unknown": (BROWSER_A, "x"),
    }[who]  # fmt: skip
    with pytest.raises(SessionNotFoundError):
        env.send(browser=browser, sid=sid)
    assert env.client.requests == [] and env.rows("chat_messages") == 0


def set_status(env: Env, status: str) -> None:
    conn = sqlite3.connect(env.base.data_dir / "drafts.db")
    conn.execute("UPDATE sessions SET status = ?, resume_id = 'r', file_path = NULL", (status,))
    conn.commit()
    conn.close()


def test_saved_session_is_read_only_before_and_after_the_model_call(env: Env) -> None:
    set_status(env, "saved")
    with pytest.raises(SessionReadOnlyError):
        env.send()
    assert env.client.requests == []


def test_session_deleted_or_saved_during_the_model_call_stores_nothing(env: Env) -> None:
    def delete_meanwhile(_: object) -> None:
        env.base.sessions.delete(
            env.sid,
            __import__("app.services.session_service", fromlist=["x"]).browser_hash(BROWSER_A),
        )

    real = env.client.chat
    env.client.chat = lambda r: (delete_meanwhile(r), real(r))[1]  # type: ignore[method-assign]
    with pytest.raises(SessionNotFoundError):
        env.send()
    assert env.rows("chat_messages") == 0

    env2 = Env(env.base)
    real2 = env2.client.chat
    env2.client.chat = lambda r: (set_status(env2, "saved"), real2(r))[1]  # type: ignore[method-assign]
    with pytest.raises(SessionReadOnlyError):
        env2.send()
    assert env.rows("chat_messages") == 0


def test_no_write_transaction_is_held_while_the_model_works(env: Env) -> None:
    """The fake writes through another connection during the call; it must not be blocked."""
    seen: list[bool] = []

    def chat(request: object) -> object:
        with sqlite3.connect(env.base.data_dir / "drafts.db", timeout=0.2) as conn:
            conn.execute("UPDATE sessions SET updated_at = updated_at")  # needs the write lock
        seen.append(True)
        return make_chat_result("ok")

    env.client.chat = chat  # type: ignore[method-assign]
    env.send()
    assert seen == [True]


def test_request_to_the_model_contains_fields_recent_history_and_the_message_only(
    env: Env,
) -> None:
    with env.base.chats.transaction() as tx:
        for n in range(25):
            tx.append_message(env.sid, f"m{n}", "user" if n % 2 == 0 else "assistant", f"t{n}", "t")
    env.send("latest")
    (request,) = env.client.requests
    assert request.message == "latest"
    assert [t.content for t in request.history] == [f"t{n}" for n in range(5, 25)]  # last 20
    dumped = json.dumps(request.fields) + repr(request.history)
    assert "synthetic.pdf" not in dumped and BROWSER_A not in dumped
    assert set(request.fields) >= {"name", "phone", "skills"}


def test_talking_about_saving_never_writes_the_formal_database(env: Env) -> None:
    env.client.result = make_chat_result("saved!", [("name", "ZHANG SAN")])
    env.send("确认提交 save my resume now")
    assert env.base.query("SELECT count(*) FROM resumes", "resumes.db") == [(0,)]
    assert env.session_row()[0] == env.base.query("SELECT fields_json FROM sessions")[0][0]
    assert list(env.base.file_dir.iterdir()) == []


def test_chat_service_cannot_reach_saving_or_the_archive() -> None:
    assert set(inspect.signature(ChatService.__init__).parameters) == {
        "self", "sessions", "chats", "client", "clock", "ids",
    }  # fmt: skip
    source = (SRC / "services/chat_service.py").read_text()
    imports = set(re.findall(r"^(?:from|import) (app\.[\w.]+)", source, re.M))
    banned = {
        "app.services.resume_service",
        "app.repositories.resume_repository",
        "app.repositories.archive_file_store",
        "app.repositories.draft_file_store",
    }
    assert not imports & banned, imports & banned


def test_concurrent_sends_get_contiguous_sequence_numbers(env: Env) -> None:
    barrier, errors = threading.Barrier(2), []

    def run() -> None:
        try:
            barrier.wait(timeout=5)
            env.send()
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=run) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(30)
    assert errors == []
    assert env.base.query("SELECT seq FROM chat_messages ORDER BY seq") == [(1,), (2,), (3,), (4,)]


def test_logs_hold_no_message_reply_or_suggestion_values(
    env: Env, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    env.client.result = make_chat_result(
        "REPLY-SECRET-TEXT", [("current_city", "SECRETVILLE"), ("skills", "x")]
    )
    env.send("MESSAGE-SECRET-TEXT SECRETVILLE")
    with pytest.raises(ValidationFailedError):
        env.send("  ")
    text = "\n".join(r.getMessage() for r in caplog.records)
    for secret in (
        "MESSAGE-SECRET-TEXT",
        "REPLY-SECRET-TEXT",
        "SECRETVILLE",
        BROWSER_A,
        "synthetic.pdf",
    ):
        assert secret not in text
    assert "chat_replied" in text and "chat_suggestions_dropped" in text

"""Red-line checks across interfaces (task 3.2): B-03 redaction and session ownership (ADR-008).

Markers such as ``ZZ...`` stand for personal data. They must never reach a log line, a standard
output line, an error body, or a stored file that is not allowed to hold them.
"""

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.ids import hash_token
from tests.e2e.support import (
    EMAIL,
    FILENAME,
    NAME,
    OTHER_BROWSER,
    PHONE,
    SESSIONS,
    World,
    chat_reply,
    model_response,
    parse_reply,
)

ROOT = Path(__file__).resolve().parents[2]  # the backend project root
CHAT_MARK = "ZZ-CHAT-MESSAGE-MARK"
MODEL_MARK = "ZZ-MODEL-REPLY-MARK"
SUGGESTED = "ZZ-SUGGESTED-CITY"
BAD_PHONE = "ZZ-BAD-PHONE-MARK"
MODEL_ERROR = "ZZ-MODEL-ERROR-BODY"
PARSE_MARK = "ZZ-PARSE-OUTPUT-MARK"


def test_logs_and_error_bodies_never_carry_personal_data(
    world: World, capsys: pytest.CaptureFixture[str], caplog: pytest.LogCaptureFixture
) -> None:
    error_bodies: list[str] = []
    world.model.expect(parse_reply())
    sid = world.upload().json()["session_id"]
    browser_id = world.client.cookies.get("browser_id")
    assert browser_id

    world.model.expect(chat_reply(MODEL_MARK, [{"field": "current_city", "value": SUGGESTED}]))
    sent = world.client.post(f"{SESSIONS}/{sid}/messages", json={"content": f"{CHAT_MARK} 改城市"})
    mid = sent.json()["assistant_message"]["message_id"]
    assert world.client.post(f"{SESSIONS}/{sid}/messages/{mid}/apply").status_code == 200

    invalid = world.client.patch(f"{SESSIONS}/{sid}/fields", json={"fields": {"phone": BAD_PHONE}})
    assert invalid.status_code == 422
    error_bodies.append(invalid.text)

    world.model.expect(model_response(MODEL_ERROR, status=500))  # the model fails
    failed_chat = world.client.post(f"{SESSIONS}/{sid}/messages", json={"content": "hi"})
    assert failed_chat.status_code == 502 and failed_chat.json()["code"] == "chat_failed"
    error_bodies.append(failed_chat.text)

    world.model.expect(model_response(f"not json {PARSE_MARK}"))  # unreadable output
    failed_parse = world.upload()
    assert failed_parse.status_code == 502 and failed_parse.json()["code"] == "parse_failed"
    error_bodies.append(failed_parse.text)

    saved = world.client.post(f"{SESSIONS}/{sid}/resume", json={"confirmed": True})
    assert saved.status_code == 201
    assert world.client.get(f"/api/v1/resumes/{saved.json()['resume_id']}/file").status_code == 200
    assert world.client.delete(f"{SESSIONS}/{sid}").status_code == 204

    # Logs are the only place the chat failure path writes, so the check is not vacuous.
    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert "chat_call" in logged
    captured = capsys.readouterr()
    output = "\n".join([logged, captured.out, captured.err])
    secrets = [
        NAME, PHONE, EMAIL, FILENAME, CHAT_MARK, MODEL_MARK, SUGGESTED,
        BAD_PHONE, MODEL_ERROR, PARSE_MARK, browser_id, hash_token(browser_id),
    ]  # fmt: skip
    for secret in secrets:
        assert secret not in output, secret
        assert all(secret not in body for body in error_bodies), secret


def test_browser_identifier_is_stored_only_as_a_hash(world: World) -> None:
    world.model.expect(parse_reply())
    world.upload()
    browser_id = world.client.cookies.get("browser_id")

    stored = [p.read_bytes() for p in (world.settings.data_dir.rglob("*.db"))]
    assert stored and all(browser_id.encode() not in blob for blob in stored)
    hashes = world.rows("drafts.db", "SELECT browser_hash FROM sessions")
    assert hashes == [(hash_token(browser_id),)]


OWNER_ACTIONS = [
    pytest.param("GET", f"{SESSIONS}/{{sid}}", None, id="get-session"),
    pytest.param("DELETE", f"{SESSIONS}/{{sid}}", None, id="delete-session"),
    pytest.param("PATCH", f"{SESSIONS}/{{sid}}/fields", {"fields": {"skills": ["X"]}}, id="fields"),
    pytest.param("POST", f"{SESSIONS}/{{sid}}/messages", {"content": "hi"}, id="send-message"),
    pytest.param("POST", f"{SESSIONS}/{{sid}}/messages/{{mid}}/apply", None, id="apply-card"),
    pytest.param("POST", f"{SESSIONS}/{{sid}}/messages/{{mid}}/cancel", None, id="cancel-card"),
    pytest.param("POST", f"{SESSIONS}/{{sid}}/resume", {"confirmed": True}, id="confirm-save"),
    pytest.param(
        "PUT", f"{SESSIONS}/{{sid}}/resume", {"confirm_update": True}, id="confirm-update"
    ),
    pytest.param("GET", f"{SESSIONS}/not-a-uuid", None, id="malformed-id"),
]


@pytest.mark.parametrize(("method", "template", "body"), OWNER_ACTIONS)
def test_another_browser_gets_one_404_and_changes_nothing(
    world: World, method: str, template: str, body: dict | None
) -> None:
    world.model.expect(parse_reply())
    sid = world.upload().json()["session_id"]
    world.model.expect(chat_reply("ok", [{"field": "current_city", "value": "BEIJING"}]))
    mid = world.client.post(f"{SESSIONS}/{sid}/messages", json={"content": "hi"}).json()[
        "assistant_message"
    ]["message_id"]
    before = world.snapshot()

    intruder = TestClient(world.app, raise_server_exceptions=False)
    intruder.cookies.set("browser_id", OTHER_BROWSER)
    response = intruder.request(method, template.format(sid=sid, mid=mid), json=body)

    assert response.status_code == 404, response.text
    assert response.json()["code"] == "session_not_found"
    assert "set-cookie" not in response.headers  # a refused request renews nothing
    assert world.snapshot() == before  # no row, card or file was touched
    assert world.client.get(f"{SESSIONS}/{sid}").status_code == 200  # the owner still has it


def test_example_env_holds_placeholders_only() -> None:
    text = (ROOT / ".env.example").read_text(encoding="utf-8")
    for line in text.splitlines():
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition("=")
        if re.search(r"KEY|SECRET|TOKEN|PASSWORD", key):
            assert value == "" or value.startswith("<"), key


def test_repository_has_no_key_shaped_string() -> None:
    """B-01: no key-shaped literal in source, tests, scripts or the sample environment file."""
    scanned = [
        p
        for base in ("src", "tests", "scripts")
        for p in (ROOT / base).rglob("*.py")
        if "__pycache__" not in p.parts
    ]
    scanned.append(ROOT / ".env.example")
    pattern = re.compile(r"\bsk-[A-Za-z0-9]{20,}")
    leaks = [p.name for p in scanned if pattern.search(p.read_text(encoding="utf-8"))]
    assert leaks == []

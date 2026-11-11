"""POST /api/v1/sessions/{id}/messages (task 2.11). Model is FakeChatClient."""

import logging

import pytest
from fastapi.testclient import TestClient

from app.core.errors import ChatFailedError
from tests.api.conftest import query
from tests.api.test_sessions_upload import upload
from tests.fakes import FakeChatClient, make_chat_result
from tests.openapi_support import openapi_available, schema_errors


def url(sid: str) -> str:
    return f"/api/v1/sessions/{sid}/messages"


def test_message_returns_201_with_both_messages_and_conforms(
    session_client: TestClient,
    fake_chat: FakeChatClient,
    settings,  # noqa: ANN001
) -> None:
    fake_chat.result = make_chat_result("ok", [("current_city", "BEIJING")])
    sid = upload(session_client).json()["session_id"]
    resp = session_client.post(url(sid), json={"content": "move to BEIJING"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["assistant_message"]["suggestions"][0]["new_value"] == "BEIJING"
    assert "Max-Age=34560000" in resp.headers["set-cookie"]
    if openapi_available():
        assert schema_errors("SendMessageResponse", body) == []
    assert query(settings, "SELECT count(*) FROM chat_messages") == [(2,)]
    assert query(settings, "SELECT count(*) FROM resumes", "resumes.db") == [(0,)]


@pytest.mark.parametrize(("content", "reason"), [("   ", "required"), ("x" * 2001, "too_long")])
def test_blank_or_too_long_message_is_422_on_content_and_only_the_length_is_logged(
    session_client: TestClient, caplog: pytest.LogCaptureFixture, content: str, reason: str
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    sid = upload(session_client).json()["session_id"]
    resp = session_client.post(url(sid), json={"content": content})
    assert resp.status_code == 422 and resp.json()["code"] == "validation_failed"
    assert resp.json()["details"] == [{"field": "content", "reason": reason}]
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert "chat_message_rejected" in text and "xxxxx" not in text


def test_model_failure_is_502_and_stores_nothing(
    session_client: TestClient,
    fake_chat: FakeChatClient,
    settings,  # noqa: ANN001
) -> None:
    fake_chat.error = ChatFailedError()
    sid = upload(session_client).json()["session_id"]
    resp = session_client.post(url(sid), json={"content": "hello"})
    assert resp.status_code == 502 and resp.json()["code"] == "chat_failed"
    assert query(settings, "SELECT count(*) FROM chat_messages") == [(0,)]
    assert "hello" not in resp.text


def test_foreign_is_404_and_saved_session_is_409(
    session_client: TestClient,
    session_app,  # noqa: ANN001
) -> None:
    sid = upload(session_client).json()["session_id"]
    other = TestClient(session_app, raise_server_exceptions=False)
    other.cookies.set("browser_id", "C" * 43)
    assert other.post(url(sid), json={"content": "hi"}).json()["code"] == "session_not_found"
    session_client.post(f"/api/v1/sessions/{sid}/resume", json={"confirmed": True})
    resp = session_client.post(url(sid), json={"content": "hi"})
    assert resp.status_code == 409 and resp.json()["code"] == "session_read_only"

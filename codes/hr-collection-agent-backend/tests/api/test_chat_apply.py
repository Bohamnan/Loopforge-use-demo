"""POST .../messages/{id}/apply and /cancel (task 2.12)."""

from fastapi.testclient import TestClient

from tests.api.conftest import query
from tests.api.test_sessions_upload import upload
from tests.fakes import FakeChatClient, make_chat_result
from tests.openapi_support import openapi_available, schema_errors


def make_card(client: TestClient, fake_chat: FakeChatClient) -> tuple[str, str]:
    fake_chat.result = make_chat_result("ok", [("current_city", "BEIJING")])
    sid = upload(client).json()["session_id"]
    mid = client.post(f"/api/v1/sessions/{sid}/messages", json={"content": "hi"}).json()
    return sid, mid["assistant_message"]["message_id"]


def test_apply_returns_the_card_and_fields_and_repeat_is_409(
    session_client: TestClient,
    fake_chat: FakeChatClient,
    settings,  # noqa: ANN001
) -> None:
    sid, mid = make_card(session_client, fake_chat)
    resp = session_client.post(f"/api/v1/sessions/{sid}/messages/{mid}/apply")
    assert resp.status_code == 200
    body = resp.json()
    assert body["fields"]["current_city"] == {"value": "BEIJING", "status": "confirmed"}
    assert body["suggestions"][0]["status"] == "applied"
    if openapi_available():
        assert schema_errors("SuggestionActionResponse", body) == []
    again = session_client.post(f"/api/v1/sessions/{sid}/messages/{mid}/apply")
    assert again.status_code == 409 and again.json()["code"] == "suggestion_unavailable"
    assert query(settings, "SELECT count(*) FROM resumes", "resumes.db") == [(0,)]


def test_cancel_keeps_the_fields_and_later_apply_is_409(
    session_client: TestClient, fake_chat: FakeChatClient
) -> None:
    sid, mid = make_card(session_client, fake_chat)
    resp = session_client.post(f"/api/v1/sessions/{sid}/messages/{mid}/cancel")
    assert resp.status_code == 200 and resp.json()["suggestions"][0]["status"] == "cancelled"
    assert resp.json()["fields"]["current_city"]["status"] == "uncertain"
    after = session_client.post(f"/api/v1/sessions/{sid}/messages/{mid}/apply")
    assert after.status_code == 409


def test_foreign_browser_gets_404_for_both_actions(
    session_client: TestClient,
    session_app,
    fake_chat: FakeChatClient,  # noqa: ANN001
) -> None:
    sid, mid = make_card(session_client, fake_chat)
    other = TestClient(session_app, raise_server_exceptions=False)
    other.cookies.set("browser_id", "C" * 43)
    for action in ("apply", "cancel"):
        resp = other.post(f"/api/v1/sessions/{sid}/messages/{mid}/{action}")
        assert resp.status_code == 404 and resp.json()["code"] == "session_not_found"

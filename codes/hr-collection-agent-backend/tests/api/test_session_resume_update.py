"""PUT /api/v1/sessions/{id}/resume (task 2.9)."""

import pytest
from fastapi.testclient import TestClient

from tests.api.conftest import query
from tests.api.test_sessions_upload import upload
from tests.openapi_support import openapi_available, schema_errors


def url(sid: str) -> str:
    return f"/api/v1/sessions/{sid}/resume"


def pending_session(client: TestClient) -> str:
    client.post(url(upload(client).json()["session_id"]), json={"confirmed": True})
    sid = upload(client).json()["session_id"]
    assert client.post(url(sid), json={"confirmed": True}).status_code == 200
    return sid


def test_confirmed_update_is_200_and_applies_the_session(
    session_client: TestClient,
    settings,  # noqa: ANN001
) -> None:
    sid = pending_session(session_client)
    resp = session_client.put(url(sid), json={"confirm_update": True})
    assert resp.status_code == 200 and "Max-Age=34560000" in resp.headers["set-cookie"]
    assert query(settings, f"SELECT update_state FROM sessions WHERE id = '{sid}'") == [
        ("applied",)
    ]
    assert query(settings, "SELECT count(*) FROM resumes", "resumes.db") == [(1,)]
    if openapi_available():
        assert schema_errors("UpdateResumeResponse", resp.json()) == []
    assert session_client.put(url(sid), json={"confirm_update": True}).json() == resp.json()


@pytest.mark.parametrize("body", [{}, {"confirm_update": False}, {"confirm_update": "yes"}])
def test_missing_or_non_true_confirmation_is_422_and_changes_nothing(
    session_client: TestClient,
    settings,
    body: dict,  # noqa: ANN001
) -> None:
    sid = pending_session(session_client)
    resp = session_client.put(url(sid), json=body)
    assert resp.status_code == 422 and resp.json()["code"] == "confirmation_required"
    assert query(settings, "SELECT update_state FROM sessions WHERE update_state != 'none'") == [
        ("pending",)
    ]


def test_session_without_a_candidate_is_409_and_foreign_is_404(
    session_client: TestClient,
    session_app,  # noqa: ANN001
) -> None:
    sid = upload(session_client).json()["session_id"]  # still reviewing
    resp = session_client.put(url(sid), json={"confirm_update": True})
    assert resp.status_code == 409 and resp.json()["code"] == "update_not_available"
    other = TestClient(session_app, raise_server_exceptions=False)
    other.cookies.set("browser_id", "C" * 43)
    assert other.put(url(sid), json={"confirm_update": True}).json()["code"] == "session_not_found"

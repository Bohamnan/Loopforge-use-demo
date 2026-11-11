"""GET /api/v1/sessions/{id} (task 2.2)."""

import pytest
from fastapi.testclient import TestClient

from tests.api.test_sessions_upload import upload
from tests.openapi_support import openapi_available, schema_errors


def test_get_returns_the_session_and_renews_the_cookie(session_client: TestClient) -> None:
    sid = upload(session_client).json()["session_id"]
    resp = session_client.get(f"/api/v1/sessions/{sid}")
    assert resp.status_code == 200 and resp.json()["session_id"] == sid
    assert "Max-Age=34560000" in resp.headers["set-cookie"]
    if openapi_available():
        assert schema_errors("SessionDetail", resp.json()) == []


@pytest.mark.parametrize("who", ["other", "none"])
def test_foreign_unknown_or_anonymous_access_is_the_same_404(
    session_client: TestClient,
    session_app,
    who: str,  # noqa: ANN001
) -> None:
    sid = upload(session_client).json()["session_id"]
    other = TestClient(session_app, raise_server_exceptions=False)
    if who == "other":
        other.cookies.set("browser_id", "C" * 43)
    resp = other.get(f"/api/v1/sessions/{sid}")
    assert resp.status_code == 404 and resp.json()["code"] == "session_not_found"
    assert "set-cookie" not in resp.headers and "ZHANG" not in resp.text

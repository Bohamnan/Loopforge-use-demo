"""PATCH /api/v1/sessions/{id}/fields (task 2.3)."""

from fastapi.testclient import TestClient

from tests.api.conftest import query
from tests.api.test_sessions_upload import upload
from tests.openapi_support import openapi_available, schema_errors


def url(sid: str) -> str:
    return f"/api/v1/sessions/{sid}/fields"


def test_patch_confirms_fields_and_conforms_to_the_contract(
    session_client: TestClient, settings
) -> None:  # noqa: ANN001
    sid = upload(session_client).json()["session_id"]
    resp = session_client.patch(url(sid), json={"fields": {"job_title": "Staff"}})
    assert resp.status_code == 200
    assert resp.json()["fields"]["job_title"] == {"value": "Staff", "status": "confirmed"}
    assert "Max-Age=34560000" in resp.headers["set-cookie"]
    if openapi_available():
        assert schema_errors("SessionFieldsResponse", resp.json()) == []
    assert query(settings, "SELECT count(*) FROM sessions") == [(1,)]


def test_invalid_bodies_give_422_without_echoing_values(session_client: TestClient) -> None:
    sid = upload(session_client).json()["session_id"]
    bad = session_client.patch(url(sid), json={"fields": {"phone": "ZZ-secret"}})
    empty = session_client.patch(url(sid), json={"fields": {}})
    assert bad.status_code == empty.status_code == 422
    assert bad.json()["details"] == [{"field": "phone", "reason": "invalid_format"}]
    assert "ZZ-secret" not in bad.text
    assert empty.json()["details"] == [{"field": "fields", "reason": "required"}]


def test_patch_of_a_foreign_session_is_404(session_client: TestClient, session_app) -> None:  # noqa: ANN001
    sid = upload(session_client).json()["session_id"]
    other = TestClient(session_app, raise_server_exceptions=False)
    other.cookies.set("browser_id", "C" * 43)
    resp = other.patch(url(sid), json={"fields": {"job_title": "X"}})
    assert resp.status_code == 404 and resp.json()["code"] == "session_not_found"

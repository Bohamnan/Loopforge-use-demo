"""DELETE /api/v1/sessions/{id} (task 2.8)."""

from fastapi.testclient import TestClient

from tests.api.conftest import query, session_files
from tests.api.test_sessions_upload import upload


def test_delete_is_204_then_404_and_keeps_the_saved_resume(
    session_client: TestClient,
    settings,  # noqa: ANN001
) -> None:
    sid = upload(session_client).json()["session_id"]
    session_client.post(f"/api/v1/sessions/{sid}/resume", json={"confirmed": True})
    resp = session_client.delete(f"/api/v1/sessions/{sid}")
    assert resp.status_code == 204 and resp.content == b""
    assert query(settings, "SELECT count(*) FROM sessions") == [(0,)]
    assert query(settings, "SELECT count(*) FROM resumes", "resumes.db") == [(1,)]
    again = session_client.delete(f"/api/v1/sessions/{sid}")
    assert again.status_code == 404 and again.json()["code"] == "session_not_found"
    assert session_files(settings) == set()


def test_foreign_delete_is_404_and_deletes_nothing(
    session_client: TestClient,
    session_app,
    settings,  # noqa: ANN001
) -> None:
    sid = upload(session_client).json()["session_id"]
    other = TestClient(session_app, raise_server_exceptions=False)
    other.cookies.set("browser_id", "C" * 43)
    assert other.delete(f"/api/v1/sessions/{sid}").status_code == 404
    assert query(settings, "SELECT count(*) FROM sessions") == [(1,)]

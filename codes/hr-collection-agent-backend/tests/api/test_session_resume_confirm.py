"""POST /api/v1/sessions/{id}/resume (task 2.4). Model is FakeParserClient."""

import pytest
from fastapi.testclient import TestClient

from tests.api.conftest import query
from tests.api.test_sessions_upload import upload
from tests.openapi_support import openapi_available, schema_errors


def url(sid: str) -> str:
    return f"/api/v1/sessions/{sid}/resume"


def test_first_save_is_201_keeps_the_cookie_and_the_session(
    session_client: TestClient,
    settings,  # noqa: ANN001
) -> None:
    sid = upload(session_client).json()["session_id"]
    resp = session_client.post(url(sid), json={"confirmed": True})
    assert resp.status_code == 201 and resp.json()["already_saved"] is False
    assert "Max-Age=34560000" in resp.headers["set-cookie"]  # renewed, never cleared
    assert query(settings, "SELECT status FROM sessions") == [("saved",)]
    assert query(settings, "SELECT count(*) FROM resumes", "resumes.db") == [(1,)]
    if openapi_available():
        assert schema_errors("CreateResumeResponse", resp.json()) == []


def test_same_person_again_is_200_without_a_second_record(
    session_client: TestClient,
    settings,  # noqa: ANN001
) -> None:
    first = session_client.post(
        url(upload(session_client).json()["session_id"]), json={"confirmed": True}
    )
    second = session_client.post(
        url(upload(session_client).json()["session_id"]), json={"confirmed": True}
    )
    assert second.status_code == 200 and second.json()["already_saved"] is True
    assert second.json()["resume_id"] == first.json()["resume_id"]
    assert query(settings, "SELECT count(*) FROM resumes", "resumes.db") == [(1,)]
    states = query(settings, "SELECT update_state FROM sessions")
    assert sorted(states) == [("none",), ("pending",)]


@pytest.mark.parametrize("body", [{}, {"confirmed": False}, {"confirmed": "true"}])
def test_missing_or_non_true_confirmation_is_422_and_writes_nothing(
    session_client: TestClient,
    settings,
    body: dict,  # noqa: ANN001
) -> None:
    sid = upload(session_client).json()["session_id"]
    resp = session_client.post(url(sid), json=body)
    assert resp.status_code == 422 and resp.json()["code"] == "confirmation_required"
    assert query(settings, "SELECT count(*) FROM resumes", "resumes.db") == [(0,)]


def test_foreign_session_is_404_and_saved_session_is_409(
    session_client: TestClient,
    session_app,  # noqa: ANN001
) -> None:
    sid = upload(session_client).json()["session_id"]
    other = TestClient(session_app, raise_server_exceptions=False)
    other.cookies.set("browser_id", "C" * 43)
    assert other.post(url(sid), json={"confirmed": True}).json()["code"] == "session_not_found"
    session_client.post(url(sid), json={"confirmed": True})
    again = session_client.post(url(sid), json={"confirmed": True})
    assert again.status_code == 409 and again.json()["code"] == "session_read_only"

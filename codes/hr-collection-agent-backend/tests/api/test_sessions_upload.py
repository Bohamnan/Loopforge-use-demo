"""POST/GET /api/v1/sessions (task 2.1). Model is FakeParserClient."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.errors import ParseFailedError, ParseTimeoutError, ParseUnavailableError
from tests.api.conftest import query, session_files
from tests.fakes import FakeParserClient
from tests.helpers import make_pdf_bytes
from tests.openapi_support import openapi_available, schema_errors

URL = "/api/v1/sessions"


def upload(client: TestClient, name: str = "resume.pdf", content: bytes | None = None):  # noqa: ANN201
    data = make_pdf_bytes(300) if content is None else content
    return client.post(URL, files={"file": (name, data, "application/pdf")})


def test_upload_returns_201_with_session_and_browser_cookie(
    session_client: TestClient, settings: Settings
) -> None:
    resp = upload(session_client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "reviewing" and body["fields"]["name"]["status"] == "recognized"
    attrs = {p.strip() for p in resp.headers["set-cookie"].split(";")}
    assert resp.headers["set-cookie"].startswith("browser_id=")
    assert {"HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=34560000"} <= attrs
    assert query(settings, "SELECT count(*) FROM sessions") == [(1,)]


def test_second_upload_keeps_both_sessions_and_renews_the_same_cookie(
    session_client: TestClient, settings: Settings
) -> None:
    first = upload(session_client)
    second = upload(session_client)
    assert first.headers["set-cookie"].split(";")[0] == second.headers["set-cookie"].split(";")[0]
    assert query(settings, "SELECT count(*) FROM sessions") == [(2,)]
    assert len(session_client.get(URL).json()["items"]) == 2


@pytest.mark.parametrize(
    ("error", "status"),
    [(ParseFailedError(), 502), (ParseUnavailableError(), 503), (ParseTimeoutError(), 504)],
)
def test_parse_failure_has_no_cookie_no_row_no_file(
    session_client: TestClient,
    settings: Settings,
    fake_parser: FakeParserClient,
    error: Exception,
    status: int,
) -> None:
    fake_parser.error = error
    resp = upload(session_client)
    assert resp.status_code == status and "set-cookie" not in resp.headers
    assert query(settings, "SELECT count(*) FROM sessions") == [(0,)]
    assert session_files(settings) == set()


def test_validation_failure_has_no_cookie_and_missing_file_is_file_missing(
    session_client: TestClient,
) -> None:
    resp = upload(session_client, name="x.txt")
    assert resp.status_code == 415 and "set-cookie" not in resp.headers
    assert session_client.post(URL).json()["code"] == "file_missing"


def test_list_without_identifier_is_empty_and_issues_no_cookie(session_client: TestClient) -> None:
    resp = session_client.get(URL)
    assert resp.status_code == 200 and resp.json() == {"items": []}
    assert "set-cookie" not in resp.headers


@pytest.mark.skipif(not openapi_available(), reason="frozen openapi.yaml not found")
def test_responses_conform_to_openapi(session_client: TestClient) -> None:
    created = upload(session_client)
    assert schema_errors("SessionDetail", created.json()) == []
    assert schema_errors("SessionListResponse", session_client.get(URL).json()) == []

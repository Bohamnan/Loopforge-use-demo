import logging

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from tests.api.conftest import draft_rows
from tests.fakes import FakeClock
from tests.helpers import make_pdf_bytes
from tests.openapi_support import openapi_available, schema_errors

URL = "/api/v1/resume-drafts"
CURRENT = f"{URL}/current"


def upload(client: TestClient):  # noqa: ANN201
    return client.post(URL, files={"file": ("resume.pdf", make_pdf_bytes(300), "application/pdf")})


def attrs(header: str) -> set[str]:
    return {p.strip() for p in header.split(";")}


def test_get_returns_the_current_draft(draft_client: TestClient) -> None:
    created = upload(draft_client).json()
    resp = draft_client.get(CURRENT)
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {
        "draft_id",
        "original_file",
        "fields",
        "created_at",
        "updated_at",
        "expires_at",
    }
    assert body == created  # nothing changed: same content, same timestamps


def test_get_has_no_question_or_next_field_information(draft_client: TestClient) -> None:
    upload(draft_client)
    body = draft_client.get(CURRENT).json()
    assert "next_field" not in body and "question" not in body
    assert all(set(node) == {"value", "status"} for node in body["fields"].values())


def test_get_slides_the_cookie_with_identical_attributes(draft_client: TestClient) -> None:
    created = upload(draft_client)
    token = draft_client.cookies.get("draft_token")
    resp = draft_client.get(CURRENT)
    header = resp.headers["set-cookie"]
    assert header.startswith(f"draft_token={token};")  # same value, renewed
    assert {"HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=604800"} <= attrs(header)
    assert "Secure" not in attrs(header)
    assert created.status_code == 201


def test_get_refreshes_expiry_and_last_activity(
    draft_client: TestClient, settings: Settings, fake_clock: FakeClock
) -> None:
    created = upload(draft_client).json()
    fake_clock.advance(days=3)
    body = draft_client.get(CURRENT).json()
    assert (
        body["expires_at"] == "2026-11-20T08:00:00Z" and body["expires_at"] != created["expires_at"]
    )
    assert body["updated_at"] == created["updated_at"]
    (row,) = draft_rows(settings)
    assert (
        row["last_active_at"] == "2026-11-13T08:00:00Z"
        and row["updated_at"] == "2026-11-10T08:00:00Z"
    )


def test_activity_keeps_the_draft_alive_beyond_seven_days(
    draft_client: TestClient, fake_clock: FakeClock
) -> None:
    upload(draft_client)
    for _ in range(3):
        fake_clock.advance(days=6)
        assert draft_client.get(CURRENT).status_code == 200


# ---- 404 draft_not_found (O-10, O-12) ----------------------------------------------------------


def assert_not_found(resp) -> None:  # noqa: ANN001
    assert resp.status_code == 404
    assert resp.json()["code"] == "draft_not_found"
    assert set(resp.json()) == {"code", "message", "request_id"}
    assert "set-cookie" not in resp.headers


def test_no_cookie_is_404_draft_not_found(draft_client: TestClient) -> None:
    assert_not_found(draft_client.get(CURRENT))


def test_unknown_cookie_is_404(draft_client: TestClient) -> None:
    upload(draft_client)
    draft_client.cookies.set("draft_token", "not-a-real-token")
    assert_not_found(draft_client.get(CURRENT))


def test_empty_cookie_is_404(draft_client: TestClient) -> None:
    draft_client.cookies.set("draft_token", "")
    assert_not_found(draft_client.get(CURRENT))


def test_expired_draft_is_404_and_not_touched(
    draft_client: TestClient, settings: Settings, fake_clock: FakeClock
) -> None:
    upload(draft_client)
    fake_clock.advance(days=7, seconds=1)
    assert_not_found(draft_client.get(CURRENT))
    assert draft_rows(settings)[0]["last_active_at"] == "2026-11-10T08:00:00Z"


def test_404_body_contains_no_resume_content(draft_client: TestClient) -> None:
    upload(draft_client)
    draft_client.cookies.set("draft_token", "wrong")
    assert "ZHANG" not in draft_client.get(CURRENT).text


def test_after_a_new_upload_the_old_token_is_gone(draft_client: TestClient) -> None:
    upload(draft_client)
    old = draft_client.cookies.get("draft_token")
    upload(draft_client)
    new = draft_client.cookies.get("draft_token")
    assert old != new
    draft_client.cookies.set("draft_token", old)
    assert_not_found(draft_client.get(CURRENT))
    draft_client.cookies.set("draft_token", new)
    assert draft_client.get(CURRENT).status_code == 200


@pytest.mark.skipif(not openapi_available(), reason="frozen openapi.yaml not found")
def test_responses_conform_to_openapi(draft_client: TestClient) -> None:
    upload(draft_client)
    assert schema_errors("DraftResponse", draft_client.get(CURRENT).json()) == []
    draft_client.cookies.clear()
    assert schema_errors("ErrorResponse", draft_client.get(CURRENT).json()) == []


def test_reads_do_not_log_resume_content(
    draft_client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    upload(draft_client)
    draft_client.get(CURRENT)
    token = draft_client.cookies.get("draft_token")
    logs = "\n".join(r.getMessage() for r in caplog.records)
    assert "ZHANG SAN" not in logs and token not in logs

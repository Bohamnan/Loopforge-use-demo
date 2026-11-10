import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.errors import ParseFailedError, ParseTimeoutError, ParseUnavailableError
from app.core.ids import hash_token
from tests.api.conftest import draft_files, draft_rows
from tests.fakes import FakeParserClient
from tests.helpers import make_jpeg_bytes, make_pdf_bytes, make_png_bytes
from tests.openapi_support import openapi_available, schema_errors

URL = "/api/v1/resume-drafts"


def upload(
    client: TestClient,
    name: str = "resume.pdf",
    content: bytes | None = None,
    mime: str = "application/pdf",
):
    data = make_pdf_bytes(300) if content is None else content
    return client.post(URL, files={"file": (name, data, mime)})


def cookie_header(resp) -> str:  # noqa: ANN001
    return resp.headers["set-cookie"]


# ---- success ------------------------------------------------------------------------------------


def test_upload_returns_201_with_draft_and_cookie(
    draft_client: TestClient, settings: Settings
) -> None:
    resp = upload(draft_client)
    assert resp.status_code == 201
    body = resp.json()
    assert set(body) == {
        "draft_id",
        "original_file",
        "fields",
        "created_at",
        "updated_at",
        "expires_at",
    }
    assert body["original_file"] == {
        "filename": "resume.pdf",
        "content_type": "application/pdf",
        "size_bytes": 300,
    }
    assert body["fields"]["name"] == {"value": "ZHANG SAN", "status": "recognized"}
    assert body["fields"]["gender"] == {"value": None, "status": "missing"}
    assert body["created_at"] == body["updated_at"] == "2026-11-10T08:00:00Z"
    assert body["expires_at"] == "2026-11-17T08:00:00Z"
    header = cookie_header(resp)
    attrs = {p.strip() for p in header.split(";")}
    assert (
        header.startswith("draft_token=")
        and {"HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=604800"} <= attrs
    )
    assert "Secure" not in attrs


def test_cookie_token_matches_the_stored_hash_and_is_never_in_the_body(
    draft_client: TestClient, settings: Settings
) -> None:
    resp = upload(draft_client)
    token = draft_client.cookies.get("draft_token")
    (row,) = draft_rows(settings)
    assert (
        row["token_hash"] == hash_token(token)
        and token not in resp.text
        and token not in row["fields_json"]
    )


def test_data_layer_after_upload(draft_client: TestClient, settings: Settings) -> None:
    resp = upload(draft_client, content=make_pdf_bytes(300))
    (row,) = draft_rows(settings)
    assert row["id"] == resp.json()["draft_id"]
    assert row["file_path"] == f"{row['id']}.pdf" and draft_files(settings) == {row["file_path"]}
    assert (settings.data_dir / "drafts" / row["file_path"]).read_bytes() == make_pdf_bytes(300)
    assert json.loads(row["fields_json"])["name"] == {"value": "ZHANG SAN", "status": "recognized"}


@pytest.mark.parametrize(
    ("name", "content", "mime", "stored_type"),
    [
        ("a.jpg", make_jpeg_bytes(), "image/jpeg", "image/jpeg"),
        (
            "a.jpeg",
            make_jpeg_bytes(),
            "application/octet-stream",
            "image/jpeg",
        ),  # client type ignored
        ("a.png", make_png_bytes(), "text/plain", "image/png"),
        ("a.pdf", make_pdf_bytes(), "image/png", "application/pdf"),
    ],
)
def test_supported_types_and_client_content_type_is_ignored(
    draft_client: TestClient, name: str, content: bytes, mime: str, stored_type: str
) -> None:
    resp = upload(draft_client, name, content, mime)
    assert resp.status_code == 201
    assert resp.json()["original_file"]["content_type"] == stored_type


def test_every_upload_creates_a_new_draft_and_token(
    draft_client: TestClient, settings: Settings
) -> None:
    first = upload(draft_client)
    token1 = draft_client.cookies.get("draft_token")
    second = upload(draft_client)
    assert first.json()["draft_id"] != second.json()["draft_id"]
    assert draft_client.cookies.get("draft_token") != token1  # cookie holds the latest token


@pytest.mark.skipif(not openapi_available(), reason="frozen openapi.yaml not found")
def test_response_conforms_to_openapi(draft_client: TestClient) -> None:
    assert schema_errors("DraftResponse", upload(draft_client).json()) == []


# ---- O-02 / O-03 -------------------------------------------------------------------------------


def test_reupload_with_valid_cookie_deletes_the_old_draft(
    draft_client: TestClient, settings: Settings
) -> None:
    first = upload(draft_client)
    old_files = draft_files(settings)
    second = upload(draft_client)
    ids = [r["id"] for r in draft_rows(settings)]
    assert ids == [second.json()["draft_id"]] and first.json()["draft_id"] not in ids
    assert draft_files(settings) != old_files and len(draft_files(settings)) == 1


@pytest.mark.parametrize(
    "error",
    [ParseFailedError(), ParseUnavailableError(), ParseTimeoutError()],
)
def test_model_failure_keeps_the_old_draft_and_cookie(
    draft_client: TestClient, settings: Settings, fake_parser: FakeParserClient, error: Exception
) -> None:
    upload(draft_client)
    old_token = draft_client.cookies.get("draft_token")
    before = [dict(r) for r in draft_rows(settings)]
    files_before = draft_files(settings)
    fake_parser.error = error
    resp = upload(draft_client, "new.pdf")
    assert resp.status_code == error.http_status
    assert "set-cookie" not in resp.headers  # the cookie is not changed (O-02)
    assert draft_client.cookies.get("draft_token") == old_token
    assert [dict(r) for r in draft_rows(settings)] == before and draft_files(
        settings
    ) == files_before


# ---- error codes ---------------------------------------------------------------------------------


def error_of(resp) -> tuple[int, str]:  # noqa: ANN001
    body = resp.json()
    assert set(body) == {"code", "message", "request_id"}
    return resp.status_code, body["code"]


def assert_nothing_created(client: TestClient, settings: Settings, resp) -> None:  # noqa: ANN001
    assert "set-cookie" not in resp.headers
    assert draft_rows(settings) == [] and draft_files(settings) == set()


def test_no_file_part_is_400_file_missing(draft_client: TestClient, settings: Settings) -> None:
    resp = draft_client.post(URL)
    assert error_of(resp) == (400, "file_missing")
    assert_nothing_created(draft_client, settings, resp)
    assert error_of(draft_client.post(URL, data={"other": "x"})) == (400, "file_missing")


def test_empty_file_is_400_file_empty(draft_client: TestClient, settings: Settings) -> None:
    resp = upload(draft_client, content=b"")
    assert error_of(resp) == (400, "file_empty")
    assert_nothing_created(draft_client, settings, resp)


def test_wrong_content_is_400_file_content_mismatch(
    draft_client: TestClient, settings: Settings
) -> None:
    resp = upload(draft_client, "fake.pdf", make_png_bytes())
    assert error_of(resp) == (400, "file_content_mismatch")
    assert_nothing_created(draft_client, settings, resp)
    assert (
        upload(draft_client, "noise.jpg", b"not an image").json()["code"] == "file_content_mismatch"
    )


def test_too_large_is_413(
    draft_client: TestClient, settings: Settings, fake_parser: FakeParserClient
) -> None:
    resp = upload(draft_client, content=make_pdf_bytes(10 * 1024 * 1024 + 1))
    assert error_of(resp) == (413, "file_too_large")
    assert_nothing_created(draft_client, settings, resp)
    assert fake_parser.calls == []  # the model is never called


def test_exactly_ten_megabytes_is_accepted(draft_client: TestClient) -> None:
    resp = upload(draft_client, content=make_pdf_bytes(10 * 1024 * 1024))
    assert resp.status_code == 201 and resp.json()["original_file"]["size_bytes"] == 10485760


@pytest.mark.parametrize("name", ["resume.docx", "resume.txt", "resume", "resume.gif"])
def test_unsupported_type_is_415(
    draft_client: TestClient, settings: Settings, fake_parser: FakeParserClient, name: str
) -> None:
    resp = upload(draft_client, name)
    assert error_of(resp) == (415, "unsupported_file_type")
    assert_nothing_created(draft_client, settings, resp)
    assert fake_parser.calls == []


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (ParseFailedError(), (502, "parse_failed")),
        (ParseUnavailableError(), (503, "parse_unavailable")),
        (ParseTimeoutError(), (504, "parse_timeout")),
    ],
)
def test_parse_errors_map_to_502_503_504(
    draft_client: TestClient,
    settings: Settings,
    fake_parser: FakeParserClient,
    error: Exception,
    expected: tuple[int, str],
) -> None:
    fake_parser.error = error
    resp = upload(draft_client)
    assert error_of(resp) == expected
    assert_nothing_created(draft_client, settings, resp)


def test_unusable_model_output_is_502_parse_failed(
    draft_client: TestClient, settings: Settings, fake_parser: FakeParserClient
) -> None:
    from app.schemas.parse import RawParseResult

    fake_parser.result = RawParseResult(data={"unrelated": 1})
    resp = upload(draft_client)
    assert error_of(resp) == (502, "parse_failed")
    assert_nothing_created(draft_client, settings, resp)


def test_unexpected_error_is_500_internal_error(
    draft_client: TestClient, settings: Settings, fake_parser: FakeParserClient
) -> None:
    fake_parser.error = RuntimeError("ZZ-secret-boom")
    resp = upload(draft_client)
    assert error_of(resp) == (500, "internal_error")
    assert "ZZ-secret-boom" not in resp.text
    assert_nothing_created(draft_client, settings, resp)


# ---- B-03: nothing sensitive in logs or error bodies -------------------------------------------


def test_logs_and_errors_do_not_contain_file_names_or_content(
    draft_client: TestClient, fake_parser: FakeParserClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    upload(draft_client, "ZZ-secret-name.pdf")
    fake_parser.error = ParseFailedError()
    failed = upload(draft_client, "ZZ-secret-name2.pdf")
    logs = "\n".join(r.getMessage() for r in caplog.records)
    for text in (logs, failed.text):
        assert "ZZ-secret-name" not in text and "ZHANG SAN" not in text
    token = draft_client.cookies.get("draft_token")
    assert token not in logs and hash_token(token) not in logs

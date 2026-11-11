"""GET /api/v1/resumes, /{id}, /{id}/file (task 2.13)."""

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from tests.api.test_sessions_upload import upload
from tests.openapi_support import openapi_available, schema_errors

PDF = b"%PDF-1.4 archived"


def save_one(client: TestClient, settings: Settings) -> str:
    sid = upload(client, name="resume.pdf", content=PDF).json()["session_id"]
    return client.post(f"/api/v1/sessions/{sid}/resume", json={"confirmed": True}).json()[
        "resume_id"
    ]


def test_list_and_detail_conform_and_need_no_cookie(
    session_client: TestClient,
    session_app,
    settings: Settings,  # noqa: ANN001
) -> None:
    rid = save_one(session_client, settings)
    anonymous = TestClient(session_app, raise_server_exceptions=False)

    listing = anonymous.get("/api/v1/resumes")
    detail = anonymous.get(f"/api/v1/resumes/{rid}")

    assert listing.status_code == detail.status_code == 200
    assert listing.json()["items"][0]["resume_id"] == rid
    assert detail.json()["file_available"] is True and "set-cookie" not in listing.headers
    if openapi_available():
        assert schema_errors("ResumeListResponse", listing.json()) == []
        assert schema_errors("ArchivedResume", detail.json()) == []
    assert anonymous.get("/api/v1/resumes/nope").json()["code"] == "resume_not_found"


def test_download_sends_the_attachment_with_safe_headers(
    session_client: TestClient, settings: Settings
) -> None:
    rid = save_one(session_client, settings)
    conn = sqlite3.connect(settings.data_dir / "resumes.db")
    conn.execute("UPDATE resumes SET original_filename = ?", ("简历\r\nX.pdf",))
    conn.commit()
    conn.close()

    resp = session_client.get(f"/api/v1/resumes/{rid}/file")

    assert resp.status_code == 200 and resp.content == PDF
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.headers["x-content-type-options"] == "nosniff"
    disposition = resp.headers["content-disposition"]
    assert disposition == "attachment; filename*=UTF-8''%E7%AE%80%E5%8E%86X.pdf"
    assert "\r" not in disposition and str(settings.file_dir) not in resp.text


def test_missing_file_is_404_file_not_available_but_detail_still_reads(
    session_client: TestClient, settings: Settings
) -> None:
    rid = save_one(session_client, settings)
    for path in Path(settings.file_dir).iterdir():
        path.unlink()
    resp = session_client.get(f"/api/v1/resumes/{rid}/file")
    assert resp.status_code == 404 and resp.json()["code"] == "file_not_available"
    assert session_client.get(f"/api/v1/resumes/{rid}").json()["file_available"] is False
    assert session_client.get("/api/v1/resumes/nope/file").json()["code"] == "resume_not_found"

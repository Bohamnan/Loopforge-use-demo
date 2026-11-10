"""POST /api/v1/resumes (interface 4): HTTP behaviour plus database and file checks."""

import logging
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.db import init_resumes_db
from app.main import create_app
from tests.fakes import FakeClock, FakeParserClient, make_raw_result
from tests.helpers import make_pdf_bytes
from tests.openapi_support import schema_errors

UPLOAD = "/api/v1/resume-drafts"
CONFIRM = "/api/v1/resumes"
CLEARED = "draft_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"


@pytest.fixture
def api(settings: Settings, fake_parser: FakeParserClient, fake_clock: FakeClock) -> TestClient:
    from app.core.db import init_drafts_db

    init_drafts_db(settings.data_dir / "drafts.db")
    init_resumes_db(settings.data_dir / "resumes.db")
    app = create_app(settings, parser_client=fake_parser, clock=fake_clock)
    return TestClient(app, raise_server_exceptions=False)


def upload(client: TestClient):  # noqa: ANN201
    return client.post(UPLOAD, files={"file": ("cv.pdf", make_pdf_bytes(300), "application/pdf")})


def resumes(settings: Settings, sql: str = "SELECT count(*) FROM resumes") -> list:
    conn = sqlite3.connect(settings.data_dir / "resumes.db")
    try:
        return conn.execute(sql).fetchall()
    finally:
        conn.close()


def archived(settings: Settings) -> list[str]:
    return sorted(p.name for p in settings.file_dir.iterdir())


def set_identity(fake_parser: FakeParserClient, **fields: object) -> None:
    nodes = {k: {"value": v, "status": "recognized"} for k, v in fields.items()}
    fake_parser.result = make_raw_result(**nodes)


def test_confirm_creates_201_and_clears_cookie(api: TestClient, settings: Settings) -> None:
    upload(api)
    resp = api.post(CONFIRM, json={"confirmed": True})

    assert resp.status_code == 201
    body = resp.json()
    assert schema_errors("CreateResumeResponse", body) == []
    assert body["already_saved"] is False
    assert resp.headers.get_list("set-cookie") == [CLEARED]
    assert resumes(settings, "SELECT id, file_path FROM resumes") == [
        (body["resume_id"], f"{body['resume_id']}.pdf")
    ]
    assert archived(settings) == [f"{body['resume_id']}.pdf"]
    assert (settings.data_dir / "drafts").exists()
    assert list((settings.data_dir / "drafts").iterdir()) == []
    conn = sqlite3.connect(settings.data_dir / "drafts.db")
    assert conn.execute("SELECT count(*) FROM drafts").fetchone()[0] == 0
    conn.close()


def test_confirm_twice_same_person_is_200_already_saved(
    api: TestClient, settings: Settings, fake_parser: FakeParserClient
) -> None:
    upload(api)
    first = api.post(CONFIRM, json={"confirmed": True}).json()
    set_identity(fake_parser, phone="+86 138-0013-8000", email="zs@example.com")
    upload(api)  # same person, different notation

    resp = api.post(CONFIRM, json={"confirmed": True})

    assert resp.status_code == 200
    assert schema_errors("CreateResumeResponse", resp.json()) == []
    assert resp.json() == {**first, "already_saved": True}
    assert resp.headers.get_list("set-cookie") == [CLEARED]
    assert resumes(settings) == [(1,)]
    assert archived(settings) == [f"{first['resume_id']}.pdf"]


@pytest.mark.parametrize(
    "body",
    [
        {"confirmed": False},
        {},
        {"confirmed": "yes"},
        {"confirmed": "true"},
        {"confirmed": 1},
        {"confirmed": "1"},
        {"confirmed": "on"},
        {"confirmed": None},
        {"confirmed": []},
    ],
)
def test_without_confirmation_is_422_and_writes_nothing(
    api: TestClient, settings: Settings, body: dict
) -> None:
    upload(api)
    resp = api.post(CONFIRM, json=body)

    assert resp.status_code == 422 and resp.json()["code"] == "confirmation_required"
    assert resumes(settings) == [(0,)] and archived(settings) == []
    assert api.get(f"{UPLOAD}/current").status_code == 200  # draft still there


def test_invalid_core_field_is_422_with_details(
    api: TestClient, settings: Settings, fake_parser: FakeParserClient
) -> None:
    set_identity(fake_parser, phone="12345")
    upload(api)
    resp = api.post(CONFIRM, json={"confirmed": True})

    assert resp.status_code == 422
    assert resp.json()["code"] == "validation_failed"
    assert resp.json()["details"] == [{"field": "phone", "reason": "invalid_format"}]
    assert "12345" not in resp.text
    assert resumes(settings) == [(0,)] and archived(settings) == []


def test_no_cookie_is_404_draft_not_found(api: TestClient, settings: Settings) -> None:
    upload(api)
    api.cookies.clear()
    resp = api.post(CONFIRM, json={"confirmed": True})
    assert resp.status_code == 404 and resp.json()["code"] == "draft_not_found"
    assert resumes(settings) == [(0,)]


def test_retry_after_success_is_404(api: TestClient) -> None:
    """D-01: the token is void after a successful save, even if the response was lost."""
    upload(api)
    token = api.cookies.get("draft_token")
    assert api.post(CONFIRM, json={"confirmed": True}).status_code == 201
    api.cookies.set("draft_token", token)
    assert api.post(CONFIRM, json={"confirmed": True}).status_code == 404


def test_save_failure_is_500_and_leaves_nothing(
    api: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    upload(api)

    def broken_copy(*args: object) -> None:
        raise OSError("disk full")

    monkeypatch.setattr("app.repositories.archive_file_store.shutil.copyfileobj", broken_copy)
    resp = api.post(CONFIRM, json={"confirmed": True})

    assert resp.status_code == 500 and resp.json()["code"] == "save_failed"
    assert resumes(settings) == [(0,)] and archived(settings) == []
    assert not any("draft_token=;" in h for h in resp.headers.get_list("set-cookie"))
    assert api.get(f"{UPLOAD}/current").status_code == 200  # draft kept, retry possible


def test_logs_do_not_contain_personal_data(
    api: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    upload(api)
    token = api.cookies.get("draft_token")
    api.post(CONFIRM, json={"confirmed": True})
    text = "\n".join(r.getMessage() for r in caplog.records)
    for secret in ("ZHANG SAN", "13800138000", "ZS@EXAMPLE.COM", "cv.pdf", token):
        assert secret not in text

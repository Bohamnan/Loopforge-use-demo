"""Fixtures for API-layer tests: an app with probe routes and a client."""

import logging

import pytest
from fastapi import APIRouter, Depends, FastAPI, Response, UploadFile
from fastapi.testclient import TestClient

from app.api import cookies
from app.api.deps import get_browser_id, get_settings
from app.core.config import Settings
from app.core.errors import (
    FieldIssue,
    IssueReason,
    SessionNotFoundError,
    ValidationFailedError,
)
from app.main import create_app
from app.schemas.chat import SendMessageRequest
from app.schemas.resume import CreateResumeRequest, UpdateResumeRequest
from app.schemas.session import SessionFieldsUpdateRequest

BROWSER_ID = "A" * 43  # same shape as secrets.token_urlsafe(32)


def build_probe_router() -> APIRouter:
    router = APIRouter()

    @router.get("/t/app-error")
    def app_error() -> None:
        raise SessionNotFoundError()

    @router.get("/t/validation-error")
    def validation_error() -> None:
        raise ValidationFailedError([FieldIssue("phone", IssueReason.INVALID_FORMAT)])

    @router.get("/t/crash")
    def crash() -> None:
        raise RuntimeError("ZZ-secret-user-data")

    # Probes registered under the real route templates (error mapping is per template).
    @router.post("/api/v1/sessions")
    def upload(file: UploadFile) -> dict:
        return {"ok": True}

    @router.patch("/api/v1/sessions/{session_id}/fields")
    def patch_fields(session_id: str, body: SessionFieldsUpdateRequest) -> dict:
        return {"ok": True}

    @router.post("/api/v1/sessions/{session_id}/messages")
    def send(session_id: str, body: SendMessageRequest) -> dict:
        return {"ok": True}

    @router.post("/api/v1/sessions/{session_id}/resume")
    def confirm(session_id: str, body: CreateResumeRequest) -> dict:
        return {"ok": True}

    @router.put("/api/v1/sessions/{session_id}/resume")
    def confirm_update(session_id: str, body: UpdateResumeRequest) -> dict:
        return {"ok": True}

    @router.get("/t/browser-id")
    def browser_id(value: str | None = Depends(get_browser_id)) -> dict:
        return {"browser_id": value}

    @router.get("/t/issue-cookie")
    def issue_cookie(response: Response, settings: Settings = Depends(get_settings)) -> dict:
        cookies.issue(response, BROWSER_ID, settings)
        return {}

    @router.get("/t/renew-cookie")
    def renew_cookie(response: Response, settings: Settings = Depends(get_settings)) -> dict:
        cookies.renew(response, BROWSER_ID, settings)
        return {}

    return router


@pytest.fixture
def settings(data_dir, file_dir) -> Settings:  # noqa: ANN001
    return Settings(_env_file=None, data_dir=data_dir, file_dir=file_dir)


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    application = create_app(settings)
    application.include_router(build_probe_router())
    return application


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _app_logs(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG, logger="app")


# ---- session API environment: real SQLite files in a temp dir, fake model and clock --------

from app.core.db import connect, init_drafts_db, init_resumes_db  # noqa: E402
from tests.fakes import FakeChatClient, FakeClock, FakeParserClient, make_raw_result  # noqa: E402


@pytest.fixture
def fake_parser() -> FakeParserClient:
    return FakeParserClient(result=make_raw_result())


@pytest.fixture
def fake_clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def fake_chat() -> FakeChatClient:
    return FakeChatClient()


@pytest.fixture
def session_app(
    settings: Settings,
    fake_parser: FakeParserClient,
    fake_clock: FakeClock,
    fake_chat: FakeChatClient,
) -> FastAPI:
    init_drafts_db(settings.data_dir / "drafts.db")
    init_resumes_db(settings.data_dir / "resumes.db")
    return create_app(settings, parser_client=fake_parser, chat_client=fake_chat, clock=fake_clock)


@pytest.fixture
def session_client(session_app: FastAPI) -> TestClient:
    return TestClient(session_app, raise_server_exceptions=False)


def query(settings: Settings, sql: str, db: str = "drafts.db") -> list:
    conn = connect(settings.data_dir / db)
    try:
        return [tuple(r) for r in conn.execute(sql).fetchall()]
    finally:
        conn.close()


def session_files(settings: Settings) -> set[str]:
    return {p.name for p in (settings.data_dir / "drafts").iterdir()}

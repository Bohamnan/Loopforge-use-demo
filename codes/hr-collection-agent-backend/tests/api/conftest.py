"""Fixtures for API-layer tests: an app with probe routes and a client."""

import logging

import pytest
from fastapi import APIRouter, Depends, FastAPI, Response
from fastapi.testclient import TestClient

from app.api import cookies
from app.api.deps import get_draft_token, get_settings
from app.core.config import Settings
from app.core.errors import (
    DraftNotFoundError,
    FieldIssue,
    IssueReason,
    ValidationFailedError,
)
from app.main import create_app
from app.schemas.draft import DraftUpdateRequest
from app.schemas.resume import CreateResumeRequest


def build_probe_router() -> APIRouter:
    router = APIRouter()

    @router.get("/t/app-error")
    def app_error() -> None:
        raise DraftNotFoundError()

    @router.get("/t/validation-error")
    def validation_error() -> None:
        raise ValidationFailedError([FieldIssue("phone", IssueReason.INVALID_FORMAT)])

    @router.get("/t/crash")
    def crash() -> None:
        raise RuntimeError("ZZ-secret-user-data")

    @router.patch("/t/model")
    def model(body: DraftUpdateRequest) -> dict:
        return {"ok": True}

    @router.post("/api/v1/resumes")
    def confirm(body: CreateResumeRequest) -> dict:
        return {"ok": True}

    @router.get("/t/token")
    def token(tok: str | None = Depends(get_draft_token)) -> dict:
        return {"token": tok}

    @router.get("/t/set-cookie")
    def set_cookie(response: Response, settings: Settings = Depends(get_settings)) -> dict:
        cookies.set_token(response, "tok123", settings)
        return {}

    @router.get("/t/renew-cookie")
    def renew_cookie(response: Response, settings: Settings = Depends(get_settings)) -> dict:
        cookies.renew(response, "tok123", settings)
        return {}

    @router.get("/t/clear-cookie")
    def clear_cookie(response: Response, settings: Settings = Depends(get_settings)) -> dict:
        cookies.clear(response, settings)
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


# ---- draft API environment: real SQLite files in a temp dir, fake model and clock -----------

from app.core.db import connect, init_drafts_db  # noqa: E402
from tests.fakes import FakeClock, FakeParserClient, make_raw_result  # noqa: E402


@pytest.fixture
def fake_parser() -> FakeParserClient:
    return FakeParserClient(result=make_raw_result())


@pytest.fixture
def fake_clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def draft_app(settings: Settings, fake_parser: FakeParserClient, fake_clock: FakeClock) -> FastAPI:
    init_drafts_db(settings.data_dir / "drafts.db")
    return create_app(settings, parser_client=fake_parser, clock=fake_clock)


@pytest.fixture
def draft_client(draft_app: FastAPI) -> TestClient:
    return TestClient(draft_app, raise_server_exceptions=False)


def draft_rows(settings: Settings) -> list:
    return connect(settings.data_dir / "drafts.db").execute("SELECT * FROM drafts").fetchall()


def draft_files(settings: Settings) -> set[str]:
    return {p.name for p in (settings.data_dir / "drafts").iterdir()}

"""Fixtures for the developer self-test (HR_PR-1, backend_docs 06_test/dev_self_test_resume.md).

Everything here is synthetic (B-06): the model is a fake or an ``httpx.MockTransport``, the
network is banned by the root autouse fixture, and every test gets its own temp directories.
Case ids in test names (``test_tc_res_<unit>_<type>_<nn>``) map one-to-one to the document.
"""

import logging
import sqlite3
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from tests.fakes import FakeClock, FakeParserClient, make_raw_result
from tests.helpers import make_pdf_bytes

UPLOAD = "/api/v1/resume-drafts"
CURRENT = f"{UPLOAD}/current"
RESUMES = "/api/v1/resumes"
COOKIE_LIVE = "; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800"
COOKIE_CLEARED = "draft_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
PDF = make_pdf_bytes(300)


def node(value: object, status: str = "recognized") -> dict:
    return {"value": value, "status": status}


def set_model(parser: FakeParserClient, **fields: object) -> None:
    """Make the fake model return the default fictional person with some fields replaced."""
    parser.result = make_raw_result(
        **{k: v if isinstance(v, dict) else node(v) for k, v in fields.items()}
    )


@dataclass
class Env:
    """One application instance on temp directories, with SQL and file-system helpers."""

    settings: Settings
    app: FastAPI
    client: TestClient
    parser: FakeParserClient
    clock: FakeClock

    def upload(
        self,
        content: bytes = PDF,
        name: str = "cv.pdf",
        mime: str = "application/pdf",
        client: TestClient | None = None,
    ):  # noqa: ANN201
        return (client or self.client).post(UPLOAD, files={"file": (name, content, mime)})

    def other_browser(self) -> TestClient:
        """A second client with its own cookie jar (another browser)."""
        return TestClient(self.app, raise_server_exceptions=False)

    def token(self, client: TestClient | None = None) -> str | None:
        return (client or self.client).cookies.get("draft_token")

    def drafts(self, sql: str = "SELECT count(*) FROM drafts", params: tuple = ()) -> list:
        return self._query("drafts.db", sql, params)

    def resumes(self, sql: str = "SELECT count(*) FROM resumes", params: tuple = ()) -> list:
        return self._query("resumes.db", sql, params)

    def _query(self, db: str, sql: str, params: tuple) -> list:
        conn = sqlite3.connect(self.settings.data_dir / db)
        try:
            return conn.execute(sql, params).fetchall()
        finally:
            conn.close()

    def archive(self) -> list[str]:
        return sorted(p.name for p in self.settings.file_dir.iterdir())

    def draft_dir(self) -> list[str]:
        return sorted(p.name for p in (self.settings.data_dir / "drafts").iterdir())

    def confirm(self, client: TestClient | None = None):  # noqa: ANN201
        return (client or self.client).post(RESUMES, json={"confirmed": True})

    def patch(self, fields: dict, client: TestClient | None = None):  # noqa: ANN201
        return (client or self.client).patch(CURRENT, json={"fields": fields})


def build_env(root: Path, parser: FakeParserClient | None = None) -> Iterator[Env]:
    settings = Settings(_env_file=None, data_dir=root / "data", file_dir=root / "file")
    parser = parser or FakeParserClient(result=make_raw_result())
    clock = FakeClock()
    app = create_app(settings, parser_client=parser, clock=clock)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield Env(settings, app, client, parser, clock)


@pytest.fixture
def env(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> Iterator[Env]:
    caplog.set_level(logging.DEBUG)  # every logger: redaction checks must see everything
    yield from build_env(tmp_path)

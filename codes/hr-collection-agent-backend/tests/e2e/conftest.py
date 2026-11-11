"""End-to-end fixture: the whole application, started through its lifespan, scripted model."""

import logging
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.clients.deepseek_client import DeepSeekClient
from app.core.config import Settings
from app.main import create_app
from tests.e2e.support import SYNTHETIC_API_KEY, ModelScript, World


@pytest.fixture
def world(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> Iterator[World]:
    caplog.set_level(logging.DEBUG)  # every logger, so a leak anywhere is visible
    settings = Settings(
        _env_file=None,
        data_dir=tmp_path / "data",
        file_dir=tmp_path / "file",
        deepseek_api_key=SecretStr(SYNTHETIC_API_KEY),
    )
    model = ModelScript()
    deepseek = DeepSeekClient(settings, transport=httpx.MockTransport(model.handle))
    app = create_app(settings, parser_client=deepseek, chat_client=deepseek)
    try:
        with TestClient(app, raise_server_exceptions=False) as client:  # runs lifespan
            yield World(app, client, settings, model)
    finally:
        deepseek.close()

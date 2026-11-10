"""Shared test fixtures: network ban, temp directories (B-06)."""

import socket
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _forbid_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fail any test that tries to open an outbound socket connection."""

    def _blocked(*args: object, **kwargs: object) -> None:
        raise RuntimeError("network access is forbidden in tests")

    monkeypatch.setattr(socket.socket, "connect", _blocked)
    monkeypatch.setattr(socket.socket, "connect_ex", _blocked)
    monkeypatch.setattr(socket, "create_connection", _blocked)


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    """Per-test DATA_DIR."""
    path = tmp_path / "data"
    path.mkdir()
    return path


@pytest.fixture
def file_dir(tmp_path: Path) -> Path:
    """Per-test FILE_DIR."""
    path = tmp_path / "file"
    path.mkdir()
    return path

import socket
import tomllib
from pathlib import Path

import pytest

import app
from tests.helpers import make_jpeg_bytes, make_pdf_bytes, make_png_bytes

ROOT = Path(__file__).resolve().parents[1]


def test_app_package_importable() -> None:
    assert app.__name__ == "app"


def test_network_is_blocked() -> None:
    sock = socket.socket()
    with pytest.raises(RuntimeError, match="network access is forbidden"):
        sock.connect(("127.0.0.1", 9))
    sock.close()
    with pytest.raises(RuntimeError):
        socket.create_connection(("127.0.0.1", 9))


def test_temp_dirs_are_isolated(data_dir: Path, file_dir: Path) -> None:
    assert data_dir.is_dir() and file_dir.is_dir()
    assert data_dir != file_dir


def test_synthetic_magic_bytes() -> None:
    assert make_pdf_bytes().startswith(b"%PDF-")
    assert make_jpeg_bytes().startswith(b"\xff\xd8\xff")
    assert make_png_bytes().startswith(b"\x89PNG\r\n\x1a\n")


def test_dependencies_are_pinned_exactly() -> None:
    data = tomllib.loads((ROOT / "pyproject.toml").read_text())
    deps = list(data["project"]["dependencies"]) + list(data["dependency-groups"]["dev"])
    assert deps and all("==" in d for d in deps)
    assert data["project"]["requires-python"] == ">=3.11,<3.12"


def test_gitignore_has_required_entries() -> None:
    lines = (ROOT / ".gitignore").read_text().splitlines()
    for entry in ("data/", "file/", ".env", ".venv/", "__pycache__/", ".pytest_cache/"):
        assert entry in lines


def test_env_example_has_only_placeholders() -> None:
    text = (ROOT / ".env.example").read_text()
    keys = {
        line.split("=")[0] for line in text.splitlines() if "=" in line and not line.startswith("#")
    }
    assert keys == {
        "DEEPSEEK_API_KEY",
        "DEEPSEEK_BASE_URL",
        "DEEPSEEK_MODEL",
        "DATA_DIR",
        "FILE_DIR",
        "MODEL_TIMEOUT_SECONDS",
        "DRAFT_TTL_DAYS",
        "CLEANUP_INTERVAL_SECONDS",
        "COOKIE_SECURE",
    }
    for line in text.splitlines():
        if line.startswith("DEEPSEEK_API_KEY") or line.startswith("DEEPSEEK_BASE_URL"):
            assert "<" in line

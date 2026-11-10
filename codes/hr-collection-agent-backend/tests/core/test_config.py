from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings

ENV_KEYS = [
    "DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL", "DATA_DIR", "FILE_DIR",
    "MODEL_TIMEOUT_SECONDS", "DRAFT_TTL_DAYS", "CLEANUP_INTERVAL_SECONDS", "COOKIE_SECURE",
]  # fmt: skip


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


def test_defaults() -> None:
    s = Settings(_env_file=None)
    assert s.deepseek_model == "deepseek-flash"
    assert s.model_timeout_seconds == 60
    assert s.draft_ttl_days == 7
    assert s.cleanup_interval_seconds == 3600
    assert s.cookie_secure is False
    assert s.data_dir == Path("data").resolve()
    assert s.file_dir == Path("file").resolve()


def test_api_key_may_be_missing() -> None:
    s = Settings(_env_file=None)
    assert s.deepseek_api_key is None


def test_env_overrides(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "d"))
    monkeypatch.setenv("FILE_DIR", str(tmp_path / "f"))
    monkeypatch.setenv("MODEL_TIMEOUT_SECONDS", "30")
    monkeypatch.setenv("DRAFT_TTL_DAYS", "3")
    monkeypatch.setenv("CLEANUP_INTERVAL_SECONDS", "10")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("DEEPSEEK_MODEL", "other-model")
    monkeypatch.setenv("DEEPSEEK_BASE_URL", "https://example.invalid")
    s = Settings(_env_file=None)
    assert s.data_dir == tmp_path / "d"
    assert s.file_dir == tmp_path / "f"
    assert s.model_timeout_seconds == 30
    assert s.draft_ttl_days == 3
    assert s.cleanup_interval_seconds == 10
    assert s.cookie_secure is True
    assert s.deepseek_model == "other-model"
    assert s.deepseek_base_url == "https://example.invalid"


def test_secret_not_leaked_in_repr(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "synthetic-secret-value")
    s = Settings(_env_file=None)
    assert s.deepseek_api_key is not None
    assert s.deepseek_api_key.get_secret_value() == "synthetic-secret-value"
    for text in (repr(s), str(s), s.model_dump_json()):
        assert "synthetic-secret-value" not in text


@pytest.mark.parametrize(
    "key", ["MODEL_TIMEOUT_SECONDS", "DRAFT_TTL_DAYS", "CLEANUP_INTERVAL_SECONDS"]
)
@pytest.mark.parametrize("value", ["0", "-1"])
def test_non_positive_numbers_rejected(
    monkeypatch: pytest.MonkeyPatch, key: str, value: str
) -> None:
    monkeypatch.setenv(key, value)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)

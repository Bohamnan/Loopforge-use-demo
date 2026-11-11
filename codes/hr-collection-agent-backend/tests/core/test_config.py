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
    assert s.cookie_secure is False
    assert s.data_dir == Path("data").resolve()
    assert s.file_dir == Path("file").resolve()


def test_legacy_ttl_env_vars_are_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DRAFT_TTL_DAYS", "3")
    monkeypatch.setenv("CLEANUP_INTERVAL_SECONDS", "10")
    s = Settings(_env_file=None)
    assert not hasattr(s, "draft_ttl_days")
    assert not hasattr(s, "cleanup_interval_seconds")


def test_env_example_has_no_legacy_vars() -> None:
    text = (Path(__file__).parents[2] / ".env.example").read_text()
    assert "DRAFT_TTL_DAYS" not in text
    assert "CLEANUP_INTERVAL_SECONDS" not in text


def test_api_key_may_be_missing() -> None:
    s = Settings(_env_file=None)
    assert s.deepseek_api_key is None


def test_env_overrides(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "d"))
    monkeypatch.setenv("FILE_DIR", str(tmp_path / "f"))
    monkeypatch.setenv("MODEL_TIMEOUT_SECONDS", "30")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    s = Settings(_env_file=None)
    assert s.data_dir == tmp_path / "d"
    assert s.file_dir == tmp_path / "f"
    assert s.model_timeout_seconds == 30
    assert s.cookie_secure is True


def test_secret_not_leaked_in_repr(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "synthetic-secret-value")
    s = Settings(_env_file=None)
    assert s.deepseek_api_key is not None
    assert s.deepseek_api_key.get_secret_value() == "synthetic-secret-value"
    for text in (repr(s), str(s), s.model_dump_json()):
        assert "synthetic-secret-value" not in text


@pytest.mark.parametrize("value", ["0", "-1"])
def test_non_positive_numbers_rejected(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("MODEL_TIMEOUT_SECONDS", value)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


# ---- BLOCK-1: the model is locked to deepseek-flash (B-02, ADR-001) ------------------------


def test_default_model_and_url_are_the_approved_ones() -> None:
    s = Settings(_env_file=None)
    assert s.deepseek_model == "deepseek-flash"
    assert s.deepseek_base_url == "https://api.deepseek.com"


def test_approved_model_accepted_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEPSEEK_MODEL", "deepseek-flash")
    assert Settings(_env_file=None).deepseek_model == "deepseek-flash"


@pytest.mark.parametrize(
    "model",
    [
        "deepseek-v4-pro", "other-model", "", " ", "DEEPSEEK-FLASH", "Deepseek-Flash",
        "deepseek-flash ", " deepseek-flash", "deepseek-flash-2", "deepseek-flas",
        "deepseek-chat", "deepseek-flash\n",
    ],
)  # fmt: skip
def test_other_models_are_rejected_without_echoing_the_value(
    monkeypatch: pytest.MonkeyPatch, model: str
) -> None:
    monkeypatch.setenv("DEEPSEEK_MODEL", model)
    with pytest.raises(ValidationError) as ei:
        Settings(_env_file=None)
    if model.strip():
        assert model.strip() not in str(ei.value).replace("deepseek-flash", "")


def test_model_rejected_via_constructor_too() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, deepseek_model="deepseek-v4-pro")


# ---- QUESTION-1: outbound address locked to https://api.deepseek.com ------------------------


@pytest.mark.parametrize(
    "url",
    [
        "https://api.deepseek.com",
        "https://api.deepseek.com/",
        "https://api.deepseek.com/v1",
        "https://API.DeepSeek.com/v1/",
    ],
)
def test_approved_urls_accepted(monkeypatch: pytest.MonkeyPatch, url: str) -> None:
    monkeypatch.setenv("DEEPSEEK_BASE_URL", url)
    assert Settings(_env_file=None).deepseek_base_url == url


@pytest.mark.parametrize(
    "url",
    [
        "http://api.deepseek.com",
        "ftp://api.deepseek.com",
        "//api.deepseek.com",
        "api.deepseek.com",
        "https://evil.example.com",
        "https://example.invalid",
        "https://api.deepseek.com.evil.com",
        "https://evil.com/api.deepseek.com",
        "https://xapi.deepseek.com",
        "https://deepseek.com",
        "https://sub.api.deepseek.com",
        "https://api.deepseek.com.",
        "https://user@api.deepseek.com",
        "https://user:pw@api.deepseek.com",
        "https://api.deepseek.com@evil.com",
        "https://api.deepseek.com\\@evil.com",
        "https://evil.com#@api.deepseek.com",
        "https://evil.com?@api.deepseek.com",
        "https://api.deepseek.com:8443",
        "https://api.deepseek.com:443",
        "https://127.0.0.1",
        "https://[::1]",
        "https://2130706433",
        "https://api.deepseek.com/v1?x=1",
        "https://api.deepseek.com/v1#frag",
        "https://api.deepseek.com/../evil",
        "https://api.deepseek.com/a b",
        " https://api.deepseek.com",
        "https://api.deepseek.com\n",
        "",
    ],
)  # fmt: skip
def test_other_addresses_rejected_without_echoing_the_value(
    monkeypatch: pytest.MonkeyPatch, url: str
) -> None:
    monkeypatch.setenv("DEEPSEEK_BASE_URL", url)
    with pytest.raises(ValidationError) as ei:
        Settings(_env_file=None)
    text = str(ei.value)
    for fragment in ("evil", "example.invalid", "127.0.0.1", "user", "8443", "frag"):
        if fragment in url:
            assert fragment not in text

"""Application settings loaded from environment variables (B-01)."""

import re
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

APPROVED_MODEL = "deepseek-flash"  # the only model resumes may be sent to (ADR-001, B-02)
APPROVED_BASE_URL = "https://api.deepseek.com"
# https only, exactly this host, no port/userinfo/query/fragment; optional plain path prefix.
_BASE_URL_RE = re.compile(r"https://(?i:api\.deepseek\.com)(?:/[A-Za-z0-9._~-]+)*/?")


def is_approved_base_url(url: str) -> bool:
    """True only for https://api.deepseek.com with an optional simple path prefix."""
    if not _BASE_URL_RE.fullmatch(url):
        return False
    return not {".", ".."} & set(url.split("/")[3:])


class Settings(BaseSettings):
    """Runtime configuration. Secrets come only from the environment."""

    # hide_input_in_errors: validation errors must never echo configuration values.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    # Model service. The key may be absent: startup must not fail (see design 7.2).
    deepseek_api_key: SecretStr | None = None
    deepseek_base_url: str = APPROVED_BASE_URL
    deepseek_model: Literal["deepseek-flash"] = APPROVED_MODEL

    # Runtime directories (O-06). Relative values are resolved against the cwd.
    data_dir: Path = Path("data")
    file_dir: Path = Path("file")

    model_timeout_seconds: int = Field(default=60, gt=0)
    cookie_secure: bool = False

    @field_validator("data_dir", "file_dir")
    @classmethod
    def _resolve_dir(cls, value: Path) -> Path:
        return value.expanduser().resolve()

    @field_validator("deepseek_base_url")
    @classmethod
    def _lock_base_url(cls, value: str) -> str:
        if not is_approved_base_url(value):
            raise ValueError(
                "DEEPSEEK_BASE_URL must be https://api.deepseek.com (path prefix allowed)"
            )
        return value

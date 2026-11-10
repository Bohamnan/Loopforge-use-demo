"""Application settings loaded from environment variables (B-01)."""

from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Secrets come only from the environment."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Model service. The key may be absent: startup must not fail (see design 7.2).
    deepseek_api_key: SecretStr | None = None
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-flash"

    # Runtime directories (O-06). Relative values are resolved against the cwd.
    data_dir: Path = Path("data")
    file_dir: Path = Path("file")

    model_timeout_seconds: int = Field(default=60, gt=0)
    draft_ttl_days: int = Field(default=7, gt=0)
    cleanup_interval_seconds: int = Field(default=3600, gt=0)
    cookie_secure: bool = False

    @field_validator("data_dir", "file_dir")
    @classmethod
    def _resolve_dir(cls, value: Path) -> Path:
        return value.expanduser().resolve()

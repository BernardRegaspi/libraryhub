from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[4]
_ENV_FILES = (_REPO_ROOT / ".env", _REPO_ROOT / "apps" / "api" / ".env")


class Settings(BaseSettings):
    """Application configuration from environment variables."""

    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "libraryhub"
    environment: str = Field(default="development", validation_alias="APP_ENV")
    log_level: str = "INFO"
    api_v1_prefix: str = "/api/v1"

    database_url: str = Field(
        default="postgresql+psycopg://libraryhub:libraryhub_dev@localhost:5432/libraryhub",
        validation_alias="DATABASE_URL",
    )

    redis_url: str | None = Field(default=None, validation_alias="REDIS_URL")

    koha_base_url: str | None = Field(default=None, validation_alias="KOHA_BASE_URL")
    koha_api_username: str | None = Field(default=None, validation_alias="KOHA_API_USERNAME")
    koha_api_password: str | None = Field(default=None, validation_alias="KOHA_API_PASSWORD")


@lru_cache
def get_settings() -> Settings:
    return Settings()
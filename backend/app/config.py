from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "CrisisMap API"
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = False
    log_level: str = "INFO"
    api_v1_prefix: str = "/api/v1"

    host: str = "0.0.0.0"
    port: int = 8000

    # NoDecode: pydantic-settings otherwise JSON-parses list env vars before our validator runs
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    supabase_url: str
    supabase_service_role_key: SecretStr
    supabase_anon_key: SecretStr | None = None

    supabase_nearby_crisis_rpc: str = "get_nearby_crisis_records"

    @field_validator("supabase_url", mode="before")
    @classmethod
    def normalize_supabase_url(cls, value: str) -> str:
        """Accept project URL only; strip accidental /rest/v1 suffix from .env."""
        url = value.strip().rstrip("/")
        rest_suffix = "/rest/v1"
        while url.endswith(rest_suffix):
            url = url[: -len(rest_suffix)].rstrip("/")
        return url

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def supabase_rest_url(self) -> str:
        return f"{self.supabase_url}/rest/v1"


@lru_cache
def get_settings() -> Settings:
    return Settings()

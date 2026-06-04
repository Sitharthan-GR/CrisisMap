import os

import pytest

from app.config import Settings


def test_supabase_url_strips_rest_v1_suffix() -> None:
    settings = Settings(
        supabase_url="https://example.supabase.co/rest/v1/",
        supabase_service_role_key="test-key",
    )
    assert settings.supabase_url == "https://example.supabase.co"
    assert settings.supabase_rest_url == "https://example.supabase.co/rest/v1"


@pytest.mark.parametrize(
    "raw,expected_rpc_host",
    [
        ("https://example.supabase.co", "https://example.supabase.co/rest/v1"),
        ("https://example.supabase.co/rest/v1", "https://example.supabase.co/rest/v1"),
    ],
)
def test_supabase_rest_url(raw: str, expected_rpc_host: str) -> None:
    settings = Settings(supabase_url=raw, supabase_service_role_key="test-key")
    assert settings.supabase_rest_url == expected_rpc_host


def test_cors_origins_comma_separated() -> None:
    os.environ["CORS_ORIGINS"] = "http://a.com,http://b.com"
    try:
        settings = Settings(
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="test-key",
        )
        assert settings.cors_origins == ["http://a.com", "http://b.com"]
    finally:
        os.environ.pop("CORS_ORIGINS", None)

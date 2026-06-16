import os
from collections.abc import AsyncIterator, Generator
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

# Set env before app imports Settings
os.environ.setdefault("SUPABASE_URL", "https://test-project.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("DEBUG", "true")

from app.config import get_settings
from app.main import app
from app.services.supabase import SupabaseClient


@pytest.fixture(autouse=True)
def clear_settings_cache() -> Generator[None, None, None]:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def mock_supabase() -> AsyncMock:
    client = AsyncMock(spec=SupabaseClient)
    client.rpc.return_value = []
    client.select.return_value = ([], 0)
    client.select_one.return_value = None
    client.insert.return_value = {}
    client.health_check.return_value = True
    return client


@pytest.fixture
async def client(mock_supabase: AsyncMock) -> AsyncIterator[AsyncClient]:
    async with app.router.lifespan_context(app):
        app.state.supabase = mock_supabase
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from app.config import get_settings
from app.dependencies import SettingsDep, SupabaseDep

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    service: str
    environment: str


class ReadinessResponse(BaseModel):
    status: str
    checks: dict[str, str]


@router.get("/health", response_model=HealthResponse)
async def liveness() -> HealthResponse:
    """Liveness probe — process is running."""
    settings = get_settings()
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        environment=settings.environment,
    )


@router.get("/ready", response_model=ReadinessResponse)
async def readiness(supabase: SupabaseDep, response: Response) -> ReadinessResponse:
    """Readiness probe — dependencies (Supabase) are reachable."""
    supabase_ok = await supabase.health_check()

    checks = {
        "supabase": "ok" if supabase_ok else "unavailable",
    }
    all_ok = all(v == "ok" for v in checks.values())

    if not all_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return ReadinessResponse(
        status="ok" if all_ok else "degraded",
        checks=checks,
    )


@router.get("/health/detail", include_in_schema=False)
async def health_detail(settings: SettingsDep) -> dict:
    return {
        "app": settings.app_name,
        "environment": settings.environment,
        "debug": settings.debug,
    }

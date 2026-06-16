from datetime import datetime

import structlog
from fastapi import APIRouter, Query
from fastapi.responses import Response

from app.dependencies import SupabaseDep
from app.services import export as export_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/crises", tags=["export"])


@router.get("/{crisis_id}/export/csv")
async def export_crisis_csv(
    crisis_id: str,
    supabase: SupabaseDep,
    status: str | None = Query(default="validated"),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
) -> Response:
    include_all = status == "all"
    content, filename = await export_service.export_csv(
        supabase,
        crisis_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        include_all_statuses=include_all,
    )
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{crisis_id}/export/geojson")
async def export_crisis_geojson(
    crisis_id: str,
    supabase: SupabaseDep,
    status: str | None = Query(default="validated"),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
) -> Response:
    include_all = status == "all"
    content, filename = await export_service.export_geojson(
        supabase,
        crisis_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        include_all_statuses=include_all,
    )
    return Response(
        content=content,
        media_type="application/geo+json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

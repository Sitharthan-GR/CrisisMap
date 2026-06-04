from typing import Any

import httpx
import structlog

from app.config import Settings
from app.core.exceptions import SupabaseError

logger = structlog.get_logger(__name__)


class SupabaseClient:
    """Async HTTP client for Supabase PostgREST and RPC calls."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._base_url = settings.supabase_rest_url
        self._headers = {
            "apikey": settings.supabase_service_role_key.get_secret_value(),
            "Authorization": (
                f"Bearer {settings.supabase_service_role_key.get_secret_value()}"
            ),
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    async def rpc(self, function_name: str, params: dict[str, Any]) -> Any:
        """
        Call a Supabase Postgres function via PostgREST RPC.

        Mirrors: supabase.rpc('function_name', { ... })
        """
        url = f"{self._base_url}/rpc/{function_name}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(url, headers=self._headers, json=params)
            except httpx.RequestError as exc:
                logger.error("supabase_request_failed", function=function_name, error=str(exc))
                raise SupabaseError(
                    "Unable to reach Supabase. Check network and SUPABASE_URL.",
                    code="supabase_unreachable",
                ) from exc

        if response.status_code >= 400:
            detail = _parse_error_body(response)
            logger.warning(
                "supabase_rpc_error",
                function=function_name,
                status_code=response.status_code,
                detail=detail,
            )
            raise SupabaseError(
                detail.get("message", "Supabase RPC call failed."),
                status_code=_map_supabase_status(response.status_code),
                code="supabase_rpc_failed",
                details=detail,
            )

        if not response.content:
            return None

        return response.json()

    async def select(
        self,
        table: str,
        *,
        columns: str = "*",
        filters: dict[str, str] | None = None,
        limit: int | None = None,
        order: str | None = None,
    ) -> list[dict[str, Any]]:
        """Fetch rows from a Supabase table (for read/testing endpoints)."""
        url = f"{self._base_url}/{table}"
        params: dict[str, str] = {"select": columns}

        if filters:
            params.update(filters)
        if limit is not None:
            params["limit"] = str(limit)
        if order:
            params["order"] = order

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(url, headers=self._headers, params=params)
            except httpx.RequestError as exc:
                logger.error("supabase_request_failed", table=table, error=str(exc))
                raise SupabaseError(
                    "Unable to reach Supabase.",
                    code="supabase_unreachable",
                ) from exc

        if response.status_code >= 400:
            detail = _parse_error_body(response)
            raise SupabaseError(
                detail.get("message", "Supabase query failed."),
                status_code=_map_supabase_status(response.status_code),
                code="supabase_query_failed",
                details=detail,
            )

        return response.json()

    async def health_check(self) -> bool:
        """Verify Supabase REST API is reachable."""
        url = f"{self._base_url}/"
        headers = {
            "apikey": self._settings.supabase_service_role_key.get_secret_value(),
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.head(url, headers=headers)
                return response.status_code < 500
            except httpx.RequestError:
                return False


def _parse_error_body(response: httpx.Response) -> dict[str, Any]:
    try:
        body = response.json()
    except ValueError:
        return {"message": response.text or "Unknown Supabase error"}

    if isinstance(body, dict):
        message = body.get("message") or body.get("error") or body.get("hint")
        return {"message": message, "raw": body}
    return {"message": str(body)}


def _map_supabase_status(status_code: int) -> int:
    if status_code == 401:
        return 502
    if status_code == 404:
        return 404
    if status_code == 409:
        return 409
    if 400 <= status_code < 500:
        return 400
    return 502

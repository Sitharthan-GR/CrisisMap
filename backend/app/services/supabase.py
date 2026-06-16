from typing import Any

import httpx
import structlog

from app.config import Settings
from app.core.exceptions import StorageError, SupabaseError

logger = structlog.get_logger(__name__)


class SupabaseClient:
    """Async HTTP client for Supabase PostgREST, RPC, and Storage."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._rest_url = settings.supabase_rest_url
        self._storage_url = f"{settings.supabase_url}/storage/v1"
        self._service_key = settings.supabase_service_role_key.get_secret_value()
        self._auth_headers = {
            "apikey": self._service_key,
            "Authorization": f"Bearer {self._service_key}",
        }

    def _rest_headers(self, *, prefer: str | None = None) -> dict[str, str]:
        headers = {
            **self._auth_headers,
            "Content-Type": "application/json",
            "Prefer": prefer or "return=representation",
        }
        return headers

    async def _request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: list[tuple[str, str]] | None = None,
        json: Any = None,
        error_context: str = "Supabase request",
    ) -> httpx.Response:
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                return await client.request(
                    method,
                    url,
                    headers=headers or self._rest_headers(),
                    params=params,
                    json=json,
                )
            except httpx.RequestError as exc:
                logger.error("supabase_request_failed", context=error_context, error=str(exc))
                raise SupabaseError(
                    "Unable to reach Supabase. Check network and SUPABASE_URL.",
                    code="SUPABASE_UNREACHABLE",
                ) from exc

    def _handle_error(self, response: httpx.Response, context: str) -> None:
        detail = _parse_error_body(response)
        logger.warning(
            "supabase_error",
            context=context,
            status_code=response.status_code,
            detail=detail,
        )
        raise SupabaseError(
            detail.get("message", f"{context} failed."),
            status_code=_map_supabase_status(response.status_code),
            code="SUPABASE_ERROR",
            details=detail,
        )

    async def rpc(self, function_name: str, params: dict[str, Any]) -> Any:
        url = f"{self._rest_url}/rpc/{function_name}"
        response = await self._request(
            "POST",
            url,
            json=params,
            error_context=f"RPC {function_name}",
        )
        if response.status_code >= 400:
            self._handle_error(response, f"RPC {function_name}")
        if not response.content:
            return None
        return response.json()

    async def select(
        self,
        table: str,
        *,
        columns: str = "*",
        filters: list[tuple[str, str]] | None = None,
        limit: int | None = None,
        offset: int | None = None,
        order: str | None = None,
        count: bool = False,
    ) -> tuple[list[dict[str, Any]], int | None]:
        params: list[tuple[str, str]] = [("select", columns)]
        if filters:
            params.extend(filters)
        if limit is not None:
            params.append(("limit", str(limit)))
        if offset is not None:
            params.append(("offset", str(offset)))
        if order:
            params.append(("order", order))

        headers = self._rest_headers(prefer="count=exact" if count else "return=representation")
        range_header: dict[str, str] = {}
        if count and limit is not None and offset is not None:
            headers["Range-Unit"] = "items"
            headers["Range"] = f"{offset}-{offset + limit - 1}"

        url = f"{self._rest_url}/{table}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(
                    url,
                    headers={**headers, **range_header},
                    params=params,
                )
            except httpx.RequestError as exc:
                logger.error("supabase_request_failed", table=table, error=str(exc))
                raise SupabaseError(
                    "Unable to reach Supabase.",
                    code="SUPABASE_UNREACHABLE",
                ) from exc

        if response.status_code >= 400:
            self._handle_error(response, f"SELECT {table}")

        total = _parse_content_range_total(response.headers.get("Content-Range"))
        return response.json(), total

    async def select_one(
        self,
        table: str,
        *,
        columns: str = "*",
        filters: list[tuple[str, str]],
    ) -> dict[str, Any] | None:
        rows, _ = await self.select(
            table,
            columns=columns,
            filters=filters,
            limit=1,
        )
        return rows[0] if rows else None

    async def insert(self, table: str, row: dict[str, Any]) -> dict[str, Any]:
        url = f"{self._rest_url}/{table}"
        response = await self._request("POST", url, json=row, error_context=f"INSERT {table}")
        if response.status_code >= 400:
            self._handle_error(response, f"INSERT {table}")
        data = response.json()
        if isinstance(data, list):
            return data[0]
        return data

    async def update(
        self,
        table: str,
        filters: list[tuple[str, str]],
        row: dict[str, Any],
    ) -> dict[str, Any]:
        url = f"{self._rest_url}/{table}"
        response = await self._request(
            "PATCH",
            url,
            params=filters,
            json=row,
            error_context=f"UPDATE {table}",
        )
        if response.status_code >= 400:
            self._handle_error(response, f"UPDATE {table}")
        data = response.json()
        if isinstance(data, list):
            return data[0] if data else {}
        return data

    async def delete(self, table: str, filters: list[tuple[str, str]]) -> None:
        url = f"{self._rest_url}/{table}"
        response = await self._request(
            "DELETE",
            url,
            params=filters,
            headers={**self._rest_headers(), "Prefer": "return=minimal"},
            error_context=f"DELETE {table}",
        )
        if response.status_code >= 400:
            self._handle_error(response, f"DELETE {table}")

    async def health_check(self) -> bool:
        url = f"{self._rest_url}/"
        headers = {"apikey": self._service_key}
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.head(url, headers=headers)
                return response.status_code < 500
            except httpx.RequestError:
                return False

    async def create_signed_upload_url(self, path: str) -> dict[str, Any]:
        bucket = self._settings.supabase_storage_bucket
        url = f"{self._storage_url}/object/upload/sign/{bucket}/{path}"
        body = {"expiresIn": self._settings.supabase_upload_url_expiry}
        response = await self._request(
            "POST",
            url,
            json=body,
            error_context="create signed upload URL",
        )
        if response.status_code >= 400:
            self._handle_error(response, "create signed upload URL")
        return response.json()

    async def create_signed_url(
        self,
        path: str,
        *,
        transform: dict[str, int | str] | None = None,
    ) -> str:
        bucket = self._settings.supabase_storage_bucket
        url = f"{self._storage_url}/object/sign/{bucket}/{path}"
        body: dict[str, Any] = {"expiresIn": self._settings.supabase_signed_url_expiry}
        if transform:
            body["transform"] = transform
        response = await self._request(
            "POST",
            url,
            json=body,
            error_context="create signed URL",
        )
        if response.status_code >= 400:
            self._handle_error(response, "create signed URL")
        payload = response.json()
        signed = payload.get("signedURL") or payload.get("signedUrl")
        if not signed:
            raise StorageError("Signed URL missing from Supabase response.")
        if signed.startswith("http"):
            return signed
        return f"{self._settings.supabase_url}/storage/v1{signed}"

    async def storage_object_exists(self, path: str) -> bool:
        bucket = self._settings.supabase_storage_bucket
        url = f"{self._storage_url}/object/{bucket}/{path}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                response = await client.head(url, headers=self._auth_headers)
            except httpx.RequestError:
                return False
        return response.status_code == 200

    async def delete_storage_object(self, path: str) -> None:
        bucket = self._settings.supabase_storage_bucket
        url = f"{self._storage_url}/object/{bucket}/{path}"
        response = await self._request(
            "DELETE",
            url,
            headers=self._auth_headers,
            error_context="delete storage object",
        )
        if response.status_code >= 400:
            self._handle_error(response, "delete storage object")


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


def _parse_content_range_total(content_range: str | None) -> int | None:
    if not content_range or "/" not in content_range:
        return None
    total_part = content_range.split("/", 1)[1]
    if total_part == "*":
        return None
    try:
        return int(total_part)
    except ValueError:
        return None

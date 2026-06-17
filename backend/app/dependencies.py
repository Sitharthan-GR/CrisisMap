from typing import Annotated

from fastapi import Depends, Header, Request

from app.config import Settings, get_settings
from app.core.admin_auth import verify_admin_token
from app.core.exceptions import UnauthorizedError
from app.services.supabase import SupabaseClient


def get_supabase_client(request: Request) -> SupabaseClient:
    client: SupabaseClient = request.app.state.supabase
    return client


SettingsDep = Annotated[Settings, Depends(get_settings)]
SupabaseDep = Annotated[SupabaseClient, Depends(get_supabase_client)]


def _admin_secret(settings: Settings) -> str:
    if settings.admin_password is None:
        raise UnauthorizedError("Admin access is not configured")
    return settings.admin_password.get_secret_value()


def require_admin(
    settings: SettingsDep,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError()

    token = authorization.removeprefix("Bearer ").strip()
    if not token or not verify_admin_token(token, _admin_secret(settings)):
        raise UnauthorizedError("Invalid or expired admin session")


AdminDep = Annotated[None, Depends(require_admin)]

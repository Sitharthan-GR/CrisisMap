from typing import Annotated

from fastapi import Depends, Request

from app.config import Settings, get_settings
from app.services.supabase import SupabaseClient


def get_supabase_client(request: Request) -> SupabaseClient:
    client: SupabaseClient = request.app.state.supabase
    return client


SettingsDep = Annotated[Settings, Depends(get_settings)]
SupabaseDep = Annotated[SupabaseClient, Depends(get_supabase_client)]

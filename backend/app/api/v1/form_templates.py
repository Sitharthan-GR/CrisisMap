from fastapi import APIRouter

from app.dependencies import SupabaseDep
from app.schemas.common import success
from app.services import form_template as form_template_service

router = APIRouter(prefix="/form-templates", tags=["form-templates"])


@router.get("/{template_id}")
async def get_form_template(template_id: str, supabase: SupabaseDep) -> dict:
    data = await form_template_service.get_form_template(supabase, template_id)
    return success(data.model_dump(mode="json"))

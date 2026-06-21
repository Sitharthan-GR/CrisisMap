from datetime import datetime, timezone
from typing import Any

import structlog

from app.core.exceptions import NotFoundError, ValidationError
from app.schemas.form_template import (
    FormFieldDefinition,
    FormTemplateCreate,
    FormTemplateOut,
    FormTemplateUpdate,
)
from app.services.supabase import SupabaseClient

logger = structlog.get_logger(__name__)


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _parse_fields(raw: Any) -> list[FormFieldDefinition]:
    if not raw:
        return []
    if not isinstance(raw, list):
        raise ValidationError("fields must be a list")
    return [FormFieldDefinition.model_validate(item) for item in raw]


def _row_to_template(row: dict[str, Any]) -> FormTemplateOut:
    return FormTemplateOut(
        id=row["id"],
        name=row["name"],
        title=row.get("title") or "Incident Report",
        intro=row.get("intro"),
        fields=_parse_fields(row.get("fields")),
        created_at=_parse_dt(row["created_at"]),
        updated_at=_parse_dt(row["updated_at"]),
    )


def _validate_fields(fields: list[FormFieldDefinition]) -> None:
    if not fields:
        raise ValidationError("At least one field is required")
    seen: set[str] = set()
    for field in fields:
        if field.id in seen:
            raise ValidationError(f"Duplicate field id: {field.id}")
        seen.add(field.id)
        if field.type in ("select", "radio", "checkbox") and not field.options:
            raise ValidationError(f"Field '{field.label}' requires options")


async def list_form_templates(supabase: SupabaseClient) -> list[FormTemplateOut]:
    rows, _ = await supabase.select(
        "form_template",
        order="name.asc",
        limit=500,
    )
    return [_row_to_template(row) for row in rows]


async def get_form_template(supabase: SupabaseClient, template_id: str) -> FormTemplateOut:
    row = await supabase.select_one(
        "form_template",
        filters=[("id", f"eq.{template_id}")],
    )
    if not row:
        raise NotFoundError("Form template not found")
    return _row_to_template(row)


async def create_form_template(
    supabase: SupabaseClient, payload: FormTemplateCreate
) -> FormTemplateOut:
    _validate_fields(payload.fields)
    now = datetime.now(timezone.utc).isoformat()
    row = await supabase.insert(
        "form_template",
        {
            "name": payload.name.strip(),
            "title": payload.title.strip(),
            "intro": payload.intro.strip() if payload.intro else None,
            "fields": [f.model_dump(mode="json") for f in payload.fields],
            "created_at": now,
            "updated_at": now,
        },
    )
    logger.info("form_template_created", template_id=row["id"])
    return _row_to_template(row)


async def update_form_template(
    supabase: SupabaseClient, template_id: str, payload: FormTemplateUpdate
) -> FormTemplateOut:
    await get_form_template(supabase, template_id)
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise ValidationError("At least one field is required")
    if "fields" in updates:
        fields = _parse_fields(updates["fields"])
        _validate_fields(fields)
        updates["fields"] = [f.model_dump(mode="json") for f in fields]
    if "name" in updates:
        updates["name"] = updates["name"].strip()
    if "title" in updates:
        updates["title"] = updates["title"].strip()
    if "intro" in updates and updates["intro"] is not None:
        updates["intro"] = updates["intro"].strip() or None
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    row = await supabase.update(
        "form_template",
        [("id", f"eq.{template_id}")],
        updates,
    )
    logger.info("form_template_updated", template_id=template_id)
    return _row_to_template(row)


async def delete_form_template(supabase: SupabaseClient, template_id: str) -> None:
    await get_form_template(supabase, template_id)
    await supabase.delete("form_template", [("id", f"eq.{template_id}")])
    logger.info("form_template_deleted", template_id=template_id)

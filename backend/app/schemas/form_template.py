from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

FormFieldType = Literal[
    "text",
    "number",
    "textarea",
    "select",
    "radio",
    "checkbox",
    "date",
    "datetime",
    "file",
]


class FormFieldDefinition(BaseModel):
    id: str = Field(..., min_length=1, max_length=100)
    label: str = Field(..., min_length=1, max_length=200)
    type: FormFieldType
    required: bool = False
    help_text: str | None = Field(default=None, max_length=500)
    options: list[str] = Field(default_factory=list)


class FormTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    title: str = Field(default="Incident Report", max_length=200)
    intro: str | None = Field(default=None, max_length=1000)
    fields: list[FormFieldDefinition] = Field(default_factory=list)


class FormTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    title: str | None = Field(default=None, max_length=200)
    intro: str | None = Field(default=None, max_length=1000)
    fields: list[FormFieldDefinition] | None = None


class FormTemplateOut(BaseModel):
    id: str
    name: str
    title: str
    intro: str | None = None
    fields: list[FormFieldDefinition]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

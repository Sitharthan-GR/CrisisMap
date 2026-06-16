from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.location import DamageLevel

PhotoMimeType = Literal["image/jpeg", "image/png", "image/webp"]


class PhotoInitiateRequest(BaseModel):
    mime_type: PhotoMimeType
    file_size_kb: int = Field(..., gt=0, le=51200)


class PhotoInitiateResponse(BaseModel):
    photo_id: str
    storage_path: str
    upload_url: str
    expires_in: int = 300


class PhotoConfirmRequest(BaseModel):
    photo_id: str
    storage_path: str
    file_size_kb: int = Field(..., gt=0, le=51200)
    mime_type: PhotoMimeType
    captured_at: datetime | None = None
    gps_lat: float | None = Field(default=None, ge=-90, le=90)
    gps_lng: float | None = Field(default=None, ge=-180, le=180)


class PhotoOut(BaseModel):
    id: str
    report_id: str
    storage_path: str
    signed_url: str | None = None
    thumbnail_url: str | None = None
    ai_damage_label: DamageLevel | None = None
    ai_confidence: float | None = None
    ai_debris_tags: list[str] = Field(default_factory=list)
    file_size_kb: int | None = None
    mime_type: str | None = None
    captured_at: datetime | None = None
    uploaded_at: datetime


class PhotoDeleteResponse(BaseModel):
    deleted: bool = True

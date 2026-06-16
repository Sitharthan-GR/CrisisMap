from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.location import LocationDetail, LocationInput, LocationSummary

DamageLevel = Literal["minimal", "partial", "complete"]
InfraType = Literal[
    "residential",
    "commercial",
    "government",
    "utility",
    "transport",
    "community",
    "public_space",
    "other",
]
ReportStatus = Literal["pending", "validated", "rejected"]
SubmissionChannel = Literal["app", "whatsapp", "web", "sms"]


class ReportCreate(BaseModel):
    crisis_id: str
    damage_level: DamageLevel
    infra_type: InfraType
    infra_subtype: str | None = Field(default=None, max_length=100)
    infra_name: str | None = Field(default=None, max_length=200)
    debris_present: bool
    nature_of_crisis: str | None = Field(default=None, max_length=50)
    description_raw: str | None = None
    reporter_name: str | None = Field(default=None, max_length=100)
    source_language: str | None = Field(default=None, max_length=10)
    submission_channel: SubmissionChannel = "app"
    collected_at: datetime
    location: LocationInput

    @field_validator("reporter_name", mode="before")
    @classmethod
    def normalize_reporter_name(cls, value: str | None) -> str:
        if value is None or not str(value).strip():
            return "anonymous"
        return str(value).strip()


class ReportStatusUpdate(BaseModel):
    status: ReportStatus


class ReportOut(BaseModel):
    id: str
    crisis_id: str
    location_id: str
    damage_level: DamageLevel
    infra_type: InfraType
    infra_subtype: str | None = None
    infra_name: str | None = None
    debris_present: bool
    nature_of_crisis: str | None = None
    description_raw: str | None = None
    description_translated: str | None = None
    reporter_name: str = "anonymous"
    source_language: str | None = None
    is_latest_version: bool
    version_number: int
    submission_channel: SubmissionChannel
    status: ReportStatus
    collected_at: datetime
    submitted_at: datetime
    location: LocationSummary | LocationDetail | None = None


class ReportVersionOut(BaseModel):
    id: str
    version_number: int
    damage_level: DamageLevel
    is_latest_version: bool
    collected_at: datetime
    submitted_at: datetime


class CrisisReportsQuery(BaseModel):
    damage_level: DamageLevel | None = None
    infra_type: InfraType | None = None
    admin_level_2: str | None = None
    status: ReportStatus | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=50, ge=1, le=200)

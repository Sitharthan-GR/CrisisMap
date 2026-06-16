from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


CrisisType = Literal["natural_hazard", "technological", "human_made"]
CrisisStatus = Literal["active", "closed"]


class CrisisCreate(BaseModel):
    name: str = Field(..., max_length=200)
    crisis_type: CrisisType
    crisis_subtype: str = Field(..., max_length=50)
    epicenter_lat: float | None = None
    epicenter_lng: float | None = None
    onset_at: datetime


class CrisisUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    status: CrisisStatus | None = None


class CrisisOut(BaseModel):
    id: str
    name: str
    crisis_type: CrisisType
    crisis_subtype: str
    epicenter_lat: float | None = None
    epicenter_lng: float | None = None
    status: CrisisStatus
    onset_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class CrisisListQuery(BaseModel):
    status: CrisisStatus = "active"

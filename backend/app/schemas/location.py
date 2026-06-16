from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

DamageLevel = Literal["minimal", "partial", "complete"]
LocationMethod = Literal["gps", "what3words", "manual", "exif"]


class LocationInput(BaseModel):
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    what3words: str | None = Field(default=None, max_length=100)
    location_method: LocationMethod = "gps"
    building_footprint_id: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def require_coordinates_or_w3w(self) -> "LocationInput":
        has_coords = self.latitude is not None and self.longitude is not None
        has_w3w = bool(self.what3words)
        if not has_coords and not has_w3w:
            raise ValueError("location requires latitude/longitude or what3words")
        return self


class LocationSummary(BaseModel):
    id: str
    latitude: float
    longitude: float
    what3words: str | None = None
    admin_level_1: str | None = None
    admin_level_2: str | None = None
    admin_level_3: str | None = None


class LocationDetail(LocationSummary):
    latest_damage_level: DamageLevel | None = None
    report_count: int = 0
    last_updated_at: datetime | None = None

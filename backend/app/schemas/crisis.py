from typing import Any

from pydantic import BaseModel, Field


class NearbyCrisisQuery(BaseModel):
    """Query params for get_nearby_crisis_records Supabase RPC."""

    user_lat: float = Field(..., ge=-90, le=90, description="User latitude")
    user_lng: float = Field(..., ge=-180, le=180, description="User longitude")
    radius_meters: float = Field(
        ...,
        gt=0,
        le=500_000,
        description="Search radius in meters",
    )

    def to_rpc_params(self) -> dict[str, float]:
        return {
            "user_lat": self.user_lat,
            "user_lng": self.user_lng,
            "radius_meters": self.radius_meters,
        }


class CrisisRecord(BaseModel):
    """Crisis row returned by Supabase (fields vary by your function)."""

    id: str | int | None = None
    title: str | None = None
    description: str | None = None
    crisis_type: str | None = None
    severity: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    address_text: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    postal_code: str | None = None
    distance_meters: float | None = None
    created_at: str | None = None

    model_config = {"extra": "allow"}


class NearbyCrisisResponse(BaseModel):
    records: list[CrisisRecord]
    count: int


def parse_rpc_records(data: Any) -> list[CrisisRecord]:
    """Normalize Supabase RPC return value into a list of records."""
    if data is None:
        return []
    if isinstance(data, list):
        return [CrisisRecord.model_validate(row) for row in data]
    if isinstance(data, dict):
        return [CrisisRecord.model_validate(data)]
    return []

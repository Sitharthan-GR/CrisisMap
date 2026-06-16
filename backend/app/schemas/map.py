from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.location import DamageLevel
from app.schemas.report import InfraType, ReportStatus


class MapQuery(BaseModel):
    damage_level: DamageLevel | None = None
    infra_type: InfraType | None = None
    bbox: str | None = None
    status: Literal["validated", "all"] = "validated"


class ClusterQuery(BaseModel):
    bbox: str
    precision: int = Field(default=4, ge=1, le=8)


class GeoJsonFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: dict[str, Any]
    properties: dict[str, Any]


class MapFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[GeoJsonFeature]
    total: int | None = None

from pydantic import BaseModel, Field


class ReverseGeocodeQuery(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class ReverseGeocodeOut(BaseModel):
    admin_level_1: str | None = None
    admin_level_2: str | None = None
    admin_level_3: str | None = None
    display_name: str | None = None


class GeocodeSearchQuery(BaseModel):
    q: str = Field(..., min_length=2, max_length=200)
    limit: int = Field(default=5, ge=1, le=10)


class GeocodeSearchResult(BaseModel):
    display_name: str
    latitude: float
    longitude: float
    place_id: int | None = None
    place_type: str | None = None


class GeocodeSearchOut(BaseModel):
    results: list[GeocodeSearchResult]


class W3WDecodeQuery(BaseModel):
    words: str = Field(..., min_length=1)


class W3WDecodeOut(BaseModel):
    latitude: float
    longitude: float
    words: str
    nearest_place: str | None = None

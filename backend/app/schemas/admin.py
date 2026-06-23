from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.crisis import CrisisCreate, CrisisOut, CrisisType
from app.schemas.photo import PhotoOut
from app.schemas.report import ReportOut


class AdminLoginRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=200)


class AdminLoginResponse(BaseModel):
    token: str
    expires_in: int


class UnlistedReportOut(ReportOut):
    photos: list[PhotoOut] = Field(default_factory=list)


class AdminAssignReportRequest(BaseModel):
    crisis_id: str


class AdminCreateCrisisFromReportRequest(BaseModel):
    name: str = Field(..., max_length=200)
    crisis_type: CrisisType
    crisis_subtype: str = Field(..., max_length=50)
    onset_at: datetime
    epicenter_lat: float | None = None
    epicenter_lng: float | None = None
    form_template_id: str | None = None


class AdminAssignReportResponse(BaseModel):
    report: ReportOut
    crisis: CrisisOut | None = None


class CrisisSeverityBreakdown(BaseModel):
    complete: int = 0
    partial: int = 0
    minimal: int = 0


class CrisisReportStatsOut(BaseModel):
    total: int = 0
    sev: CrisisSeverityBreakdown = Field(default_factory=CrisisSeverityBreakdown)


class AdminDashboardOut(BaseModel):
    crises: list[CrisisOut]
    stats: dict[str, CrisisReportStatsOut] = Field(default_factory=dict)
    unlisted_count: int = 0

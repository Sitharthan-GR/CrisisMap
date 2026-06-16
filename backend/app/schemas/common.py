from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ErrorDetail(BaseModel):
    code: str
    message: str


class ApiResponse(BaseModel, Generic[T]):
    data: T | None = None
    error: ErrorDetail | None = None


class PaginationMeta(BaseModel):
    page: int
    limit: int
    total: int
    pages: int


class PaginatedResults(BaseModel, Generic[T]):
    results: list[T]
    pagination: PaginationMeta


def success(data: Any) -> dict[str, Any]:
    return {"data": data, "error": None}

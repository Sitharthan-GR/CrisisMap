from typing import Any

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base application error with HTTP mapping."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        code: str = "INTERNAL_ERROR",
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details or {}
        super().__init__(message)


class SupabaseError(AppError):
    """Raised when Supabase returns an error or is unreachable."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int = status.HTTP_502_BAD_GATEWAY,
        code: str = "SUPABASE_ERROR",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, status_code=status_code, code=code, details=details)


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(message, status_code=status.HTTP_404_NOT_FOUND, code="NOT_FOUND")


class ValidationError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(
            message,
            status_code=status.HTTP_400_BAD_REQUEST,
            code="VALIDATION_ERROR",
        )


class CrisisClosedError(AppError):
    def __init__(self, message: str = "Report submitted to a closed crisis") -> None:
        super().__init__(message, status_code=status.HTTP_400_BAD_REQUEST, code="CRISIS_CLOSED")


class GeocodeError(AppError):
    def __init__(self, message: str = "Geocoding failed") -> None:
        super().__init__(message, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, code="GEOCODE_ERROR")


class StorageError(AppError):
    def __init__(self, message: str = "Storage operation failed") -> None:
        super().__init__(
            message,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code="STORAGE_ERROR",
        )


def error_response(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"data": None, "error": {"code": code, "message": message}},
    )


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return error_response(exc.code, exc.message, exc.status_code)


async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(part) for part in first.get("loc", []) if part != "body")
    message = first.get("msg", "Invalid request")
    if field:
        message = f"{field}: {message}"
    return error_response("VALIDATION_ERROR", message, status.HTTP_400_BAD_REQUEST)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    from app.core.logging import get_logger

    logger = get_logger(__name__)
    logger.exception(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
    )
    return error_response(
        "INTERNAL_ERROR",
        "An unexpected error occurred.",
        status.HTTP_500_INTERNAL_SERVER_ERROR,
    )

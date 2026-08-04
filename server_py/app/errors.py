class AppError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: list = None):
        self.statusCode = status_code
        self.code = code
        self.message = message
        self.details = details or []
        super().__init__(message)


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(404, "NOT_FOUND", message)


class ValidationError(AppError):
    def __init__(self, message: str = "Validation failed", details: list = None):
        super().__init__(400, "VALIDATION_ERROR", message, details)


class UnauthorizedError(AppError):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__(401, "UNAUTHORIZED", message)


class ForbiddenError(AppError):
    def __init__(self, message: str = "Forbidden"):
        super().__init__(403, "FORBIDDEN", message)


# ──────────────────────────────────────────────────────────────────────────
# Unified error response helper
#
# All API error responses should use error_response() so the frontend sees
# a consistent envelope instead of the previous mix of {"error": "..."} (str)
# and FastAPI's default {"detail": "..."}.
# ──────────────────────────────────────────────────────────────────────────
from typing import Optional
from fastapi.responses import JSONResponse


def error_response(
    message: str,
    status_code: int = 400,
    code: Optional[str] = None,
) -> JSONResponse:
    """Return a JSONResponse with the unified error envelope."""
    return JSONResponse(
        status_code=status_code,
        content={"error": {"message": message, "code": code}},
    )

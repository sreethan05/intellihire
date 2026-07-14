import os
import sys
from ..config import SENTRY_DSN, NODE_ENV
import traceback
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from ..errors import AppError
from ..logger import logger


def add_exception_handlers(app: FastAPI):
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        request_id = getattr(request.state, "request_id", "unknown")

        sentry_dsn = SENTRY_DSN
        if sentry_dsn:
            try:
                import sentry_sdk
                sentry_sdk.capture_exception(exc)
            except Exception:
                pass

        logger.error(
            f"AppError status={exc.statusCode} code={exc.code} message={exc.message} request_id={request_id}"
        )

        return JSONResponse(
            status_code=exc.statusCode,
            content={
                "success": False,
                "error": exc.message,
                "code": exc.code,
                "requestId": request_id,
                "details": exc.details,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        request_id = getattr(request.state, "request_id", "unknown")
        errors = exc.errors()

        logger.warning(f"RequestValidationError request_id={request_id} errors={errors}")

        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": "Validation failed",
                "code": "VALIDATION_ERROR",
                "requestId": request_id,
                "details": errors,
            },
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", "unknown")

        sentry_dsn = SENTRY_DSN
        if sentry_dsn:
            try:
                import sentry_sdk
                sentry_sdk.capture_exception(exc)
            except Exception:
                pass

        exc_type, exc_value, exc_traceback = sys.exc_info()
        tb_lines = traceback.format_exception(exc_type, exc_value, exc_traceback)
        tb_text = "".join(tb_lines)

        logger.error(
            f"Unhandled error: {str(exc)}\nStack trace:\n{tb_text}\nrequest_id={request_id}"
        )

        is_dev = NODE_ENV != "production"

        content = {
            "success": False,
            "error": "Internal server error",
            "code": "INTERNAL_ERROR",
            "requestId": request_id,
        }

        if is_dev:
            content["details"] = [{"stack": tb_text}]

        return JSONResponse(status_code=500, content=content)

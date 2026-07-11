import pytest
from app.errors import (
    AppError,
    NotFoundError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
)


def test_app_error_initialization():
    error = AppError(500, "INTERNAL_ERROR", "Something broke", ["detail1"])
    assert error.statusCode == 500
    assert error.code == "INTERNAL_ERROR"
    assert error.message == "Something broke"
    assert error.details == ["detail1"]
    assert isinstance(error, Exception)


def test_not_found_error():
    error = NotFoundError("User not found")
    assert error.statusCode == 404
    assert error.code == "NOT_FOUND"
    assert error.message == "User not found"


def test_validation_error():
    error = ValidationError("Invalid name")
    assert error.statusCode == 400
    assert error.code == "VALIDATION_ERROR"
    assert error.message == "Invalid name"


def test_unauthorized_error():
    error = UnauthorizedError()
    assert error.statusCode == 401
    assert error.code == "UNAUTHORIZED"
    assert error.message == "Unauthorized"


def test_forbidden_error():
    error = ForbiddenError()
    assert error.statusCode == 403
    assert error.code == "FORBIDDEN"
    assert error.message == "Forbidden"

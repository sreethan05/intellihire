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

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details: any[] = []
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details: any[] = []) {
    super(404, "NOT_FOUND", message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details: any[] = []) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized access", details: any[] = []) {
    super(401, "UNAUTHORIZED", message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden access", details: any[] = []) {
    super(403, "FORBIDDEN", message, details);
  }
}

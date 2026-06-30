import * as Sentry from "@sentry/node";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = "APP_ERROR"
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

import type { Request, Response, NextFunction } from "express";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Capture in Sentry if configured
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }

  console.error("Unhandled error:", err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
  }

  // In production, never leak stack traces
  const isDev = process.env.NODE_ENV !== "production";
  return res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
    ...(isDev && { stack: err.stack }),
  });
};

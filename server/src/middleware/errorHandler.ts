import * as Sentry from "@sentry/node";
import { logger } from "../lib/logger.js";
import { AppError } from "../lib/errors.js";
import type { Request, Response, NextFunction } from "express";

export { AppError };

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }

  const requestId = req.id || "unknown";

  logger.error(
    { 
      err: err.message, 
      stack: err.stack, 
      name: err.name,
      requestId 
    }, 
    "Unhandled error"
  );

  const isAppError = err instanceof AppError || (
    typeof (err as any).statusCode === "number" &&
    typeof (err as any).code === "string"
  );

  if (isAppError) {
    const statusCode = (err as any).statusCode;
    return res.status(statusCode).json({
      success: false,
      error: err.message,
      code: (err as any).code,
      requestId,
      details: (err as any).details || []
    });
  }

  const isDev = process.env.NODE_ENV !== "production";
  return res.status(500).json({
    success: false,
    error: "Internal server error",
    code: "INTERNAL_ERROR",
    requestId,
    ...(isDev && { details: [{ stack: err.stack }] })
  });
};

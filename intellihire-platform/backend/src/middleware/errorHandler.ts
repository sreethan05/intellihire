import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(err.status ?? 500).json({
    message: err.message ?? "Unexpected server error"
  });
};


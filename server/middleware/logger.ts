import type { Request, Response, NextFunction } from "express";
import { logRequest } from "../lib/logger.js";

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const userId = (req as any).user?.id;
    logRequest(req.method, req.originalUrl, res.statusCode, duration, userId);
  });
  next();
};

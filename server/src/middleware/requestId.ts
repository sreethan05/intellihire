import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  req.id = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}

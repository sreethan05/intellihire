import type { Request, Response, NextFunction } from "express";
import { db } from "../lib/postgres.js";
import type { AuthRequest } from "./auth.js";
import { logger } from "../lib/logger.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const auditMiddleware = (req: Request, res: Response, next: NextFunction) => {
  res.on("finish", async () => {
    const method = req.method;
    if (!MUTATING_METHODS.has(method)) return;

    const authReq = req as AuthRequest;
    const userId = authReq.user?.id || null;
    const path = req.originalUrl || req.path;
    const ip = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.headers["user-agent"] || null;
    const action = `${method} ${path.split("?")[0]}`;
    const resource = path.split("/")[2] || "unknown";

    let payload: unknown = null;
    if (req.body && typeof req.body === "object") {
      const safe = { ...req.body };
      // Remove sensitive fields
      delete (safe as Record<string, unknown>).password;
      delete (safe as Record<string, unknown>).password_hash;
      delete (safe as Record<string, unknown>).token;
      payload = safe;
    }

    try {
      await db.from("audit_logs").insert({
        user_id: userId,
        action,
        resource,
        method,
        path,
        ip_address: ip,
        user_agent: userAgent,
        payload,
      });
    } catch (err) {
      logger.error({ err, userId, action }, "Failed to write audit log");
    }
  });

  next();
};

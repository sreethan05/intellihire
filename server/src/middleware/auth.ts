import { config } from "../config.js";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = config.JWT_SECRET;

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export const generateToken = (user: { id: string; email: string; role: string }) => {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "24h" });
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
};

/** Sliding-window threshold: auto-refresh if token expires within this many seconds. */
const REFRESH_WINDOW_SECONDS = 2 * 60 * 60; // 2 hours

/**
 * Issue a fresh token from an existing valid one.
 * Returns null if the current token is invalid.
 */
export const refreshToken = (currentToken: string): string | null => {
  try {
    const decoded = verifyToken(currentToken);
    return generateToken({ id: decoded.id, email: decoded.email, role: decoded.role });
  } catch {
    return null;
  }
};

const getCookie = (cookieHeader: string | undefined, name: string): string | null => {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
};

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  let token: string | null = getCookie(req.headers.cookie, "token");
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;

    // Sliding-window token renewal: if token expires within 2 hours, attach a fresh one
    const payload = decoded as typeof decoded & { exp?: number };
    if (payload.exp) {
      const remainingSeconds = payload.exp - Math.floor(Date.now() / 1000);
      if (remainingSeconds > 0 && remainingSeconds < REFRESH_WINDOW_SECONDS) {
        const fresh = generateToken({ id: decoded.id, email: decoded.email, role: decoded.role });
        res.setHeader("X-Refreshed-Token", fresh);
        res.cookie("token", fresh, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
      }
    }

    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
};

export const roleMiddleware = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden - Insufficient permissions" });
      return;
    }
    next();
  };
};

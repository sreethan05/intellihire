import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { ACCESS_TOKEN_COOKIE, CSRF_TOKEN_COOKIE, getCookie } from "./auth.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT_PATHS = [/\/auth\/login$/, /\/auth\/refresh$/];

function tokensMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method) || EXEMPT_PATHS.some((pattern) => pattern.test(req.path))) {
    next();
    return;
  }

  const hasSessionCookie = Boolean(getCookie(req.headers.cookie, ACCESS_TOKEN_COOKIE));
  if (!hasSessionCookie) {
    next();
    return;
  }

  const cookieToken = getCookie(req.headers.cookie, CSRF_TOKEN_COOKIE);
  const headerToken = req.get("x-csrf-token");

  if (!cookieToken || !headerToken || !tokensMatch(cookieToken, headerToken)) {
    res.status(403).json({ error: "Invalid CSRF token" });
    return;
  }

  next();
}

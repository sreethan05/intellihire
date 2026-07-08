import { config } from "../config.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { CookieOptions, Request, Response, NextFunction } from "express";

const JWT_SECRET = config.JWT_SECRET;
export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
export const CSRF_TOKEN_COOKIE = "csrf_token";
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;

type AuthUser = {
  id: string;
  email: string;
  role: string;
};

export interface AuthRequest extends Request {
  user?: AuthUser;
}

const isProduction = () => config.NODE_ENV === "production" || process.env.NODE_ENV === "production";

export const generateToken = (user: AuthUser) => {
  return jwt.sign(user, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, JWT_SECRET) as AuthUser;
};

/**
 * Issue a fresh token from an existing valid one.
 * Kept for low-level token lifecycle tests; HTTP refresh uses DB-backed refresh tokens.
 */
export const refreshToken = (currentToken: string): string | null => {
  try {
    const decoded = verifyToken(currentToken);
    return generateToken({ id: decoded.id, email: decoded.email, role: decoded.role });
  } catch {
    return null;
  }
};

export const generateRefreshToken = () => crypto.randomBytes(48).toString("base64url");
export const generateCsrfToken = () => crypto.randomBytes(32).toString("base64url");

export const hashRefreshToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const getCookie = (cookieHeader: string | undefined, name: string): string | null => {
  if (!cookieHeader) return null;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookieHeader.match(new RegExp("(^|;)\\s*" + escapedName + "\\s*=\\s*([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
};

const authCookieOptions = (maxAge: number): CookieOptions => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: "strict",
  path: "/",
  maxAge,
});

const csrfCookieOptions = (): CookieOptions => ({
  httpOnly: false,
  secure: isProduction(),
  sameSite: "strict",
  path: "/",
  maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
});

export const setSessionCookies = (res: Response, accessToken: string, refreshTokenValue: string) => {
  const csrfToken = generateCsrfToken();
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, authCookieOptions(ACCESS_TOKEN_TTL_SECONDS * 1000));
  res.cookie(REFRESH_TOKEN_COOKIE, refreshTokenValue, authCookieOptions(REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000));
  res.cookie(CSRF_TOKEN_COOKIE, csrfToken, csrfCookieOptions());
  res.clearCookie("token", { path: "/" });
  return csrfToken;
};

export const clearSessionCookies = (res: Response) => {
  const clearOptions: CookieOptions = {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "strict",
    path: "/",
  };
  res.clearCookie(ACCESS_TOKEN_COOKIE, clearOptions);
  res.clearCookie(REFRESH_TOKEN_COOKIE, clearOptions);
  res.clearCookie("token", clearOptions);
  res.clearCookie(CSRF_TOKEN_COOKIE, {
    secure: isProduction(),
    sameSite: "strict",
    path: "/",
  });
};

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = getCookie(req.headers.cookie, ACCESS_TOKEN_COOKIE);

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
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

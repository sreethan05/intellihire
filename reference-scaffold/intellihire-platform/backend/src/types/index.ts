import type { Request } from "express";

export type Role = "admin" | "tpo" | "recruiter" | "candidate";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export interface ApiError extends Error {
  status?: number;
}


import type { NextFunction, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import type { AuthedRequest, Role } from "../types/index.js";

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ message: "Missing bearer token" });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ message: "Invalid token" });

  const { data: appUser, error: profileError } = await supabaseAdmin
    .from("users")
    .select("id,email,role")
    .eq("id", data.user.id)
    .single();

  if (profileError || !appUser) return res.status(403).json({ message: "Application user not found" });
  req.user = appUser;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "Unauthenticated" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}


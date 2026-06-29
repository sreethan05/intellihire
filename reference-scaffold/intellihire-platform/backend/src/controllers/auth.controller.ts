import type { Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import type { AuthedRequest } from "../types/index.js";

export async function signup(req: AuthedRequest, res: Response) {
  const { email, password, role, profile = {} } = req.body;
  if (role !== "candidate" && req.user?.role !== "admin") return res.status(403).json({ message: "Only admins can create staff accounts" });
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  await supabaseAdmin.from("users").insert({ id, email, role });
  const table = role === "tpo" ? "tpos" : role === "recruiter" ? "recruiters" : role === "candidate" ? "candidates" : null;
  if (table) await supabaseAdmin.from(table).insert({ id, ...profile });
  res.status(201).json({ user: { id, email, role } });
}

export async function login(req: AuthedRequest, res: Response) {
  const { email, password } = req.body;
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ message: error.message });
  res.json(data);
}

export async function logout(_req: AuthedRequest, res: Response) {
  res.status(204).send();
}

export async function me(req: AuthedRequest, res: Response) {
  const user = req.user!;
  const table = user.role === "tpo" ? "tpos" : user.role === "recruiter" ? "recruiters" : user.role === "candidate" ? "candidates" : null;
  const profile = table ? await supabaseAdmin.from(table).select("*").eq("id", user.id).maybeSingle() : { data: null };
  res.json({ ...user, profile: profile.data });
}

export async function setPassword(req: AuthedRequest, res: Response) {
  const { password } = req.body;
  const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user!.id, { password });
  if (error) throw error;
  await supabaseAdmin.from("users").update({ must_change_password: false }).eq("id", req.user!.id);
  res.json({ ok: true });
}


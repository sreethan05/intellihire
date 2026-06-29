import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.get("/stats", asyncHandler(async (_req, res) => {
  const tables = ["colleges", "tpos", "recruiters", "candidates", "drives", "certificates"];
  const counts = await Promise.all(tables.map((table) => supabaseAdmin.from(table).select("*", { count: "exact", head: true })));
  res.json(Object.fromEntries(tables.map((table, i) => [table, counts[i].count ?? 0])));
}));

router.post("/colleges", asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from("colleges").insert(req.body).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

router.post("/tpos", asyncHandler(async (req, res) => {
  const { email, password, ...profile } = req.body;
  const auth = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (auth.error) throw auth.error;
  await supabaseAdmin.from("users").insert({ id: auth.data.user.id, email, role: "tpo" });
  const { data, error } = await supabaseAdmin.from("tpos").insert({ id: auth.data.user.id, ...profile }).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

router.post("/recruiters", asyncHandler(async (req, res) => {
  const { email, password, ...profile } = req.body;
  const auth = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (auth.error) throw auth.error;
  await supabaseAdmin.from("users").insert({ id: auth.data.user.id, email, role: "recruiter" });
  const { data, error } = await supabaseAdmin.from("recruiters").insert({ id: auth.data.user.id, ...profile }).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

router.get("/system-health", asyncHandler(async (_req, res) => {
  res.json({ supabase: "configured", judge0: process.env.JUDGE0_API_URL ? "configured" : "missing", ai: process.env.OPENAI_API_KEY ? "configured" : "missing" });
}));
router.get("/error-logs", asyncHandler(async (_req, res) => res.json([])));
router.post("/drives/:id/force-close", asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from("drives").update({ status: "completed" }).eq("id", req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

export default router;


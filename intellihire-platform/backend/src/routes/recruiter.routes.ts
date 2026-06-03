import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendNotifications } from "../services/notification.service.js";
import type { AuthedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pagination } from "../utils/pagination.js";

const router = Router();
router.use(requireAuth, requireRole("recruiter"));

router.post("/drives", asyncHandler(async (req: AuthedRequest, res) => {
  const payload = { ...req.body, recruiter_id: req.user!.id, status: "draft" };
  const { data: drive, error } = await supabaseAdmin.from("drives").insert(payload).select().single();
  if (error) throw error;
  const { data: candidates } = await supabaseAdmin.from("candidates").select("id").eq("college_id", payload.target_college_id).gte("cgpa", payload.min_cgpa).in("branch", payload.allowed_branches ?? []);
  const statuses = (candidates ?? []).map((candidate) => ({ candidate_id: candidate.id, drive_id: drive.id, status: "eligible" }));
  if (statuses.length) await supabaseAdmin.from("candidate_status").upsert(statuses, { onConflict: "candidate_id,drive_id" });
  if (payload.exam_config) await supabaseAdmin.from("exams").insert({ drive_id: drive.id, ...payload.exam_config });
  res.status(201).json({ drive, eligible_count: statuses.length });
}));

router.get("/drives", asyncHandler(async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin.from("drives").select("*,candidate_status(count),exams(*)").eq("recruiter_id", req.user!.id).order("created_at", { ascending: false });
  if (error) throw error;
  res.json(data);
}));

router.get("/drives/:id/eligible-candidates", asyncHandler(async (req, res) => {
  const { from, to } = pagination(req.query);
  const { data, count, error } = await supabaseAdmin.from("candidate_status").select("*,candidates(*)", { count: "exact" }).eq("drive_id", req.params.id).eq("status", "eligible").range(from, to);
  if (error) throw error;
  res.json({ data, count });
}));

router.put("/drives/:id", asyncHandler(async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin.from("drives").update(req.body).eq("id", req.params.id).eq("recruiter_id", req.user!.id).select().single();
  if (error) throw error;
  res.json(data);
}));

router.post("/drives/:id/publish", asyncHandler(async (req: AuthedRequest, res) => {
  const { data: drive, error } = await supabaseAdmin.from("drives").update({ status: "active" }).eq("id", req.params.id).eq("recruiter_id", req.user!.id).select().single();
  if (error) throw error;
  const { data: statuses } = await supabaseAdmin.from("candidate_status").select("candidate_id").eq("drive_id", req.params.id).eq("status", "eligible");
  await sendNotifications((statuses ?? []).map((s) => s.candidate_id), "New recruitment drive", `${drive.company_name} published ${drive.job_title}.`, "success");
  res.json(drive);
}));

export default router;


import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import type { AuthedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth, requireRole("candidate"));

router.put("/profile", upload.fields([{ name: "resume", maxCount: 1 }, { name: "marksheet", maxCount: 1 }]), asyncHandler(async (req: AuthedRequest, res) => {
  const files = req.files as Record<string, Express.Multer.File[]>;
  const patch: Record<string, unknown> = {
    phone: req.body.phone,
    skills: req.body.skills ? JSON.parse(req.body.skills) : undefined,
    domain_preference: req.body.domain_preference
  };
  for (const [field, column] of [["resume", "resume_url"], ["marksheet", "marksheet_url"]] as const) {
    const file = files?.[field]?.[0];
    if (file) {
      const path = `${req.user!.id}/${field}-${Date.now()}-${file.originalname}`;
      const { error } = await supabaseAdmin.storage.from(process.env.SUPABASE_STORAGE_BUCKET ?? "intellihire").upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
      if (error) throw error;
      patch[column] = supabaseAdmin.storage.from(process.env.SUPABASE_STORAGE_BUCKET ?? "intellihire").getPublicUrl(path).data.publicUrl;
    }
  }
  patch.profile_complete = Boolean(patch.phone && patch.skills && patch.domain_preference && patch.resume_url && patch.marksheet_url);
  const { data, error } = await supabaseAdmin.from("candidates").update(patch).eq("id", req.user!.id).select().single();
  if (error) throw error;
  res.json(data);
}));

router.get("/profile-completion", asyncHandler(async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin.from("candidates").select("phone,skills,domain_preference,resume_url,marksheet_url,profile_complete").eq("id", req.user!.id).single();
  if (error) throw error;
  if (!data) return res.status(404).json({ message: "Candidate profile not found" });
  const checks = { phone: !!data.phone, skills: (data.skills ?? []).length > 0, domain_preference: !!data.domain_preference, resume: !!data.resume_url, marksheet: !!data.marksheet_url };
  const done = Object.values(checks).filter(Boolean).length;
  res.json({ percentage: Math.round((done / Object.keys(checks).length) * 100), pending: Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key), profile_complete: data.profile_complete });
}));

router.get("/dashboard", asyncHandler(async (req: AuthedRequest, res) => {
  const [profile, statuses, badges] = await Promise.all([
    supabaseAdmin.from("candidates").select("*").eq("id", req.user!.id).single(),
    supabaseAdmin.from("candidate_status").select("*,drives(*),attempts(*)").eq("candidate_id", req.user!.id),
    supabaseAdmin.from("badges").select("*").eq("candidate_id", req.user!.id)
  ]);
  res.json({ profile: profile.data, drives: statuses.data ?? [], badges: badges.data ?? [] });
}));

router.get("/results/:attemptId", asyncHandler(async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin.from("attempts").select("*,answers(*,questions(*)),coding_submissions(*)").eq("id", req.params.attemptId).eq("candidate_id", req.user!.id).single();
  if (error) throw error;
  res.json(data);
}));

router.get("/certificate/:driveId", asyncHandler(async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin.from("certificates").select("*,drives(*)").eq("candidate_id", req.user!.id).eq("drive_id", req.params.driveId).single();
  if (error) throw error;
  res.json(data);
}));

router.get("/badges", asyncHandler(async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin.from("badges").select("*").eq("candidate_id", req.user!.id);
  if (error) throw error;
  res.json(data);
}));

export default router;

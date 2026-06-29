import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { calculateAttemptScore } from "../services/exam.service.js";
import type { AuthedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);

router.post("/log-violation", asyncHandler(async (req: AuthedRequest, res) => {
  const { attempt_id, violation_type, snapshot_url, details } = req.body;
  await supabaseAdmin.from("proctoring_snapshots").insert({ attempt_id, candidate_id: req.user!.id, violation_type, snapshot_url, details });
  const { count } = await supabaseAdmin.from("proctoring_snapshots").select("*", { count: "exact", head: true }).eq("attempt_id", attempt_id);
  const threshold = Number(process.env.DEFAULT_VIOLATION_THRESHOLD ?? 3);
  let autoSubmitted = false;
  if ((count ?? 0) >= threshold) {
    await calculateAttemptScore(attempt_id);
    autoSubmitted = true;
  }
  res.json({ violation_count: count ?? 0, threshold, auto_submitted: autoSubmitted, warning: autoSubmitted ? "Exam auto-submitted due to violations." : "Violation recorded." });
}));

router.get("/attempt/:attemptId/violations", asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from("proctoring_snapshots").select("*").eq("attempt_id", req.params.attemptId).order("timestamp", { ascending: false });
  if (error) throw error;
  res.json(data);
}));

router.post("/upload-snapshot", upload.single("snapshot"), asyncHandler(async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ message: "snapshot is required" });
  const path = `proctoring/${req.user!.id}/${Date.now()}.jpg`;
  const { error } = await supabaseAdmin.storage.from(process.env.SUPABASE_STORAGE_BUCKET ?? "intellihire").upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (error) throw error;
  res.json({ url: supabaseAdmin.storage.from(process.env.SUPABASE_STORAGE_BUCKET ?? "intellihire").getPublicUrl(path).data.publicUrl });
}));

export default router;


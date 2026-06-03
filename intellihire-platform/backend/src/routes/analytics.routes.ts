import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);

router.get("/recruiter/:driveId/funnel", requireRole("recruiter", "admin"), asyncHandler(async (req, res) => {
  const { data } = await supabaseAdmin.from("candidate_status").select("status").eq("drive_id", req.params.driveId);
  const counts = (data ?? []).reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {});
  res.json(["eligible", "applied", "exam_completed", "shortlisted", "interviewed", "placed"].map((stage) => ({ stage, count: counts[stage] ?? 0 })));
}));

router.get("/recruiter/:driveId/scores", requireRole("recruiter", "admin"), asyncHandler(async (req, res) => {
  const { data } = await supabaseAdmin.from("attempts").select("total_score").eq("drive_id", req.params.driveId);
  res.json(data ?? []);
}));

router.get("/recruiter/:driveId/leaderboard", requireRole("recruiter", "admin"), asyncHandler(async (req, res) => {
  const { data } = await supabaseAdmin.from("attempts").select("*,candidates(full_name,branch,cgpa),candidate_status(status)").eq("drive_id", req.params.driveId).order("total_score", { ascending: false }).limit(20);
  res.json(data ?? []);
}));

router.get("/recruiter/:driveId/topics", requireRole("recruiter", "admin"), asyncHandler((_req, res) => res.json([])));
router.get("/recruiter/:driveId/proctoring", requireRole("recruiter", "admin"), asyncHandler(async (req, res) => {
  const { data } = await supabaseAdmin.from("proctoring_snapshots").select("violation_type,attempt_id").eq("attempts.drive_id", req.params.driveId);
  res.json(data ?? []);
}));
router.get("/recruiter/:driveId/compare", requireRole("recruiter", "admin"), asyncHandler((_req, res) => res.json([])));

router.get("/tpo/current/overview", requireRole("tpo"), asyncHandler(async (req: any, res) => {
  const { data: tpo, error } = await supabaseAdmin.from("tpos").select("college_id").eq("id", req.user.id).single();
  if (error) throw error;
  if (!tpo) return res.status(404).json({ message: "TPO profile not found" });
  const candidates = await supabaseAdmin.from("candidates").select("id,document_verified").eq("college_id", tpo.college_id);
  const placed = await supabaseAdmin.from("candidate_status").select("id").eq("status", "placed");
  res.json({ total_students: candidates.data?.length ?? 0, document_verified: candidates.data?.filter((c) => c.document_verified).length ?? 0, placed: placed.data?.length ?? 0 });
}));

router.get("/tpo/:collegeId/overview", requireRole("tpo", "admin"), asyncHandler(async (req, res) => {
  const candidates = await supabaseAdmin.from("candidates").select("id,document_verified").eq("college_id", req.params.collegeId);
  const placed = await supabaseAdmin.from("candidate_status").select("id").eq("status", "placed");
  res.json({ total_students: candidates.count ?? candidates.data?.length ?? 0, document_verified: candidates.data?.filter((c) => c.document_verified).length ?? 0, placed: placed.data?.length ?? 0 });
}));
router.get("/tpo/:collegeId/branch-wise", requireRole("tpo", "admin"), asyncHandler((_req, res) => res.json([])));
router.get("/tpo/:collegeId/company-wise", requireRole("tpo", "admin"), asyncHandler((_req, res) => res.json([])));
router.get("/tpo/:collegeId/cgpa-correlation", requireRole("tpo", "admin"), asyncHandler((_req, res) => res.json([])));
router.get("/tpo/:collegeId/monthly-trend", requireRole("tpo", "admin"), asyncHandler((_req, res) => res.json([])));

export default router;

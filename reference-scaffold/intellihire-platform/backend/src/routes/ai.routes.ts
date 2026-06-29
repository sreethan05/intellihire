import rateLimit from "express-rate-limit";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { AIService } from "../services/ai.service.js";
import type { AuthedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth, rateLimit({ windowMs: 60_000, limit: 20 }));

router.post("/parse-resume", upload.single("resume"), asyncHandler(async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ message: "resume is required" });
  const text = req.file.mimetype.includes("pdf") ? (await pdfParse(req.file.buffer)).text : (await mammoth.extractRawText({ buffer: req.file.buffer })).value;
  const parsed = await AIService.parseResume(text);
  await supabaseAdmin.from("candidates").update({ ai_resume_data: parsed }).eq("id", req.user!.id);
  res.json(parsed);
}));

router.post("/generate-mcqs", requireRole("recruiter", "admin"), asyncHandler(async (req, res) => {
  res.json(await AIService.generateMcqs(req.body.topic, req.body.difficulty, req.body.count));
}));

router.post("/generate-coding-problem", requireRole("recruiter", "admin"), asyncHandler(async (req, res) => {
  res.json(await AIService.generateCodingProblem(req.body.topic, req.body.difficulty));
}));

router.post("/improvement-report", asyncHandler(async (req, res) => {
  res.json({ report: await AIService.improvementReport(req.body.topic_scores ?? req.body) });
}));

router.post("/interview-summary", requireRole("recruiter", "admin"), asyncHandler(async (req, res) => {
  res.json(await AIService.interviewSummary(req.body.transcript ?? req.body.answers));
}));

router.post("/skill-match", asyncHandler(async (req, res) => {
  res.json(await AIService.skillMatch(req.body.candidate_skills, req.body.job_requirements));
}));

router.post("/candidate-debrief", requireRole("recruiter", "admin"), asyncHandler(async (req, res) => {
  res.json({ debrief: await AIService.candidateDebrief(req.body) });
}));

export default router;


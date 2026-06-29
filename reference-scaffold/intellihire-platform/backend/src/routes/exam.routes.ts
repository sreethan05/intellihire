import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { calculateAttemptScore, shuffle } from "../services/exam.service.js";
import type { AuthedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth, requireRole("candidate", "recruiter", "admin"));

router.get("/:examId/start", asyncHandler(async (req: AuthedRequest, res) => {
  const { data: exam, error: examError } = await supabaseAdmin.from("exams").select("*,drives(*)").eq("id", req.params.examId).single();
  if (examError) throw examError;
  if (!exam) return res.status(404).json({ message: "Exam not found" });
  if (req.user!.role === "candidate") {
    const { data: candidate, error: candidateError } = await supabaseAdmin.from("candidates").select("profile_complete").eq("id", req.user!.id).single();
    if (candidateError) throw candidateError;
    if (!candidate) return res.status(404).json({ message: "Candidate profile not found" });
    if (!candidate.profile_complete) return res.status(403).json({ message: "Complete your profile before taking exams." });
  }
  const { data: attempt } = await supabaseAdmin.from("attempts").insert({ candidate_id: req.user!.id, exam_id: req.params.examId, drive_id: exam.drive_id, status: "in_progress", start_time: new Date().toISOString(), current_section: 0 }).select().single();
  const { data: questions } = await supabaseAdmin.from("questions").select("*").eq("exam_id", req.params.examId).eq("section", 0);
  res.json({ attempt, exam, questions: exam.shuffle_questions ? shuffle(questions ?? []) : questions });
}));

router.get("/attempt/:attemptId/section/:sectionIndex", asyncHandler(async (req, res) => {
  const { data: attempt, error: attemptError } = await supabaseAdmin.from("attempts").select("exam_id,current_section").eq("id", req.params.attemptId).single();
  if (attemptError) throw attemptError;
  if (!attempt) return res.status(404).json({ message: "Attempt not found" });
  const section = Number(req.params.sectionIndex);
  if (section > attempt.current_section) return res.status(423).json({ message: "Section is locked" });
  const { data, error } = await supabaseAdmin.from("questions").select("*").eq("exam_id", attempt.exam_id).eq("section", section);
  if (error) throw error;
  res.json(data);
}));

router.post("/attempt/:attemptId/answer", asyncHandler(async (req, res) => {
  const { question_id, selected_option, time_taken_seconds } = req.body;
  const { data: question } = await supabaseAdmin.from("questions").select("*").eq("id", question_id).single();
  const is_correct = Number(selected_option) === Number(question.correct_option);
  const marks_obtained = is_correct ? question.marks : 0;
  const { data, error } = await supabaseAdmin.from("answers").upsert({ attempt_id: req.params.attemptId, question_id, selected_option, is_correct, marks_obtained, time_taken_seconds }, { onConflict: "attempt_id,question_id" }).select().single();
  if (error) throw error;
  res.json(data);
}));

router.post("/attempt/:attemptId/unlock-section", asyncHandler(async (req, res) => {
  const next = Number(req.body.next_section);
  const { data, error } = await supabaseAdmin.from("attempts").update({ current_section: next }).eq("id", req.params.attemptId).select().single();
  if (error) throw error;
  res.json(data);
}));

router.post("/attempt/:attemptId/submit", asyncHandler(async (req, res) => {
  const total = await calculateAttemptScore(req.params.attemptId);
  res.json({ total_score: total, status: "completed" });
}));

router.get("/attempt/:attemptId/status", asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from("attempts").select("*").eq("id", req.params.attemptId).single();
  if (error) throw error;
  res.json(data);
}));

export default router;

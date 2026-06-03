import { randomUUID } from "node:crypto";
import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AIService } from "../services/ai.service.js";
import type { AuthedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);

function normalizeQuestions(value: unknown) {
  const questions = Array.isArray((value as any)?.questions) ? (value as any).questions : [];
  return questions.map((question: any, index: number) => ({
    id: question.id ?? `q-${index + 1}`,
    type: question.type ?? "technical",
    question: question.question ?? question.question_text ?? String(question),
    expected_signal: question.expected_signal ?? ""
  }));
}

router.post("/templates", requireRole("recruiter"), asyncHandler(async (req: AuthedRequest, res) => {
  const {
    drive_id,
    job_title,
    job_description,
    duration_minutes = 15,
    question_types = ["technical"],
    questions: providedQuestions
  } = req.body;

  const normalizedTypes = Array.isArray(question_types) ? question_types : String(question_types).split(",").map((type) => type.trim()).filter(Boolean);
  const generated = providedQuestions?.length
    ? { questions: providedQuestions }
    : await AIService.generateInterviewQuestions({ job_title, job_description, duration_minutes, question_types: normalizedTypes });

  const questions = normalizeQuestions(generated);
  const { data, error } = await supabaseAdmin
    .from("interview_templates")
    .insert({
      recruiter_id: req.user!.id,
      drive_id,
      job_title,
      job_description,
      duration_minutes,
      question_types: normalizedTypes,
      questions,
      share_slug: randomUUID()
    })
    .select()
    .single();

  if (error) throw error;
  res.status(201).json({ ...data, share_url: `/interview/${data.id}` });
}));

router.get("/templates", requireRole("recruiter", "admin"), asyncHandler(async (req: AuthedRequest, res) => {
  let query = supabaseAdmin
    .from("interview_templates")
    .select("*,interviews(id,status,candidate_name,candidate_email,feedback,completed_at)", { count: "exact" })
    .order("created_at", { ascending: false });

  if (req.user!.role === "recruiter") query = query.eq("recruiter_id", req.user!.id);
  const { data, count, error } = await query;
  if (error) throw error;
  res.json({ data, count });
}));

router.get("/templates/:templateId", asyncHandler(async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from("interview_templates")
    .select("*,interviews(id,status,candidate_name,candidate_email,answers,feedback,completed_at)")
    .eq("id", req.params.templateId)
    .single();
  if (error) throw error;
  if (req.user!.role === "candidate") {
    const { questions: _questions, interviews: _interviews, ...candidateSafeTemplate } = data;
    return res.json(candidateSafeTemplate);
  }
  res.json(data);
}));

router.post("/templates/:templateId/start", requireRole("candidate"), asyncHandler(async (req: AuthedRequest, res) => {
  const { data: template, error: templateError } = await supabaseAdmin
    .from("interview_templates")
    .select("*,drives(id)")
    .eq("id", req.params.templateId)
    .single();
  if (templateError) throw templateError;

  if (template.drive_id) {
    const { data: status } = await supabaseAdmin
      .from("candidate_status")
      .select("id,status")
      .eq("candidate_id", req.user!.id)
      .eq("drive_id", template.drive_id)
      .maybeSingle();
    if (!status) return res.status(403).json({ message: "You are not eligible for this interview." });
  }

  const [{ data: candidate }, { data: user }] = await Promise.all([
    supabaseAdmin.from("candidates").select("full_name,skills").eq("id", req.user!.id).single(),
    supabaseAdmin.from("users").select("email").eq("id", req.user!.id).single()
  ]);

  const { data: session, error } = await supabaseAdmin
    .from("interviews")
    .insert({
      template_id: template.id,
      drive_id: template.drive_id,
      candidate_id: req.user!.id,
      candidate_name: req.body.candidate_name ?? candidate?.full_name,
      candidate_email: req.body.candidate_email ?? user?.email,
      questions: template.questions,
      status: "in_progress",
      started_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw error;
  res.json({ interview: session, template, question: session.questions[0], index: 0 });
}));

router.post("/:interviewId/answer", requireRole("candidate"), asyncHandler(async (req, res) => {
  const { data: interview, error: interviewError } = await supabaseAdmin
    .from("interviews")
    .select("*,interview_templates(job_title,job_description)")
    .eq("id", req.params.interviewId)
    .single();
  if (interviewError) throw interviewError;

  const currentQuestion = interview.questions[req.body.index];
  const answers = [
    ...(interview.answers ?? []),
    {
      question_id: currentQuestion?.id,
      question: currentQuestion?.question ?? currentQuestion,
      answer: req.body.answer,
      answered_at: new Date().toISOString()
    }
  ];

  let questions = interview.questions;
  const baseQuestionCount = questions.filter((question: any) => !question.followup).length;
  if (answers.length === Math.min(3, baseQuestionCount) && !questions.some((question: any) => question.followup)) {
    const followups = normalizeQuestions(await AIService.generateFollowups({
      job_title: interview.interview_templates?.job_title ?? "technical role",
      questions,
      answers
    })).map((question: ReturnType<typeof normalizeQuestions>[number]) => ({ ...question, followup: true }));
    questions = [...questions, ...followups];
  }

  const { error } = await supabaseAdmin.from("interviews").update({ answers, questions }).eq("id", req.params.interviewId);
  if (error) throw error;
  res.json({ next_question: questions[answers.length] ?? null, index: answers.length, done: answers.length >= questions.length });
}));

router.post("/:interviewId/complete", requireRole("candidate"), asyncHandler(async (_req, res) => {
  const { data: interview, error: interviewError } = await supabaseAdmin
    .from("interviews")
    .select("*,interview_templates(job_title,job_description)")
    .eq("id", _req.params.interviewId)
    .single();
  if (interviewError) throw interviewError;

  const feedback = await AIService.evaluateInterview({
    job_title: interview.interview_templates?.job_title ?? "technical role",
    job_description: interview.interview_templates?.job_description,
    questions: interview.questions,
    answers: interview.answers,
    candidate: { name: interview.candidate_name, email: interview.candidate_email }
  });

  const { data, error } = await supabaseAdmin
    .from("interviews")
    .update({ status: "completed", completed_at: new Date().toISOString(), feedback })
    .eq("id", _req.params.interviewId)
    .select()
    .single();

  if (error) throw error;
  res.json(data);
}));

router.get("/:interviewId/feedback", asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("interviews")
    .select("feedback,candidate_name,candidate_email,status,completed_at")
    .eq("id", req.params.interviewId)
    .single();
  if (error) throw error;
  res.json(data);
}));

export default router;

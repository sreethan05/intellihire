import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { getLanguageList, getSubmission, languageIds, submitCode } from "../services/judge0.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);

router.get("/languages", asyncHandler(async (_req, res) => {
  res.json({ mapped: languageIds, judge0: await getLanguageList() });
}));

router.get("/question/:id", asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from("coding_questions").select("id,exam_id,title,problem_statement,input_format,output_format,constraints,sample_cases,difficulty,topic_tags,time_limit_ms,memory_limit_kb,accepted_languages,partial_scoring").eq("id", req.params.id).single();
  if (error) throw error;
  res.json(data);
}));

router.post("/submit", asyncHandler(async (req, res) => {
  const { attempt_id, question_id, language, source_code } = req.body;
  const { data: problem } = await supabaseAdmin.from("coding_questions").select("*").eq("id", question_id).single();
  const cases = [...(problem.sample_cases ?? []), ...(problem.hidden_cases ?? [])];
  const results = [];
  for (const testCase of cases) {
    const token = await submitCode(languageIds[language], source_code, testCase.input, testCase.output, problem.time_limit_ms, problem.memory_limit_kb);
    let result;
    for (let i = 0; i < 10; i += 1) {
      result = await getSubmission(token);
      if (result.status?.id > 2) break;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    results.push({ token, input: testCase.input, expected: testCase.output, actual: result?.stdout, status: result?.status, passed: result?.status?.id === 3 });
  }
  const passed = results.filter((r) => r.passed).length;
  const score = problem.partial_scoring ? Math.round((passed / cases.length) * 100) : passed === cases.length ? 100 : 0;
  const status = score === 100 ? "accepted" : score > 0 ? "wrong_answer" : "wrong_answer";
  const { data, error } = await supabaseAdmin.from("coding_submissions").insert({ attempt_id, coding_question_id: question_id, language, source_code, status, score, test_results: results, submitted_at: new Date().toISOString() }).select().single();
  if (error) throw error;
  res.json(data);
}));

router.get("/submission/:submissionId", asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from("coding_submissions").select("*").eq("id", req.params.submissionId).single();
  if (error) throw error;
  res.json(data);
}));

export default router;


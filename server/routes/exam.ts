import { Router } from "express";
import { supabase } from "../lib/supabase";
import { authMiddleware, roleMiddleware, type AuthRequest } from "../middleware/auth";
import { getExamValidationError } from "../lib/validation";
 
const router = Router();
router.use(authMiddleware);
 
const recruiterOrAdmin = roleMiddleware(["recruiter", "admin"]);

router.post("/create", recruiterOrAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      title,
      description,
      duration,
      total_marks,
      pass_marks,
      available_from,
      available_until,
      status,
      shuffle_questions,
      negative_marking,
    } = req.body;
    const validationError = getExamValidationError({ title, duration, total_marks, pass_marks, available_from, available_until });
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    const payload: Record<string, unknown> = {
      title: String(title).trim(),
      description,
      duration,
      total_marks,
      pass_marks: pass_marks || 0,
      status: status || "draft",
      shuffle_questions: Boolean(shuffle_questions),
      negative_marking: Math.max(0, Number(negative_marking || 0)),
      created_by: req.user!.id,
    };
    if (available_from) payload.available_from = available_from;
    if (available_until) payload.available_until = available_until;

    const { data, error } = await supabase.from("exams").insert(payload).select().single();
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ message: "Exam created", exam: data });
  } catch (err) { console.error("Create exam error:", err); res.status(500).json({ error: "Server error" }); }
});
 
// ── Question Bank routes ──────────────────────────────────────────────────────
 
router.get("/bank/mcq", recruiterOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .eq("created_by", req.user!.id)
      .order("created_at", { ascending: false });
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ questions: data || [] });
  } catch (_err) { res.status(500).json({ error: "Server error" }); }
});
 
router.get("/bank/coding", recruiterOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabase
      .from("coding_questions")
      .select("*")
      .eq("created_by", req.user!.id)
      .order("created_at", { ascending: false });
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ coding_questions: data || [] });
  } catch (_err) { res.status(500).json({ error: "Server error" }); }
});
 
// Link existing bank questions to exam (no re-insert)
router.post("/bank/link-mcq", recruiterOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { exam_id, question_ids } = req.body;
    if (!exam_id || !Array.isArray(question_ids) || question_ids.length === 0) {
      res.status(400).json({ error: "exam_id and question_ids required" }); return;
    }
    const rows = question_ids.map((qid: string) => ({ exam_id, question_id: qid, marks: 1 }));
    const { error } = await supabase.from("exam_questions").upsert(rows, { onConflict: "exam_id,question_id", ignoreDuplicates: true });
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ message: "Questions linked to exam" });
  } catch (_err) { res.status(500).json({ error: "Server error" }); }
});
 
router.post("/bank/link-coding", recruiterOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { exam_id, coding_question_ids } = req.body;
    if (!exam_id || !Array.isArray(coding_question_ids) || coding_question_ids.length === 0) {
      res.status(400).json({ error: "exam_id and coding_question_ids required" }); return;
    }
    const rows = coding_question_ids.map((qid: string) => ({ exam_id, coding_question_id: qid, marks: 10 }));
    const { error } = await supabase.from("exam_coding_questions").upsert(rows, { onConflict: "exam_id,coding_question_id", ignoreDuplicates: true });
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ message: "Coding questions linked to exam" });
  } catch (_err) { res.status(500).json({ error: "Server error" }); }
});

router.post("/bank/add-mcqs", recruiterOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ error: "Questions array required" });
      return;
    }
    const inserted = [];
    for (const q of questions) {
      const { data, error } = await supabase
        .from("questions")
        .insert({
          question_text: q.question_text,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          correct_option: q.correct_option,
          marks: q.marks || 1,
          created_by: req.user!.id,
        })
        .select()
        .single();
      if (!error && data) inserted.push(data);
    }
    res.json({ message: `${inserted.length} question(s) saved to bank`, questions: inserted });
  } catch (err) {
    console.error("Save mcqs error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/bank/add-coding", recruiterOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      res.status(400).json({ error: "Question object required" });
      return;
    }
    const { data, error } = await supabase
      .from("coding_questions")
      .insert({
        title: question.title,
        description: question.description,
        difficulty: question.difficulty || "medium",
        starter_code: question.starter_code || "",
        test_cases: question.test_cases || [],
        marks: question.marks || 10,
        created_by: req.user!.id,
      })
      .select()
      .single();
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ message: "Coding question saved to bank", question: data });
  } catch (err) {
    console.error("Save coding error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
 
// ─────────────────────────────────────────────────────────────────────────────
 
router.post("/add-questions", recruiterOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { exam_id, questions } = req.body;
    if (!exam_id || !Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ error: "exam_id and questions array required" }); return;
    }
    const insertedQuestions = [];
    for (const q of questions) {
      const { data: questionData, error: qErr } = await supabase.from("questions").insert({ question_text: q.question_text, option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d, correct_option: q.correct_option, marks: q.marks || 1, created_by: req.user!.id }).select().single();
      if (qErr || !questionData) continue;
      const { data: linkData, error: linkErr } = await supabase.from("exam_questions").insert({ exam_id, question_id: questionData.id, marks: q.marks || 1 }).select().single();
      if (!linkErr) insertedQuestions.push(linkData);
    }
    res.json({ message: "Questions added", questions: insertedQuestions });
  } catch (err) { console.error("Add questions error:", err); res.status(500).json({ error: "Server error" }); }
});
 
router.post("/add-coding-questions", recruiterOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { exam_id, coding_questions } = req.body;
    if (!exam_id || !Array.isArray(coding_questions) || coding_questions.length === 0) {
      res.status(400).json({ error: "exam_id and coding_questions array required" }); return;
    }
    const insertedQuestions = [];
    for (const q of coding_questions) {
      const { data: questionData, error: qErr } = await supabase.from("coding_questions").insert({ title: q.title, description: q.description, difficulty: q.difficulty || "medium", starter_code: q.starter_code || "", test_cases: q.test_cases || [], marks: q.marks || 10, created_by: req.user!.id }).select().single();
      if (qErr || !questionData) continue;
      const { data: linkData, error: linkErr } = await supabase.from("exam_coding_questions").insert({ exam_id, coding_question_id: questionData.id, marks: q.marks || 10 }).select().single();
      if (!linkErr) insertedQuestions.push(linkData);
    }
    res.json({ message: "Coding questions added", questions: insertedQuestions });
  } catch (err) { console.error("Add coding questions error:", err); res.status(500).json({ error: "Server error" }); }
});
 
router.post("/assign", recruiterOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { exam_id, candidate_ids } = req.body;
    if (!exam_id || !Array.isArray(candidate_ids) || candidate_ids.length === 0) {
      res.status(400).json({ error: "exam_id and candidate_ids required" }); return;
    }
    const assignments = candidate_ids.map((candidate_id) => ({ exam_id, candidate_id, assigned_by: req.user!.id }));
    const { data, error } = await supabase.from("exam_assignments").upsert(assignments, { onConflict: "exam_id,candidate_id", ignoreDuplicates: true }).select();
    if (error) { res.status(400).json({ error: error.message }); return; }
    const newCount = data?.length ?? 0;
    const skipped = assignments.length - newCount;
    const message = skipped > 0 ? `${newCount} candidate(s) assigned. ${skipped} already had this exam (skipped).` : "Exam assigned successfully.";
    res.json({ message, assignments: data });
  } catch (err) { console.error("Assign exam error:", err); res.status(500).json({ error: "Server error" }); }
});
 
router.get("/list", async (req: AuthRequest, res) => {
  try {
    const { role, id } = req.user!;
    let query = supabase.from("exams").select("*");
    if (role === "recruiter") query = query.eq("created_by", id);
    if (!["admin", "recruiter"].includes(role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const { data, error } = await query;
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ exams: data || [] });
  } catch (err) { console.error("List exams error:", err); res.status(500).json({ error: "Server error" }); }
});
 
router.post("/start", async (req: AuthRequest, res) => {
  try {
    const { exam_id } = req.body;
    if (!exam_id) { res.status(400).json({ error: "exam_id required" }); return; }
    const { data: assignment, error: assignErr } = await supabase.from("exam_assignments").select("*").eq("exam_id", exam_id).eq("candidate_id", req.user!.id).single();
    if (assignErr || !assignment) { res.status(403).json({ error: "Exam not assigned to you" }); return; }
    const { data: examWindow, error: windowErr } = await supabase.from("exams").select("available_from, available_until").eq("id", exam_id).single();
    if (!windowErr && examWindow) {
      const now = Date.now();
      if (examWindow.available_from && new Date(examWindow.available_from).getTime() > now) {
        res.status(403).json({ error: `Exam opens at ${new Date(examWindow.available_from).toLocaleString()}` });
        return;
      }
      if (examWindow.available_until && new Date(examWindow.available_until).getTime() < now) {
        res.status(403).json({ error: "Exam attempt window has closed" });
        return;
      }
    }
    const { data: existingAttempt } = await supabase.from("attempts").select("*").eq("exam_id", exam_id).eq("candidate_id", req.user!.id).eq("status", "in_progress").maybeSingle();
    if (existingAttempt) { res.json({ attempt: existingAttempt }); return; }
    const { data: completedAttempt } = await supabase.from("attempts").select("*").eq("exam_id", exam_id).eq("candidate_id", req.user!.id).eq("status", "completed").maybeSingle();
    if (completedAttempt) { res.status(400).json({ error: "Exam already completed" }); return; }
    const { data: exam, error: examErr } = await supabase.from("exams").select("created_by").eq("id", exam_id).single();
    if (examErr || !exam) { res.status(404).json({ error: "Exam not found" }); return; }
    const { data, error } = await supabase.from("attempts").insert({ exam_id, candidate_id: req.user!.id, recruiter_id: exam.created_by, status: "in_progress", score: 0, started_at: new Date().toISOString() }).select().single();
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ attempt: data });
  } catch (err) { console.error("Start exam error:", err); res.status(500).json({ error: "Server error" }); }
});
 
router.get("/:examId", recruiterOrAdmin, async (req: AuthRequest, res) => {
  try {
    const { examId } = req.params;
    const { data, error } = await supabase.from("exams").select("*").eq("id", examId).single();
    if (error || !data) { res.status(404).json({ error: "Exam not found" }); return; }
    const { data: mcqQuestions } = await supabase.from("exam_questions").select("*, questions:question_id(*)").eq("exam_id", examId);
    const { data: codingQuestions } = await supabase.from("exam_coding_questions").select("*, coding_questions:coding_question_id(*)").eq("exam_id", examId);
    res.json({ exam: data, mcqQuestions: mcqQuestions || [], codingQuestions: codingQuestions || [] });
  } catch (err) { console.error("Get exam error:", err); res.status(500).json({ error: "Server error" }); }
});
 
export default router;
 

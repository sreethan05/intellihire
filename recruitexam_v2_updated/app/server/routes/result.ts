import { Router } from "express";
import { supabase } from "../lib/supabase";
import { authMiddleware, type AuthRequest } from "../middleware/auth";
import { gradingQueue } from "../lib/queue";
import { runPlagiarismCheck } from "../lib/plagiarism";

const router = Router();

router.use(authMiddleware);

// Submit a single MCQ answer — upsert to allow re-answering
router.post("/submit-mcq", async (req: AuthRequest, res) => {
  try {
    const { attempt_id, question_id, selected_option } = req.body;
    if (!attempt_id || !question_id || !selected_option) {
      res.status(400).json({ error: "attempt_id, question_id, selected_option required" });
      return;
    }

    const { data: attempt, error: attemptErr } = await supabase
      .from("attempts")
      .select("candidate_id, status, exams:exam_id(negative_marking)")
      .eq("id", attempt_id)
      .single();

    if (attemptErr || !attempt) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    if (attempt.candidate_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (attempt.status === "completed") {
      res.status(400).json({ error: "Exam already submitted" });
      return;
    }

    const { data: question, error: qErr } = await supabase
      .from("questions")
      .select("correct_option, marks")
      .eq("id", question_id)
      .single();

    if (qErr || !question) {
      res.status(404).json({ error: "Question not found" });
      return;
    }

    const is_correct = question.correct_option === selected_option;
    const exam = Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams;
    const negativeMarking = Math.max(0, Number(exam?.negative_marking || 0));
    const marks_obtained = is_correct ? question.marks : -negativeMarking;

    const { data, error } = await supabase
      .from("answers")
      .upsert(
        {
          attempt_id,
          question_id,
          selected_option,
          is_correct,
          marks_obtained,
        },
        { onConflict: "attempt_id,question_id" }
      )
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ message: "Answer submitted", answer: data });
  } catch (err) {
    console.error("Submit MCQ error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Submit code for a coding question — upsert to allow re-submissions
router.post("/submit-code", async (req: AuthRequest, res) => {
  try {
    const { attempt_id, coding_question_id, code, language } = req.body;
    if (!attempt_id || !coding_question_id || !code || !language) {
      res.status(400).json({ error: "All fields required" });
      return;
    }

    const { data: attempt, error: attemptErr } = await supabase
      .from("attempts")
      .select("candidate_id, status")
      .eq("id", attempt_id)
      .single();

    if (attemptErr || !attempt) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    if (attempt.candidate_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (attempt.status === "completed") {
      res.status(400).json({ error: "Exam already submitted" });
      return;
    }

    const { data, error } = await supabase
      .from("coding_submissions")
      .upsert(
        {
          attempt_id,
          coding_question_id,
          code,
          language,
          score: 0,
          status: "pending",
        },
        { onConflict: "attempt_id,coding_question_id" }
      )
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ message: "Code submitted", submission: data });
  } catch (err) {
    console.error("Submit code error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Update coding submission score after test-case run
router.post("/update-code-score", async (req: AuthRequest, res) => {
  try {
    const { attempt_id, coding_question_id, score, code, language } = req.body;
    if (!attempt_id || !coding_question_id || score === undefined) {
      res.status(400).json({ error: "attempt_id, coding_question_id, and score required" });
      return;
    }

    const { data: attempt, error: attemptErr } = await supabase
      .from("attempts")
      .select("candidate_id, status")
      .eq("id", attempt_id)
      .single();

    if (attemptErr || !attempt) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    if (attempt.candidate_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (attempt.status === "completed") {
      res.status(400).json({ error: "Exam already submitted" });
      return;
    }

    const { data, error } = await supabase
      .from("coding_submissions")
      .upsert(
        {
          attempt_id,
          coding_question_id,
          code: code || "",
          language: language || "python",
          score,
          status: "tested",
        },
        { onConflict: "attempt_id,coding_question_id" }
      )
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ message: "Code score updated", submission: data });
  } catch (err) {
    console.error("Update code score error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Finalize the exam: tally scores, mark as completed, and queue for background grading
router.post("/submit-exam", async (req: AuthRequest, res) => {
  try {
    const { attempt_id } = req.body;
    if (!attempt_id) {
      res.status(400).json({ error: "attempt_id required" });
      return;
    }

    const { data: attempt, error: attErr } = await supabase
      .from("attempts")
      .select("candidate_id, status")
      .eq("id", attempt_id)
      .single();

    if (attErr || !attempt) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    if (attempt.candidate_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (attempt.status === "completed") {
      res.status(400).json({ error: "Exam already submitted" });
      return;
    }

    // Instantly mark the attempt as completed in the database.
    // The background worker will grade all pending submissions and finalize the score.
    const { data, error } = await supabase
      .from("attempts")
      .update({
        status: "completed",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", attempt_id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    // Queue the grading task asynchronously in the background.
    // This allows the route to return immediately (< 100ms) preventing timeouts!
    gradingQueue.push(attempt_id);

    res.json({ 
      message: "Exam submitted successfully. Grading is processing in the background.", 
      attempt: data 
    });
  } catch (err) {
    console.error("Submit exam error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ⚠️  IMPORTANT: specific route BEFORE wildcard /:examId
// Get detailed attempt (answers + code)
router.get("/attempt/:attemptId", async (req: AuthRequest, res) => {
  try {
    const { attemptId } = req.params;

    const { data: attempt, error: attErr } = await supabase
      .from("attempts")
      .select("*, exams:exam_id(*), users:candidate_id(name, email)")
      .eq("id", attemptId)
      .single();

    if (attErr || !attempt) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    const { data: answers } = await supabase
      .from("answers")
      .select("*, questions:question_id(*)")
      .eq("attempt_id", attemptId);

    const { data: submissions } = await supabase
      .from("coding_submissions")
      .select("*, coding_questions:coding_question_id(*)")
      .eq("attempt_id", attemptId);

    res.json({
      attempt,
      answers: answers || [],
      codingSubmissions: submissions || [],
    });
  } catch (err) {
    console.error("Get attempt error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all results for a recruiter (no examId filter)
router.get("/all", async (req: AuthRequest, res) => {
  try {
    const { role, id } = req.user!;
    const collegeId = req.query.collegeId as string | undefined;

    let query = supabase
      .from("attempts")
      .select("*, users:candidate_id(name, email), exams:exam_id(title, total_marks, pass_marks)")
      .order("started_at", { ascending: false });

    if (role === "recruiter") {
      query = query.eq("recruiter_id", id);
    }

    if (collegeId) {
      const { data: profiles } = await supabase
        .from("candidate_profiles")
        .select("user_id")
        .eq("college_id", collegeId);
      const userIds = (profiles || []).map(p => p.user_id);
      if (userIds.length === 0) {
        res.json({ results: [] });
        return;
      }
      query = query.in("candidate_id", userIds);
    }

    const { data, error } = await query;
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ results: data || [] });
  } catch (err) {
    console.error("Get all results error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get results for a specific exam (recruiter/admin)
router.get("/:examId", async (req: AuthRequest, res) => {
  try {
    const { examId } = req.params;
    const { role, id } = req.user!;
    const collegeId = req.query.collegeId as string | undefined;

    let query = supabase
      .from("attempts")
      .select("*, users:candidate_id(name, email), exams:exam_id(title, total_marks, pass_marks)")
      .eq("exam_id", examId);

    if (role === "recruiter") {
      query = query.eq("recruiter_id", id);
    }

    if (collegeId) {
      const { data: profiles } = await supabase
        .from("candidate_profiles")
        .select("user_id")
        .eq("college_id", collegeId);
      const userIds = (profiles || []).map(p => p.user_id);
      if (userIds.length === 0) {
        res.json({ results: [] });
        return;
      }
      query = query.in("candidate_id", userIds);
    }

    const { data, error } = await query;

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ results: data || [] });
  } catch (err) {
    console.error("Get results error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// Run manual plagiarism check for an attempt
router.post("/plagiarism/run/:attemptId", async (req: AuthRequest, res) => {
  try {
    const { role } = req.user!;
    if (role !== "recruiter" && role !== "admin") {
      res.status(403).json({ error: "Only recruiters or admins can trigger plagiarism checks" });
      return;
    }

    const { attemptId } = req.params;
    await runPlagiarismCheck(attemptId);

    res.json({ message: "Plagiarism check completed successfully" });
  } catch (err) {
    console.error("Run plagiarism error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all plagiarism flags for a specific exam
router.get("/plagiarism/exam/:examId", async (req: AuthRequest, res) => {
  try {
    const { examId } = req.params;
    const { role } = req.user!;

    if (role !== "recruiter" && role !== "admin") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // 1. Fetch all attempts for the specified exam
    const { data: attempts, error: attErr } = await supabase
      .from("attempts")
      .select("id")
      .eq("exam_id", examId);

    if (attErr) {
      res.status(400).json({ error: attErr.message });
      return;
    }

    const attemptIds = (attempts || []).map((a: any) => a.id);
    if (attemptIds.length === 0) {
      res.json({ flags: [] });
      return;
    }

    // 2. Fetch plagiarism flags associated with these attempts
    const { data: flags, error: flagErr } = await supabase
      .from("plagiarism_flags")
      .select(`
        *,
        coding_submissions(
          id,
          language,
          coding_questions(title)
        ),
        attempts(
          id,
          users:candidate_id(name, email)
        ),
        matched_attempt:matched_with_attempt_id(
          id,
          users:candidate_id(name, email)
        )
      `)
      .in("attempt_id", attemptIds)
      .order("similarity_score", { ascending: false });

    if (flagErr) {
      res.status(400).json({ error: flagErr.message });
      return;
    }

    res.json({ flags: flags || [] });
  } catch (err) {
    console.error("Get exam plagiarism error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get plagiarism flags for a specific candidate attempt
router.get("/plagiarism/attempt/:attemptId", async (req: AuthRequest, res) => {
  try {
    const { attemptId } = req.params;
    const { role } = req.user!;

    if (role !== "recruiter" && role !== "admin") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const { data: flags, error: flagErr } = await supabase
      .from("plagiarism_flags")
      .select(`
        *,
        coding_submissions(
          id,
          code,
          language,
          coding_questions(title)
        ),
        attempts(
          id,
          users:candidate_id(name, email)
        ),
        matched_attempt:matched_with_attempt_id(
          id,
          users:candidate_id(name, email)
        )
      `)
      .or(`attempt_id.eq.${attemptId},matched_with_attempt_id.eq.${attemptId}`)
      .order("similarity_score", { ascending: false });

    if (flagErr) {
      res.status(400).json({ error: flagErr.message });
      return;
    }

    res.json({ flags: flags || [] });
  } catch (err) {
    console.error("Get attempt plagiarism error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

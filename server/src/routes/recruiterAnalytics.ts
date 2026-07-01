import { Router } from "express";
import { db } from "../lib/postgres.js";
import { authMiddleware, roleMiddleware, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(roleMiddleware(["recruiter"]));

function getRecruiterFilter(req: AuthRequest) {
  return { recruiterId: req.user!.id };
}

// ─── 1. Candidate Drill-Down Profile ──────────────────────────────────────────
router.get("/candidates/:candidateId/analytics", async (req: AuthRequest, res) => {
  try {
    const { candidateId } = req.params;
    const { recruiterId } = getRecruiterFilter(req);

    const [{ data: user }, { data: profile }] = await Promise.all([
      db.from("users").select("id, name, email, roll_number, created_at").eq("id", candidateId).single(),
      db.from("candidate_profiles").select("*, college:college_id(name, code)").eq("user_id", candidateId).maybeSingle(),
    ]);

    const { data: attempts } = await db
      .from("attempts")
      .select("*, exams:exam_id(title, total_marks, pass_marks)")
      .eq("candidate_id", candidateId)
      .eq("recruiter_id", recruiterId)
      .order("started_at", { ascending: false });

    const attemptIds = (attempts || []).map((a: any) => a.id);

    const [{ data: codingSubs }, { data: proctoringEvents }, { data: interviews }, { data: pipeline }] = await Promise.all([
      db.from("coding_submissions").select("*, coding_questions:coding_question_id(title, difficulty)").in("attempt_id", attemptIds.length ? attemptIds : ["00000000-0000-0000-0000-000000000000"]),
      db.from("proctoring_snapshots").select("*").eq("candidate_id", candidateId).order("captured_at", { ascending: false }).limit(20),
      db.from("ai_interviews").select("*, job:job_id(title, company_name)").eq("candidate_id", candidateId).eq("status", "completed").order("submitted_at", { ascending: false }),
      db.from("candidate_status").select("*, job:job_id(title, company_name)").eq("candidate_id", candidateId),
    ]);

    const completedAttempts = (attempts || []).filter((a: any) => a.status === "completed");
    const avgScore = completedAttempts.length
      ? Number((completedAttempts.reduce((s: number, a: any) => s + (a.score || 0), 0) / completedAttempts.length).toFixed(1))
      : 0;

    const passCount = completedAttempts.filter((a: any) => {
      const exam = Array.isArray(a.exams) ? a.exams[0] : a.exams;
      return (a.score || 0) >= (exam?.pass_marks || 0);
    }).length;

    res.json({
      candidate: { ...user, profile },
      examStats: {
        totalAttempts: (attempts || []).length,
        completed: completedAttempts.length,
        averageScore: avgScore,
        passRate: completedAttempts.length ? Math.round((passCount / completedAttempts.length) * 100) : 0,
      },
      attempts: (attempts || []).map((a: any) => ({
        id: a.id,
        examTitle: Array.isArray(a.exams) ? a.exams[0]?.title : a.exams?.title,
        score: a.score,
        status: a.status,
        startedAt: a.started_at,
        submittedAt: a.submitted_at,
      })),
      codingSubmissions: (codingSubs || []).map((s: any) => ({
        id: s.id,
        title: Array.isArray(s.coding_questions) ? s.coding_questions[0]?.title : s.coding_questions?.title,
        difficulty: Array.isArray(s.coding_questions) ? s.coding_questions[0]?.difficulty : s.coding_questions?.difficulty,
        language: s.language,
        score: s.score,
      })),
      proctoringEvents: (proctoringEvents || []).map((e: any) => ({
        id: e.id,
        eventType: e.event_type,
        message: e.message,
        violationCount: e.violation_count,
        capturedAt: e.captured_at,
      })),
      interviews: (interviews || []).map((i: any) => ({
        id: i.id,
        jobTitle: Array.isArray(i.job) ? i.job[0]?.title : i.job?.title,
        companyName: Array.isArray(i.job) ? i.job[0]?.company_name : i.job?.company_name,
        score: i.score,
        selected: i.selected,
        submittedAt: i.submitted_at,
      })),
      pipeline: (pipeline || []).map((p: any) => ({
        jobId: p.job_id,
        jobTitle: Array.isArray(p.job) ? p.job[0]?.title : p.job?.title,
        companyName: Array.isArray(p.job) ? p.job[0]?.company_name : p.job?.company_name,
        status: p.status,
        updatedAt: p.updated_at,
      })),
    });
  } catch (err) {
    console.error("Candidate drill-down error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 2. Topic-Wise Class Performance ─────────────────────────────────────────
router.get("/exams/:examId/topic-performance", async (req: AuthRequest, res) => {
  try {
    const { examId } = req.params;
    const { recruiterId } = getRecruiterFilter(req);

    const { data: examQuestions } = await db
      .from("exam_questions")
      .select("question_id, questions:question_id(topic_tags, question_text)")
      .eq("exam_id", examId);

    const { data: attempts } = await db
      .from("attempts")
      .select("id")
      .eq("exam_id", examId)
      .eq("recruiter_id", recruiterId)
      .eq("status", "completed");

    const attemptIds = (attempts || []).map((a: any) => a.id);

    const { data: answers } = await db
      .from("answers")
      .select("question_id, is_correct, marks_obtained")
      .in("attempt_id", attemptIds.length ? attemptIds : ["00000000-0000-0000-0000-000000000000"]);

    const topicMap = new Map<string, { total: number; correct: number; totalMarks: number; obtainedMarks: number }>();
    (answers || []).forEach((a: any) => {
      const q = (examQuestions || []).find((eq: any) => eq.question_id === a.question_id);
      const qData = Array.isArray(q?.questions) ? q.questions[0] : q?.questions;
      const tags = Array.isArray(qData?.topic_tags) ? qData.topic_tags : ["General"];
      tags.forEach((tag: string) => {
        const current = topicMap.get(tag) || { total: 0, correct: 0, totalMarks: 0, obtainedMarks: 0 };
        current.total += 1;
        if (a.is_correct) current.correct += 1;
        current.totalMarks += 1;
        current.obtainedMarks += Number(a.marks_obtained || 0);
        topicMap.set(tag, current);
      });
    });

    const topics = Array.from(topicMap.entries())
      .map(([topic, stats]) => ({
        topic,
        accuracy: stats.total ? Math.round((stats.correct / stats.total) * 100) : 0,
        total: stats.total,
        correct: stats.correct,
        avgMarks: stats.total ? Number((stats.obtainedMarks / stats.total).toFixed(1)) : 0,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);

    const weakest = topics.slice(0, 3);

    res.json({ topics, weakest, totalCandidates: attemptIds.length });
  } catch (err) {
    console.error("Topic performance error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 3. Proctoring Analytics Dashboard ───────────────────────────────────────
router.get("/proctoring-analytics", async (req: AuthRequest, res) => {
  try {
    const { recruiterId } = getRecruiterFilter(req);

    const { data: attempts } = await db
      .from("attempts")
      .select("id")
      .eq("recruiter_id", recruiterId)
      .eq("status", "completed");

    const attemptIds = (attempts || []).map((a: any) => a.id);

    const { data: events } = await db
      .from("proctoring_snapshots")
      .select("event_type, message, violation_count, candidate_id, users:candidate_id(name)")
      .in("attempt_id", attemptIds.length ? attemptIds : ["00000000-0000-0000-0000-000000000000"]);

    const violations = (events || []).filter((e: any) => e.event_type === "violation");

    const typeMap = new Map<string, number>();
    const candidateMap = new Map<string, { name: string; count: number }>();

    violations.forEach((v: any) => {
      const msg = (v.message || "").toLowerCase();
      let type = "other";
      if (msg.includes("tab")) type = "tab_switch";
      else if (msg.includes("face")) type = "face_missing";
      else if (msg.includes("camera")) type = "camera_offline";
      else if (msg.includes("phone")) type = "phone_detected";
      else if (msg.includes("looking")) type = "looking_away";
      typeMap.set(type, (typeMap.get(type) || 0) + 1);

      const name = Array.isArray(v.users) ? v.users[0]?.name : v.users?.name || "Unknown";
      const current = candidateMap.get(v.candidate_id) || { name, count: 0 };
      current.count += 1;
      candidateMap.set(v.candidate_id, current);
    });

    const byType = Array.from(typeMap.entries()).map(([type, count]) => ({ type, count }));
    const byCandidate = Array.from(candidateMap.entries())
      .map(([candidateId, stats]) => ({ candidateId, name: stats.name, violations: stats.count }))
      .sort((a, b) => b.violations - a.violations)
      .slice(0, 10);

    res.json({ totalViolations: violations.length, byType, byCandidate });
  } catch (err) {
    console.error("Proctoring analytics error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 4. Plagiarism Analytics ──────────────────────────────────────────────────
router.get("/plagiarism-analytics", async (req: AuthRequest, res) => {
  try {
    const { recruiterId } = getRecruiterFilter(req);

    const { data: attempts } = await db
      .from("attempts")
      .select("id, exam_id")
      .eq("recruiter_id", recruiterId)
      .eq("status", "completed");

    const attemptIds = (attempts || []).map((a: any) => a.id);

    const { data: flags } = await db
      .from("plagiarism_flags")
      .select("*, attempts:attempt_id(candidate_id), coding_submissions:coding_submission_id(code, language), matched:matched_with_attempt_id(candidate_id)")
      .in("attempt_id", attemptIds.length ? attemptIds : ["00000000-0000-0000-0000-000000000000"]);

    const flagList = (flags || []) as any[];
    const totalFlags = flagList.length;
    const avgSimilarity = flagList.length
      ? Number((flagList.reduce((s: number, f: any) => s + (f.similarity_score || 0), 0) / flagList.length).toFixed(1))
      : 0;

    const highFlags = flagList
      .filter((f: any) => (f.similarity_score || 0) > 70)
      .sort((a: any, b: any) => (b.similarity_score || 0) - (a.similarity_score || 0))
      .slice(0, 10)
      .map((f: any) => ({
        id: f.id,
        attemptId: f.attempt_id,
        candidateId: Array.isArray(f.attempts) ? f.attempts[0]?.candidate_id : f.attempts?.candidate_id,
        similarityScore: f.similarity_score || 0,
        matchedWith: Array.isArray(f.matched) ? f.matched[0]?.candidate_id : f.matched?.candidate_id,
        status: f.status,
      }));

    res.json({ totalFlags, avgSimilarity, highFlags });
  } catch (err) {
    console.error("Plagiarism analytics error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 5. Interview Funnel Analytics ───────────────────────────────────────────
router.get("/interview-funnel", async (req: AuthRequest, res) => {
  try {
    const { recruiterId } = getRecruiterFilter(req);

    const { data: jobs } = await db.from("jobs").select("id").eq("created_by", recruiterId);
    const jobIds = (jobs || []).map((j: any) => j.id);

    const { data: examIdsData } = await db.from("exams").select("id").eq("created_by", recruiterId);
    const examIds = (examIdsData || []).map((e: any) => e.id);

    if (jobIds.length === 0 && examIds.length === 0) {
      res.json({ funnel: [], scoreDistribution: [], avgScores: {} });
      return;
    }

    let query = db.from("ai_interviews").select("status, score, selected");
    const conditions: string[] = [];
    if (jobIds.length > 0) conditions.push(`job_id.in.(${jobIds.join(",")})`);
    if (examIds.length > 0) conditions.push(`exam_id.in.(${examIds.join(",")})`);
    if (conditions.length > 0) query = query.or(conditions.join(","));

    const { data: interviews } = await query;
    const list = (interviews || []) as any[];

    const scheduled = list.filter((i) => i.status === "scheduled" || i.status === "pending").length;
    const started = list.filter((i) => i.status === "in_progress").length;
    const completed = list.filter((i) => i.status === "completed").length;
    const selected = list.filter((i) => i.selected).length;

    const funnel = [
      { stage: "Scheduled", count: scheduled },
      { stage: "Started", count: started },
      { stage: "Completed", count: completed },
      { stage: "Selected", count: selected },
    ];

    const completedInterviews = list.filter((i) => i.status === "completed");
    const scoreDistribution = [
      { band: "0-40", count: completedInterviews.filter((i) => (i.score || 0) < 40).length },
      { band: "40-60", count: completedInterviews.filter((i) => (i.score || 0) >= 40 && (i.score || 0) < 60).length },
      { band: "60-80", count: completedInterviews.filter((i) => (i.score || 0) >= 60 && (i.score || 0) < 80).length },
      { band: "80-100", count: completedInterviews.filter((i) => (i.score || 0) >= 80).length },
    ];

    const avgScores = completedInterviews.length
      ? {
          overall: Math.round(completedInterviews.reduce((s, i) => s + (i.score || 0), 0) / completedInterviews.length),
        }
      : { overall: 0 };

    res.json({ funnel, scoreDistribution, avgScores, total: list.length });
  } catch (err) {
    console.error("Interview funnel error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 6. Time-to-Complete Analytics ───────────────────────────────────────────
router.get("/time-to-complete", async (req: AuthRequest, res) => {
  try {
    const { recruiterId } = getRecruiterFilter(req);

    const { data: attempts } = await db
      .from("attempts")
      .select("*, exams:exam_id(title, duration, total_marks)")
      .eq("recruiter_id", recruiterId)
      .eq("status", "completed")
      .neq("submitted_at", null);

    const list = (attempts || []) as any[];

    const data = list.map((a) => {
      const exam = Array.isArray(a.exams) ? a.exams[0] : a.exams;
      const started = new Date(a.started_at).getTime();
      const submitted = new Date(a.submitted_at).getTime();
      const durationSec = (submitted - started) / 1000;
      const allottedSec = (exam?.duration || 0) * 60;
      const percentageUsed = allottedSec ? Math.round((durationSec / allottedSec) * 100) : 0;
      return {
        attemptId: a.id,
        examTitle: exam?.title || "Unknown",
        durationSec: Math.round(durationSec),
        allottedSec,
        percentageUsed,
        score: a.score || 0,
        totalMarks: exam?.total_marks || 0,
      };
    });

    const avgTime = data.length ? Math.round(data.reduce((s, d) => s + d.durationSec, 0) / data.length) : 0;
    const avgPercentageUsed = data.length ? Math.round(data.reduce((s, d) => s + d.percentageUsed, 0) / data.length) : 0;

    res.json({ data, avgTime, avgPercentageUsed, count: data.length });
  } catch (err) {
    console.error("Time-to-complete error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 7. Coding Language Preference ───────────────────────────────────────────
router.get("/coding-languages", async (req: AuthRequest, res) => {
  try {
    const { recruiterId } = getRecruiterFilter(req);

    const { data: attempts } = await db
      .from("attempts")
      .select("id")
      .eq("recruiter_id", recruiterId)
      .eq("status", "completed");

    const attemptIds = (attempts || []).map((a: any) => a.id);

    const { data: submissions } = await db
      .from("coding_submissions")
      .select("language, score, coding_questions:coding_question_id(marks)")
      .in("attempt_id", attemptIds.length ? attemptIds : ["00000000-0000-0000-0000-000000000000"]);

    const langMap = new Map<string, { count: number; success: number; totalScore: number }>();
    (submissions || []).forEach((s: any) => {
      const lang = s.language || "unknown";
      const current = langMap.get(lang) || { count: 0, success: 0, totalScore: 0 };
      current.count += 1;
      if ((s.score || 0) > 0) current.success += 1;
      current.totalScore += s.score || 0;
      langMap.set(lang, current);
    });

    const languages = Array.from(langMap.entries()).map(([language, stats]) => ({
      language,
      count: stats.count,
      successRate: stats.count ? Math.round((stats.success / stats.count) * 100) : 0,
      avgScore: stats.count ? Number((stats.totalScore / stats.count).toFixed(1)) : 0,
    }));

    res.json({ languages, totalSubmissions: (submissions || []).length });
  } catch (err) {
    console.error("Coding languages error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 8. Predictive Shortlisting ──────────────────────────────────────────────
router.get("/predictive-shortlist", async (req: AuthRequest, res) => {
  try {
    const { recruiterId } = getRecruiterFilter(req);

    const candidateQuery = db.from("users").select("id, name, email").eq("role", "candidate");
    const { data: allCandidates } = await candidateQuery;
    const candidateIds = (allCandidates || []).map((c: any) => c.id);

    if (candidateIds.length === 0) {
      res.json({ candidates: [] });
      return;
    }

    const { data: profiles } = await db
      .from("candidate_profiles")
      .select("user_id, cgpa, branch, college_id")
      .in("user_id", candidateIds);

    const attemptQuery = db
      .from("attempts")
      .select("id, candidate_id, score, status, exams:exam_id(total_marks)")
      .eq("recruiter_id", recruiterId)
      .eq("status", "completed")
      .in("candidate_id", candidateIds);

    const { data: attempts } = await attemptQuery;
    const attemptIds = (attempts || []).map((a: any) => a.id);

    const [{ data: codingSubs }, { data: interviews }, { data: proctoringEvents }] = await Promise.all([
      db.from("coding_submissions").select("attempt_id, score, coding_questions:coding_question_id(marks)").in("attempt_id", attemptIds.length ? attemptIds : ["00000000-0000-0000-0000-000000000000"]),
      db.from("ai_interviews").select("candidate_id, score, selected").in("candidate_id", candidateIds).eq("status", "completed"),
      db.from("proctoring_snapshots").select("candidate_id, event_type").in("attempt_id", attemptIds.length ? attemptIds : ["00000000-0000-0000-0000-000000000000"]).eq("event_type", "violation"),
    ]);

    const candidates = (allCandidates || []).map((candidate: any) => {
      const profile = (profiles || []).find((p: any) => p.user_id === candidate.id);
      const candidateAttempts = (attempts || []).filter((a: any) => a.candidate_id === candidate.id);
      const candidateAttemptIds = candidateAttempts.map((a: any) => a.id);
      const candidateCoding = (codingSubs || []).filter((c: any) => candidateAttemptIds.includes(c.attempt_id));
      const candidateInterviews = (interviews || []).filter((i: any) => i.candidate_id === candidate.id);
      const candidateViolations = (proctoringEvents || []).filter((e: any) => e.candidate_id === candidate.id).length;

      const examPercentages = candidateAttempts.map((a: any) => {
        const exam = Array.isArray(a.exams) ? a.exams[0] : a.exams;
        return exam?.total_marks ? ((a.score || 0) / exam.total_marks) * 100 : 0;
      });
      const examAvg = examPercentages.length ? examPercentages.reduce((s: number, p: number) => s + p, 0) / examPercentages.length : 0;

      const codingPercentages = candidateCoding.map((c: any) => {
        const q = Array.isArray(c.coding_questions) ? c.coding_questions[0] : c.coding_questions;
        return q?.marks ? ((c.score || 0) / q.marks) * 100 : 0;
      });
      const codingScore = codingPercentages.length ? codingPercentages.reduce((s: number, p: number) => s + p, 0) / codingPercentages.length : examAvg;

      const interviewScores = candidateInterviews.map((i: any) => i.score || 0);
      const interviewScore = interviewScores.length ? interviewScores.reduce((s: number, v: number) => s + v, 0) / interviewScores.length : 0;

      const cgpa = Number(profile?.cgpa || 0);
      const cgpaScore = cgpa > 0 ? (cgpa / 10) * 100 : 0;

      const proctoringCleanScore = Math.max(0, 100 - candidateViolations * 10);

      const compositeScore = Math.round(
        (examAvg * 0.30) + (codingScore * 0.25) + (cgpaScore * 0.15) + (interviewScore * 0.20) + (proctoringCleanScore * 0.10)
      );

      return {
        candidateId: candidate.id,
        name: candidate.name,
        email: candidate.email,
        branch: profile?.branch || "",
        cgpa,
        compositeScore,
        examAvg: Math.round(examAvg),
        codingScore: Math.round(codingScore),
        interviewScore: Math.round(interviewScore),
        proctoringCleanScore: Math.round(proctoringCleanScore),
        violations: candidateViolations,
      };
    });

    candidates.sort((a: any, b: any) => b.compositeScore - a.compositeScore);

    const total = candidates.length;
    const ranked = candidates.map((c: any, i: number) => ({
      ...c,
      rank: i + 1,
      tier: i < total * 0.2 ? "top" : i < total * 0.5 ? "middle" : "bottom",
    }));

    res.json({ candidates: ranked, total });
  } catch (err) {
    console.error("Predictive shortlist error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

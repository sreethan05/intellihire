import { Router } from "express";
import { db } from "../lib/postgres.js";
import { authMiddleware, roleMiddleware, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(roleMiddleware(["candidate"]));

// ─── 1. Topic Mastery Radar ─────────────────────────────────────────────────
router.get("/topic-mastery", async (req: AuthRequest, res) => {
  try {
    const candidateId = req.user!.id;

    const { data: attempts } = await db
      .from("attempts")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("status", "completed");

    const attemptIds = (attempts || []).map((a: any) => a.id);
    if (attemptIds.length === 0) {
      res.json({ topics: [], strongest: null, weakest: null, peerAverage: [] });
      return;
    }

    const { data: answers } = await db
      .from("answers")
      .select("id, question_id, is_correct, marks_obtained, attempts:attempt_id(candidate_id)")
      .in("attempt_id", attemptIds);

    const { data: questions } = await db
      .from("questions")
      .select("id, topic_tags, question_text")
      .in("id", (answers || []).map((a: any) => a.question_id));

    const topicMap = new Map<string, { total: number; correct: number; marks: number }>();
    (answers || []).forEach((a: any) => {
      const q = (questions || []).find((q: any) => q.id === a.question_id);
      const tags = Array.isArray(q?.topic_tags) ? q.topic_tags : [];
      if (tags.length === 0) {
        tags.push("General");
      }
      tags.forEach((tag: string) => {
        const current = topicMap.get(tag) || { total: 0, correct: 0, marks: 0 };
        current.total += 1;
        if (a.is_correct) current.correct += 1;
        current.marks += Number(a.marks_obtained || 0);
        topicMap.set(tag, current);
      });
    });

    const topics = Array.from(topicMap.entries()).map(([topic, stats]) => ({
      topic,
      accuracy: stats.total ? Math.round((stats.correct / stats.total) * 100) : 0,
      total: stats.total,
      correct: stats.correct,
      avgMarks: Number((stats.marks / stats.total).toFixed(1)),
    }));

    topics.sort((a, b) => b.accuracy - a.accuracy);

    // Peer average: global accuracy per topic
    const { data: allAnswers } = await db
      .from("answers")
      .select("is_correct, question_id, attempts:attempt_id(status)")
      .in("question_id", (questions || []).map((q: any) => q.id));

    const peerTopicMap = new Map<string, { total: number; correct: number }>();
    (allAnswers || []).forEach((a: any) => {
      if (a.attempts?.status !== "completed") return;
      const q = (questions || []).find((q: any) => q.id === a.question_id);
      const tags = Array.isArray(q?.topic_tags) ? q.topic_tags : ["General"];
      tags.forEach((tag: string) => {
        const current = peerTopicMap.get(tag) || { total: 0, correct: 0 };
        current.total += 1;
        if (a.is_correct) current.correct += 1;
        peerTopicMap.set(tag, current);
      });
    });

    const peerAverage = Array.from(peerTopicMap.entries()).map(([topic, stats]) => ({
      topic,
      accuracy: stats.total ? Math.round((stats.correct / stats.total) * 100) : 0,
    }));

    res.json({
      topics,
      strongest: topics[0]?.topic || null,
      weakest: topics[topics.length - 1]?.topic || null,
      peerAverage,
    });
  } catch (err) {
    console.error("Topic mastery error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 2. Coding Performance Analytics ─────────────────────────────────────────
router.get("/coding-analytics", async (req: AuthRequest, res) => {
  try {
    const candidateId = req.user!.id;

    const { data: attempts } = await db
      .from("attempts")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("status", "completed");

    const attemptIds = (attempts || []).map((a: any) => a.id);
    if (attemptIds.length === 0) {
      res.json({ languages: [], difficulty: [], problemTypes: [], attemptsBeforeSuccess: [] });
      return;
    }

    const { data: submissions } = await db
      .from("coding_submissions")
      .select("*, coding_questions:coding_question_id(difficulty, topic_tags, marks)")
      .in("attempt_id", attemptIds);

    const subList = (submissions || []) as any[];

    // Language stats
    const langMap = new Map<string, { submissions: number; success: number; totalScore: number; count: number }>();
    subList.forEach((s) => {
      const lang = s.language || "unknown";
      const current = langMap.get(lang) || { submissions: 0, success: 0, totalScore: 0, count: 0 };
      current.submissions += 1;
      if ((s.score || 0) > 0) current.success += 1;
      current.totalScore += s.score || 0;
      current.count += 1;
      langMap.set(lang, current);
    });
    const languages = Array.from(langMap.entries()).map(([language, stats]) => ({
      language,
      submissions: stats.submissions,
      successRate: stats.count ? Math.round((stats.success / stats.count) * 100) : 0,
      avgScore: stats.count ? Number((stats.totalScore / stats.count).toFixed(1)) : 0,
    }));

    // Difficulty stats
    const diffMap = new Map<string, { total: number; success: number; totalScore: number }>();
    subList.forEach((s) => {
      const q = Array.isArray(s.coding_questions) ? s.coding_questions[0] : s.coding_questions;
      const diff = q?.difficulty || "unknown";
      const current = diffMap.get(diff) || { total: 0, success: 0, totalScore: 0 };
      current.total += 1;
      if ((s.score || 0) > 0) current.success += 1;
      current.totalScore += s.score || 0;
      diffMap.set(diff, current);
    });
    const difficulty = Array.from(diffMap.entries()).map(([level, stats]) => ({
      level,
      total: stats.total,
      successRate: stats.total ? Math.round((stats.success / stats.total) * 100) : 0,
      avgScore: stats.total ? Number((stats.totalScore / stats.total).toFixed(1)) : 0,
    }));

    // Problem type stats
    const typeMap = new Map<string, { total: number; success: number }>();
    subList.forEach((s) => {
      const q = Array.isArray(s.coding_questions) ? s.coding_questions[0] : s.coding_questions;
      const tags = Array.isArray(q?.topic_tags) ? q.topic_tags : ["General"];
      tags.forEach((tag: string) => {
        const current = typeMap.get(tag) || { total: 0, success: 0 };
        current.total += 1;
        if ((s.score || 0) > 0) current.success += 1;
        typeMap.set(tag, current);
      });
    });
    const problemTypes = Array.from(typeMap.entries()).map(([type, stats]) => ({
      type,
      total: stats.total,
      successRate: stats.total ? Math.round((stats.success / stats.total) * 100) : 0,
    }));

    res.json({ languages, difficulty, problemTypes });
  } catch (err) {
    console.error("Coding analytics error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 3. AI Interview Score Breakdown ─────────────────────────────────────────
router.get("/interview-analytics", async (req: AuthRequest, res) => {
  try {
    const candidateId = req.user!.id;

    const { data: interviews } = await db
      .from("ai_interviews")
      .select("*, job:job_id(title, company_name), exam:exam_id(title)")
      .eq("candidate_id", candidateId)
      .eq("status", "completed")
      .order("submitted_at", { ascending: false });

    const interviewList = (interviews || []) as any[];

    const breakdown = interviewList.map((i) => ({
      id: i.id,
      jobTitle: i.job?.title || i.exam?.title || "Interview",
      companyName: i.job?.company_name || "",
      submittedAt: i.submitted_at,
      overallScore: i.score || 0,
      dimensions: {
        relevance: i.relevance_score || 0,
        communication: i.communication_score || 0,
        intro: i.intro_score || 0,
        speaking: i.speaking_score || 0,
        pronunciation: i.pronunciation_score || 0,
        technical: i.technical_score || 0,
      },
      selected: i.selected || false,
      summary: i.summary || "",
      feedback: i.feedback || "",
    }));

    const averages = breakdown.length
      ? {
          relevance: Math.round(breakdown.reduce((s, b) => s + b.dimensions.relevance, 0) / breakdown.length),
          communication: Math.round(breakdown.reduce((s, b) => s + b.dimensions.communication, 0) / breakdown.length),
          intro: Math.round(breakdown.reduce((s, b) => s + b.dimensions.intro, 0) / breakdown.length),
          speaking: Math.round(breakdown.reduce((s, b) => s + b.dimensions.speaking, 0) / breakdown.length),
          pronunciation: Math.round(breakdown.reduce((s, b) => s + b.dimensions.pronunciation, 0) / breakdown.length),
          technical: Math.round(breakdown.reduce((s, b) => s + b.dimensions.technical, 0) / breakdown.length),
        }
      : { relevance: 0, communication: 0, intro: 0, speaking: 0, pronunciation: 0, technical: 0 };

    res.json({ interviews: breakdown, averages, count: breakdown.length });
  } catch (err) {
    console.error("Interview analytics error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 4. Job Pipeline Tracker ─────────────────────────────────────────────────
router.get("/job-pipeline", async (req: AuthRequest, res) => {
  try {
    const candidateId = req.user!.id;

    const { data: statuses } = await db
      .from("candidate_status")
      .select("*, job:job_id(title, company_name, drive_date)")
      .eq("candidate_id", candidateId)
      .order("updated_at", { ascending: false });

    const pipeline = (statuses || []).map((s: any) => {
      const job = Array.isArray(s.job) ? s.job[0] : s.job;
      return {
        jobId: s.job_id,
        jobTitle: job?.title || "Unknown",
        companyName: job?.company_name || "Unknown",
        status: s.status,
        updatedAt: s.updated_at,
        recruiterNotes: s.recruiter_notes || "",
      };
    });

    const stages = ["registered", "exam_taken", "passed", "shortlisted", "on_hold", "offered", "rejected"];

    res.json({ pipeline, stages });
  } catch (err) {
    console.error("Job pipeline error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 5. Study Streak & Heatmap ─────────────────────────────────────────────
router.get("/streak", async (req: AuthRequest, res) => {
  try {
    const candidateId = req.user!.id;

    const { data: attempts } = await db
      .from("attempts")
      .select("started_at, submitted_at, status")
      .eq("candidate_id", candidateId)
      .eq("status", "completed");

    const { data: codingSubs } = await db
      .from("coding_submissions")
      .select("created_at, attempts:attempt_id(candidate_id)")
      .eq("attempts.candidate_id", candidateId);

    const dates = new Set<string>();
    (attempts || []).forEach((a: any) => {
      if (a.started_at) dates.add(a.started_at.split("T")[0]);
      if (a.submitted_at) dates.add(a.submitted_at.split("T")[0]);
    });
    (codingSubs || []).forEach((c: any) => {
      if (c.created_at) dates.add(c.created_at.split("T")[0]);
    });

    const sortedDates = Array.from(dates).sort();

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let prevDate: Date | null = null;

    sortedDates.forEach((dateStr) => {
      const d = new Date(dateStr);
      if (prevDate) {
        const diff = (d.getTime() - prevDate.getTime()) / 86400000;
        if (diff === 1) {
          tempStreak += 1;
        } else {
          tempStreak = 1;
        }
      } else {
        tempStreak = 1;
      }
      prevDate = d;
      longestStreak = Math.max(longestStreak, tempStreak);
    });

    // Current streak from today backwards
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];
    if (dates.has(todayStr)) {
      currentStreak = 1;
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - 1);
      while (dates.has(checkDate.toISOString().split("T")[0])) {
        currentStreak += 1;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    } else {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (dates.has(yesterday.toISOString().split("T")[0])) {
        currentStreak = 1;
        const checkDate = new Date(yesterday);
        checkDate.setDate(checkDate.getDate() - 1);
        while (dates.has(checkDate.toISOString().split("T")[0])) {
          currentStreak += 1;
          checkDate.setDate(checkDate.getDate() - 1);
        }
      }
    }

    // Build 12-week heatmap
    const heatmap: Array<{ date: string; count: number; week: number; day: number }> = [];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let i = 83; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const week = Math.floor((83 - i) / 7);
      const day = d.getDay();
      heatmap.push({ date: dateStr, count: dates.has(dateStr) ? 1 : 0, week, day });
    }

    res.json({ currentStreak, longestStreak, heatmap, dayNames });
  } catch (err) {
    console.error("Streak error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 6. Predicted Readiness Score ────────────────────────────────────────────
router.get("/readiness-score", async (req: AuthRequest, res) => {
  try {
    const candidateId = req.user!.id;

    const { data: attempts } = await db
      .from("attempts")
      .select("id, exam_id, score, status, exams:exam_id(total_marks)")
      .eq("candidate_id", candidateId)
      .eq("status", "completed");

    const attemptIds = (attempts || []).map((a: any) => a.id);

    const { data: codingSubs } = await db
      .from("coding_submissions")
      .select("score, coding_questions:coding_question_id(marks)")
      .in("attempt_id", attemptIds.length ? attemptIds : ["00000000-0000-0000-0000-000000000000"]);

    const { data: interviews } = await db
      .from("ai_interviews")
      .select("score")
      .eq("candidate_id", candidateId)
      .eq("status", "completed");

    const { data: allExams } = await db.from("exams").select("id");
    const totalExams = (allExams || []).length;

    const examPercentages = (attempts || []).map((a: any) => {
      const exam = Array.isArray(a.exams) ? a.exams[0] : a.exams;
      return exam?.total_marks ? ((a.score || 0) / exam.total_marks) * 100 : 0;
    });
    const examAvg = examPercentages.length
      ? examPercentages.reduce((s: number, p: number) => s + p, 0) / examPercentages.length
      : 0;

    const codingPercentages = (codingSubs || []).map((c: any) => {
      const q = Array.isArray(c.coding_questions) ? c.coding_questions[0] : c.coding_questions;
      return q?.marks ? ((c.score || 0) / q.marks) * 100 : 0;
    });
    const codingScore = codingPercentages.length
      ? codingPercentages.reduce((s: number, p: number) => s + p, 0) / codingPercentages.length
      : examAvg;

    const interviewScores = (interviews || []).map((i: any) => i.score || 0);
    const interviewScore = interviewScores.length
      ? interviewScores.reduce((s: number, v: number) => s + v, 0) / interviewScores.length
      : 0;

    let consistency = 100;
    if (examPercentages.length > 1) {
      const mean = examAvg;
      const variance = examPercentages.reduce((sum: number, p: number) => sum + Math.pow(p - mean, 2), 0) / examPercentages.length;
      const stdDev = Math.sqrt(variance);
      consistency = Math.max(0, 100 - stdDev);
    } else if (examPercentages.length === 0) {
      consistency = 0;
    }

    const uniqueExams = new Set((attempts || []).map((a: any) => a.exam_id)).size;
    const breadth = totalExams ? Math.min(100, (uniqueExams / totalExams) * 100) : Math.min(100, uniqueExams * 10);

    const readinessScore = Math.round(
      (examAvg * 0.40) + (codingScore * 0.25) + (interviewScore * 0.20) + (consistency * 0.10) + (breadth * 0.05)
    );

    const zone = readinessScore >= 75 ? "ready" : readinessScore >= 50 ? "approaching" : "needs_work";

    res.json({
      readinessScore,
      zone,
      components: {
        exam: Math.round(examAvg),
        coding: Math.round(codingScore),
        interview: Math.round(interviewScore),
        consistency: Math.round(consistency),
        breadth: Math.round(breadth),
      },
    });
  } catch (err) {
    console.error("Readiness score error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 7. Proctoring Self-Review ───────────────────────────────────────────────
router.get("/proctoring-summary", async (req: AuthRequest, res) => {
  try {
    const candidateId = req.user!.id;

    const { data: attempts } = await db
      .from("attempts")
      .select("id")
      .eq("candidate_id", candidateId);

    const attemptIds = (attempts || []).map((a: any) => a.id);
    if (attemptIds.length === 0) {
      res.json({ totalViolations: 0, byType: [], recentExams: [] });
      return;
    }

    const { data: events } = await db
      .from("proctoring_snapshots")
      .select("event_type, message, violation_count, captured_at, exams:exam_id(title)")
      .in("attempt_id", attemptIds)
      .eq("event_type", "violation")
      .order("captured_at", { ascending: false });

    const violations = (events || []) as any[];

    const typeMap = new Map<string, number>();
    violations.forEach((v) => {
      const msg = (v.message || "").toLowerCase();
      let type = "other";
      if (msg.includes("tab")) type = "tab_switch";
      else if (msg.includes("face")) type = "face_missing";
      else if (msg.includes("camera")) type = "camera_offline";
      else if (msg.includes("phone")) type = "phone_detected";
      else if (msg.includes("looking")) type = "looking_away";
      typeMap.set(type, (typeMap.get(type) || 0) + 1);
    });

    const byType = Array.from(typeMap.entries()).map(([type, count]) => ({ type, count }));

    const recentExams = violations.slice(0, 5).map((v) => ({
      examTitle: Array.isArray(v.exams) ? v.exams[0]?.title : v.exams?.title || "Unknown",
      message: v.message || "",
      capturedAt: v.captured_at,
      violationCount: v.violation_count || 1,
    }));

    res.json({ totalViolations: violations.length, byType, recentExams });
  } catch (err) {
    console.error("Proctoring summary error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── 8. Peer Comparison ──────────────────────────────────────────────────────
router.get("/peer-comparison", async (req: AuthRequest, res) => {
  try {
    const candidateId = req.user!.id;

    const { data: myAttempts } = await db
      .from("attempts")
      .select("id, exam_id, score, exams:exam_id(total_marks)")
      .eq("candidate_id", candidateId)
      .eq("status", "completed");

    const myAttemptIds = (myAttempts || []).map((a: any) => a.id);

    const { data: myAnswers } = await db
      .from("answers")
      .select("question_id, is_correct")
      .in("attempt_id", myAttemptIds.length ? myAttemptIds : ["00000000-0000-0000-0000-000000000000"]);

    const { data: allAnswers } = await db
      .from("answers")
      .select("question_id, is_correct, attempt_id, attempts:attempt_id(candidate_id, status)")
      .eq("attempts.status", "completed");

    const { data: questions } = await db
      .from("questions")
      .select("id, topic_tags")
      .in("id", (allAnswers || []).map((a: any) => a.question_id));

    const topicAccuracies = new Map<string, { myCorrect: number; myTotal: number; peerCorrect: number; peerTotal: number }>();

    (allAnswers || []).forEach((a: any) => {
      const q = (questions || []).find((q: any) => q.id === a.question_id);
      const tags = Array.isArray(q?.topic_tags) ? q.topic_tags : ["General"];
      tags.forEach((tag: string) => {
        const current = topicAccuracies.get(tag) || { myCorrect: 0, myTotal: 0, peerCorrect: 0, peerTotal: 0 };
        current.peerTotal += 1;
        if (a.is_correct) current.peerCorrect += 1;

        if (a.attempts?.candidate_id === candidateId) {
          current.myTotal += 1;
          if (a.is_correct) current.myCorrect += 1;
        }
        topicAccuracies.set(tag, current);
      });
    });

    const comparisons = Array.from(topicAccuracies.entries()).map(([topic, stats]) => {
      const myAccuracy = stats.myTotal ? (stats.myCorrect / stats.myTotal) * 100 : 0;
      const peerAccuracy = stats.peerTotal ? (stats.peerCorrect / stats.peerTotal) * 100 : 0;
      const percentile = peerAccuracy > 0 ? Math.round((myAccuracy / peerAccuracy) * 100) : 0;
      return {
        topic,
        myAccuracy: Math.round(myAccuracy),
        peerAccuracy: Math.round(peerAccuracy),
        percentile: Math.min(100, percentile),
      };
    });

    // Overall percentile
    const myTotalCorrect = (myAnswers || []).filter((a: any) => a.is_correct).length;
    const myTotal = (myAnswers || []).length;
    const myOverallAccuracy = myTotal ? (myTotalCorrect / myTotal) * 100 : 0;

    const allPeerAnswers = (allAnswers || []).filter((a: any) => a.attempts?.candidate_id !== candidateId);
    const peerOverallCorrect = allPeerAnswers.filter((a: any) => a.is_correct).length;
    const peerOverallTotal = allPeerAnswers.length;
    const peerOverallAccuracy = peerOverallTotal ? (peerOverallCorrect / peerOverallTotal) * 100 : 0;
    const overallPercentile = peerOverallAccuracy > 0 ? Math.round((myOverallAccuracy / peerOverallAccuracy) * 100) : 0;

    res.json({
      comparisons,
      overall: {
        myAccuracy: Math.round(myOverallAccuracy),
        peerAccuracy: Math.round(peerOverallAccuracy),
        percentile: Math.min(100, overallPercentile),
      },
    });
  } catch (err) {
    console.error("Peer comparison error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

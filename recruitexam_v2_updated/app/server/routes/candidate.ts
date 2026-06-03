import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase";
import { authMiddleware, roleMiddleware, type AuthRequest } from "../middleware/auth";
import { getPasswordValidationError } from "../lib/validation";
 
const router = Router();
 
router.use(authMiddleware);
router.use(roleMiddleware(["candidate"]));

const formatDate = (date?: string | null) => date ? new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

const monthsBack = (count: number) => {
  const now = new Date();
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("en-US", { month: "short" }),
    };
  });
};

router.get("/profile", async (req: AuthRequest, res) => {
  try {
    const [{ data: user }, { data: profile }] = await Promise.all([
      supabase
        .from("users")
        .select("id, name, email, roll_number, college_id, profile_complete, must_change_password")
        .eq("id", req.user!.id)
        .single(),
      supabase
        .from("candidate_profiles")
        .select("*, college:college_id(id, name, code)")
        .eq("user_id", req.user!.id)
        .maybeSingle(),
    ]);

    res.json({ user, profile });
  } catch (err) {
    console.error("Candidate profile error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/onboarding", async (req: AuthRequest, res) => {
  try {
    const { password, phone, skills, domain_preference, marksheet_url, resume_url } = req.body;
    if (!password || !phone || !Array.isArray(skills) || skills.length === 0 || !domain_preference) {
      res.status(400).json({ error: "Password, phone, skills, and domain preference are required" });
      return;
    }
    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    const password_hash = await bcrypt.hash(password, 10);
    const [{ error: userError }, { data: profile, error: profileError }] = await Promise.all([
      supabase
        .from("users")
        .update({ password_hash, must_change_password: false, profile_complete: true })
        .eq("id", req.user!.id),
      supabase
        .from("candidate_profiles")
        .update({
          phone,
          skills,
          domain_preference,
          marksheet_url: marksheet_url || null,
          resume_url: resume_url || null,
          profile_complete: true,
        })
        .eq("user_id", req.user!.id)
        .select()
        .single(),
    ]);

    if (userError || profileError) {
      res.status(400).json({ error: userError?.message || profileError?.message });
      return;
    }

    res.json({ message: "Onboarding complete", profile });
  } catch (err) {
    console.error("Candidate onboarding error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
 
router.get("/dashboard", async (req: AuthRequest, res) => {
  try {
    const candidateId = req.user!.id;
 
    const { data: assignments, error } = await supabase
      .from("exam_assignments")
      .select("*, exam:exam_id(id, title, description, duration, total_marks, pass_marks, available_from, available_until, status, shuffle_questions, negative_marking, created_at)")
      .eq("candidate_id", candidateId);
 
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
 
    const examIds = (assignments || []).map((assignment: { exam_id: string }) => assignment.exam_id);
    const { data: attempts } = examIds.length
      ? await supabase
          .from("attempts")
          .select("id, exam_id, status, score, started_at, submitted_at")
          .eq("candidate_id", candidateId)
          .order("started_at", { ascending: false })
          .in("exam_id", examIds)
      : { data: [] as Array<{ id: string; exam_id: string; status: string; score: number | null; started_at: string; submitted_at: string | null }> };
 
    const enriched = (assignments || []).map((assignment: {
      id: string;
      exam_id: string;
      candidate_id: string;
      assigned_by: string;
      assigned_at: string;
      exam: {
        id: string;
        title: string;
        description: string | null;
        duration: number;
        total_marks: number;
        pass_marks: number;
        available_from?: string | null;
        available_until?: string | null;
      };
    }) => ({
      ...assignment,
      attempts: (attempts || []).filter((attempt) => attempt.exam_id === assignment.exam_id),
    }));

    const latestAttempts = enriched
      .map((assignment) => assignment.attempts?.[0])
      .filter(Boolean);

    const completedAttempts = enriched.filter((assignment) => assignment.attempts?.[0]?.status === "completed");
    const inProgressAttempts = enriched.filter((assignment) => assignment.attempts?.[0]?.status === "in_progress");
    const pendingAssignments = enriched.filter((assignment) => !assignment.attempts?.[0]);

    const performance = completedAttempts.map((assignment) => {
      const latestAttempt = assignment.attempts![0];
      const score = latestAttempt.score ?? 0;
      const totalMarks = assignment.exam.total_marks;
      const passMarks = assignment.exam.pass_marks;

      return {
        examId: assignment.exam_id,
        title: assignment.exam.title,
        score,
        totalMarks,
        passMarks,
        percentage: totalMarks ? Number(((score / totalMarks) * 100).toFixed(1)) : 0,
        submittedAt: latestAttempt.submitted_at,
        status: score >= passMarks ? "pass" : "fail",
      };
    });

    const averageScore = performance.length
      ? Number((performance.reduce((sum, item) => sum + item.score, 0) / performance.length).toFixed(1))
      : 0;

    const bestScore = performance.length
      ? Math.max(...performance.map((item) => item.score))
      : 0;

    const passCount = performance.filter((item) => item.status === "pass").length;

    const completionRate = enriched.length
      ? Number(((completedAttempts.length / enriched.length) * 100).toFixed(1))
      : 0;

    const averagePercentage = performance.length
      ? Number((performance.reduce((sum, item) => sum + item.percentage, 0) / performance.length).toFixed(1))
      : 0;

    const scoreBands = [
      { label: "90-100", min: 90, max: 101 },
      { label: "75-89", min: 75, max: 90 },
      { label: "60-74", min: 60, max: 75 },
      { label: "Below 60", min: 0, max: 60 },
    ].map((band) => ({
      label: band.label,
      exams: performance.filter((item) => item.percentage >= band.min && item.percentage < band.max).length,
    }));

    const examInsights = performance
      .slice()
      .sort((left, right) => right.percentage - left.percentage)
      .map((item) => ({
        label: item.title,
        score: item.percentage,
        status: item.status,
      }));

    const now = Date.now();
    const upcomingExams = pendingAssignments
      .map((assignment) => {
        const availableFrom = assignment.exam.available_from || assignment.assigned_at;
        const opensAt = new Date(availableFrom).getTime();
        const daysLeft = Math.max(0, Math.ceil((opensAt - now) / 86400000));
        const meta = opensAt > now ? `${daysLeft || 1} Day${daysLeft === 1 ? "" : "s"} Left` : "Open Now";

        return {
          id: assignment.id,
          examId: assignment.exam_id,
          title: assignment.exam.title,
          subtitle: `${formatDate(availableFrom)} - ${assignment.exam.duration} min`,
          meta,
          tone: opensAt > now ? "violet" : "green",
          date: availableFrom,
        };
      })
      .sort((left, right) => new Date(left.date || "").getTime() - new Date(right.date || "").getTime())
      .slice(0, 5);

    const recentResults = performance
      .slice()
      .sort((left, right) => new Date(right.submittedAt || "").getTime() - new Date(left.submittedAt || "").getTime())
      .slice(0, 5)
      .map((item) => ({
        id: item.examId,
        examId: item.examId,
        title: item.title,
        subtitle: formatDate(item.submittedAt),
        meta: `${item.percentage}%`,
        tone: item.status === "pass" ? "green" : "rose",
        score: item.score,
        percentage: item.percentage,
        status: item.status,
        date: item.submittedAt,
      }));

    const trendMonths = monthsBack(6);
    const performanceTrend = trendMonths.map((month) => {
      const monthItems = performance.filter((item) => item.submittedAt?.startsWith(month.key));
      return {
        month: month.label,
        score: monthItems.length
          ? Number((monthItems.reduce((sum, item) => sum + item.percentage, 0) / monthItems.length).toFixed(1))
          : 0,
      };
    });

    const notifications = [
      ...recentResults.slice(0, 3).map((item) => ({
        id: `result-${item.examId}`,
        title: `Your result for ${item.title} has been published.`,
        subtitle: item.subtitle,
        tone: item.status === "pass" ? "green" : "rose",
        date: item.date,
      })),
      ...upcomingExams.slice(0, 3).map((item) => ({
        id: `exam-${item.examId}`,
        title: `New exam scheduled: ${item.title}.`,
        subtitle: item.subtitle,
        tone: "blue",
        date: item.date,
      })),
    ]
      .sort((left, right) => new Date(right.date || "").getTime() - new Date(left.date || "").getTime())
      .slice(0, 4);

    const { data: leaderboardAttempts } = examIds.length
      ? await supabase
          .from("attempts")
          .select("candidate_id, score, status, submitted_at, users:candidate_id(id, name, email), exams:exam_id(total_marks)")
          .eq("status", "completed")
          .in("exam_id", examIds)
      : { data: [] as any[] };

    const leaderboardMap = new Map<string, { candidateId: string; name: string; email: string; attempts: number; totalPercentage: number }>();
    (leaderboardAttempts || []).forEach((attempt: any) => {
      const candidate = Array.isArray(attempt.users) ? attempt.users[0] : attempt.users;
      const exam = Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams;
      const candidateKey = attempt.candidate_id;
      const current = leaderboardMap.get(candidateKey) || {
        candidateId: candidateKey,
        name: candidate?.name || "Candidate",
        email: candidate?.email || "",
        attempts: 0,
        totalPercentage: 0,
      };
      const totalMarks = exam?.total_marks || 0;
      current.attempts += 1;
      current.totalPercentage += totalMarks ? ((attempt.score || 0) / totalMarks) * 100 : 0;
      leaderboardMap.set(candidateKey, current);
    });

    const leaderboard = Array.from(leaderboardMap.values())
      .map((item) => ({
        candidateId: item.candidateId,
        name: item.name,
        email: item.email,
        attempts: item.attempts,
        completedAttempts: item.attempts,
        averageScore: Number((item.totalPercentage / Math.max(1, item.attempts)).toFixed(1)),
        averagePercentage: Number((item.totalPercentage / Math.max(1, item.attempts)).toFixed(1)),
      }))
      .sort((left, right) => right.averagePercentage - left.averagePercentage);

    const candidateRankIndex = leaderboard.findIndex((item) => item.candidateId === candidateId);
 
    res.json({
      assignments: enriched,
      stats: {
        assigned: enriched.length,
        completed: completedAttempts.length,
        inProgress: inProgressAttempts.length,
        pending: pendingAssignments.length,
        averageScore,
        bestScore,
        passCount,
        completionRate,
        averagePercentage,
        rank: candidateRankIndex >= 0 ? candidateRankIndex + 1 : leaderboard.length || 0,
        totalRanked: leaderboard.length,
      },
      performance,
      latestAttempts,
      upcomingExams,
      recentResults,
      performanceTrend,
      scoreBands,
      examInsights,
      notifications,
      leaderboard: leaderboard.slice(0, 10),
    });
  } catch (err) {
    console.error("Candidate dashboard error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
 
router.get("/exams", async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabase
      .from("exam_assignments")
      .select("*, exam:exam_id(*)")
      .eq("candidate_id", req.user!.id);
 
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
 
    res.json({ exams: data || [] });
  } catch (err) {
    console.error("Candidate exams error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
 
router.get("/exam/:examId", async (req: AuthRequest, res) => {
  try {
    const { examId } = req.params;
    const candidateId = req.user!.id;
 
    const { data: assignment, error: assignErr } = await supabase
      .from("exam_assignments")
      .select("*")
      .eq("exam_id", examId)
      .eq("candidate_id", candidateId)
      .single();
 
    if (assignErr || !assignment) {
      res.status(403).json({ error: "Exam not assigned" });
      return;
    }
 
    const { data: exam, error: examErr } = await supabase
      .from("exams")
      .select("*")
      .eq("id", examId)
      .single();
 
    if (examErr || !exam) {
      res.status(404).json({ error: "Exam not found" });
      return;
    }
 
    const { data: mcqQuestions } = await supabase
      .from("exam_questions")
      .select("*, questions:question_id(*)")
      .eq("exam_id", examId);
 
    const { data: codingQuestions } = await supabase
      .from("exam_coding_questions")
      .select("*, coding_questions:coding_question_id(*)")
      .eq("exam_id", examId);
 
    res.json({
      exam,
      mcqQuestions: mcqQuestions?.map((q: any) => ({
        id: q.id,
        question_id: q.question_id,
        marks: q.marks,
        question: q.questions,
      })) || [],
      codingQuestions: codingQuestions?.map((q: any) => ({
        id: q.id,
        coding_question_id: q.coding_question_id,
        marks: q.marks,
        question: q.coding_questions,
      })) || [],
    });
  } catch (err) {
    console.error("Fetch exam error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
 
export default router;

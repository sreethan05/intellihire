import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase";
import { authMiddleware, roleMiddleware, type AuthRequest } from "../middleware/auth";
import { getPasswordValidationError, isValidEmail } from "../lib/validation";

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(["admin"]));

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

router.post("/create-recruiter", async (req: AuthRequest, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "Name, email, and password required" });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ error: "Enter a valid recruiter email address" });
      return;
    }
    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    const password_hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from("users")
      .insert({
        name,
        email,
        password_hash,
        role: "recruiter",
        created_by: req.user!.id,
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ message: "Recruiter created", recruiter: data });
  } catch (err) {
    console.error("Create recruiter error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/create-tpo", async (req: AuthRequest, res) => {
  try {
    const { name, email, password, college_name, college_code, location } = req.body;
    if (!name || !email || !password || !college_name || !college_code) {
      res.status(400).json({ error: "Name, email, password, college name, and college code required" });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ error: "Enter a valid TPO email address" });
      return;
    }
    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    const { data: college, error: collegeError } = await supabase
      .from("colleges")
      .upsert({
        name: college_name,
        code: String(college_code).toUpperCase(),
        location: location || null,
        created_by: req.user!.id,
      }, { onConflict: "code" })
      .select()
      .single();

    if (collegeError || !college) {
      res.status(400).json({ error: collegeError?.message || "College could not be created" });
      return;
    }

    const password_hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from("users")
      .insert({
        name,
        email,
        password_hash,
        role: "tpo",
        college_id: college.id,
        profile_complete: true,
        created_by: req.user!.id,
      })
      .select("id, name, email, role, college_id, created_at")
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ message: "TPO and college created", tpo: data, college });
  } catch (err) {
    console.error("Create TPO error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/recruiters", async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, created_at")
      .eq("role", "recruiter")
      .eq("created_by", req.user!.id);

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ recruiters: data || [] });
  } catch (err) {
    console.error("Fetch recruiters error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/tpos", async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, created_at, college:college_id(id, name, code)")
      .eq("role", "tpo")
      .eq("created_by", req.user!.id);

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ tpos: data || [] });
  } catch (err) {
    console.error("Fetch TPOs error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/dashboard", async (req: AuthRequest, res) => {
  try {
    const adminId = req.user!.id;

    const { count: recruiterCount } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "recruiter")
      .eq("created_by", adminId);

    const { count: candidateCount } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "candidate");

    const [
      { data: recruiters },
      { data: tpos },
      { data: colleges },
      { data: candidates },
      { data: profiles },
      { data: drives },
      { data: exams },
      { data: attempts },
    ] = await Promise.all([
      supabase
        .from("users")
        .select("id, name, email, created_at")
        .eq("role", "recruiter")
        .eq("created_by", adminId),
      supabase
        .from("users")
        .select("id, name, email, college_id, created_at")
        .eq("role", "tpo"),
      supabase
        .from("colleges")
        .select("id, name, code"),
      supabase
        .from("users")
        .select("id, created_by")
        .eq("role", "candidate"),
      supabase
        .from("candidate_profiles")
        .select("id, college_id, branch, cgpa, profile_complete, documents_verified, colleges:college_id(name, code)"),
      supabase
        .from("jobs")
        .select("id, title, company_name, college_id, status, drive_date, exam_id"),
      supabase
        .from("exams")
        .select("id, title, created_by, total_marks, pass_marks, created_at, available_from, available_until"),
      supabase
        .from("attempts")
        .select("id, recruiter_id, candidate_id, exam_id, status, score, started_at, submitted_at, users:candidate_id(name, email), exams:exam_id(title, total_marks, pass_marks)")
        .order("started_at", { ascending: false }),
    ]);

    const recruiterList = recruiters || [];
    const tpoList = tpos || [];
    const collegeList = colleges || [];
    const candidateList = candidates || [];
    const profileList = profiles || [];
    const driveList = drives || [];
    const examList = exams || [];
    const attemptList = attempts || [];
    const completedAttempts = attemptList.filter((attempt) => attempt.status === "completed");
    const inProgressAttempts = attemptList.filter((attempt) => attempt.status === "in_progress");
    const passedAttempts = completedAttempts.filter((attempt) => {
      const attemptExam = Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams;
      const passMarks = attemptExam?.pass_marks ?? 0;
      return (attempt.score ?? 0) >= passMarks;
    });

    const safeAverageScore = completedAttempts.length
      ? Number(
          (
            completedAttempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) /
            completedAttempts.length
          ).toFixed(1)
        )
      : 0;

    const completionRate = attemptList.length
      ? Number(((completedAttempts.length / attemptList.length) * 100).toFixed(1))
      : 0;

    const passRate = completedAttempts.length
      ? Number(((passedAttempts.length / completedAttempts.length) * 100).toFixed(1))
      : 0;

    const recruiterSnapshots = recruiterList.map((recruiter) => {
      const recruiterCandidates = candidateList.filter((candidate) => candidate.created_by === recruiter.id);
      const recruiterExams = examList.filter((exam) => exam.created_by === recruiter.id);
      const recruiterAttempts = attemptList.filter((attempt) => attempt.recruiter_id === recruiter.id);
      const recruiterCompleted = recruiterAttempts.filter((attempt) => attempt.status === "completed");

      return {
        ...recruiter,
        candidateCount: recruiterCandidates.length,
        examCount: recruiterExams.length,
        attemptCount: recruiterAttempts.length,
        completedCount: recruiterCompleted.length,
      };
    });

    const trendMonths = monthsBack(6);
    const examTrend = trendMonths.map((month) => ({
      month: month.label,
      created: examList.filter((exam) => exam.created_at?.startsWith(month.key)).length,
      conducted: completedAttempts.filter((attempt) => attempt.submitted_at?.startsWith(month.key)).length,
    }));

    const recentExams = examList
      .slice()
      .sort((left, right) => new Date(right.created_at || "").getTime() - new Date(left.created_at || "").getTime())
      .slice(0, 6)
      .map((exam) => {
        const examCompleted = completedAttempts.filter((attempt) => attempt.exam_id === exam.id).length;
        const examActive = inProgressAttempts.filter((attempt) => attempt.exam_id === exam.id).length;
        const status = examCompleted > 0 ? "Completed" : examActive > 0 ? "Live" : "Upcoming";
        return {
          id: exam.id,
          examId: exam.id,
          title: exam.title,
          subtitle: formatDate(exam.available_from || exam.created_at),
          meta: status,
          status,
          tone: status === "Completed" ? "green" : status === "Live" ? "amber" : "blue",
          date: exam.available_from || exam.created_at,
        };
      });

    const leaderboardMap = new Map<string, { candidateId: string; name: string; email: string; attempts: number; totalPercentage: number }>();
    completedAttempts.forEach((attempt: any) => {
      const candidate = Array.isArray(attempt.users) ? attempt.users[0] : attempt.users;
      const exam = Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams;
      const key = attempt.candidate_id;
      const current = leaderboardMap.get(key) || {
        candidateId: key,
        name: candidate?.name || "Candidate",
        email: candidate?.email || "",
        attempts: 0,
        totalPercentage: 0,
      };
      current.attempts += 1;
      current.totalPercentage += exam?.total_marks ? ((attempt.score || 0) / exam.total_marks) * 100 : 0;
      leaderboardMap.set(key, current);
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
      .sort((left, right) => right.averagePercentage - left.averagePercentage)
      .slice(0, 10);

    const resultSummary = {
      pass: passedAttempts.length,
      fail: Math.max(0, completedAttempts.length - passedAttempts.length),
      inProgress: inProgressAttempts.length,
    };

    const collegeAnalytics = collegeList.map((college) => {
      const collegeProfiles = profileList.filter((profile) => profile.college_id === college.id);
      const collegeDrives = driveList.filter((drive) => drive.college_id === college.id);
      return {
        collegeId: college.id,
        label: college.code || college.name,
        students: collegeProfiles.length,
        profileComplete: collegeProfiles.filter((profile) => profile.profile_complete).length,
        documentsVerified: collegeProfiles.filter((profile) => profile.documents_verified).length,
        drives: collegeDrives.length,
        averageCgpa: collegeProfiles.length
          ? Number((collegeProfiles.reduce((sum, profile) => sum + Number(profile.cgpa || 0), 0) / collegeProfiles.length).toFixed(2))
          : 0,
      };
    });

    const branchMap = new Map<string, { label: string; students: number; verified: number; averageCgpa: number }>();
    profileList.forEach((profile) => {
      const key = profile.branch || "Unknown";
      const current = branchMap.get(key) || { label: key, students: 0, verified: 0, averageCgpa: 0 };
      current.students += 1;
      current.verified += profile.documents_verified ? 1 : 0;
      current.averageCgpa += Number(profile.cgpa || 0);
      branchMap.set(key, current);
    });
    const branchAnalytics = Array.from(branchMap.values()).map((item) => ({
      ...item,
      averageCgpa: item.students ? Number((item.averageCgpa / item.students).toFixed(2)) : 0,
    }));

    res.json({
      stats: {
        recruiters: recruiterCount ?? 0,
        tpos: tpoList.length,
        colleges: collegeList.length,
        drives: driveList.length,
        candidates: candidateCount ?? 0,
        profileComplete: profileList.filter((profile) => profile.profile_complete).length,
        documentsVerified: profileList.filter((profile) => profile.documents_verified).length,
        exams: examList.length,
        attempts: attemptList.length,
        completedAttempts: completedAttempts.length,
        inProgressAttempts: inProgressAttempts.length,
        averageScore: safeAverageScore,
        completionRate,
        passRate,
      },
      roleDistribution: [
        { label: "Recruiters", value: recruiterCount ?? 0 },
        { label: "TPOs", value: tpoList.length },
        { label: "Candidates", value: candidateCount ?? 0 },
        { label: "Exams", value: examList.length },
      ],
      collegeAnalytics,
      branchAnalytics,
      recruiterSnapshots,
      recentAttempts: attemptList.slice(0, 8),
      recentExams,
      examTrend,
      leaderboard,
      resultSummary,
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

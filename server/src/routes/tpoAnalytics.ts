import { Router } from "express";
import { db } from "../lib/postgres.js";
import { authMiddleware, roleMiddleware, type AuthRequest } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";

const router = Router();
router.use(authMiddleware);
router.use(roleMiddleware(["tpo"]));

async function getTpoCollegeId(req: AuthRequest): Promise<string | null> {
  const { data: tpo } = await db
    .from("users")
    .select("college_id")
    .eq("id", req.user!.id)
    .single();
  return tpo?.college_id || null;
}

router.get("/placement-stats", async (req: AuthRequest, res) => {
  try {
    const collegeId = await getTpoCollegeId(req);
    if (!collegeId) {
      res.status(400).json({ error: "TPO is not linked to a college" });
      return;
    }

    const { data: profiles } = await db
      .from("candidate_profiles")
      .select("id, user_id, branch, cgpa, graduation_year")
      .eq("college_id", collegeId);

    const students = profiles || [];
    const candidateIds = students.map((s) => s.user_id);

    const { data: statuses } = candidateIds.length > 0
      ? await db
          .from("candidate_status")
          .select("candidate_id, status, job_id, jobs:job_id(company_name, salary_min, salary_max)")
          .in("candidate_id", candidateIds)
      : { data: [] };

    const statusList = (statuses || []) as any[];

    const branchMap = new Map<string, {
      branch: string;
      totalStudents: number;
      placed: number;
      totalSalary: number;
      salaryCount: number;
      totalCgpa: number;
    }>();

    const yearMap = new Map<number, {
      year: number;
      totalStudents: number;
      placed: number;
    }>();

    const companyMap = new Map<string, {
      company: string;
      offers: number;
      totalSalary: number;
      salaryCount: number;
    }>();

    students.forEach((student) => {
      const studentStatuses = statusList.filter((s) => s.candidate_id === student.user_id);
      const isPlaced = studentStatuses.some((s) => s.status === "offered");
      const placedJob = studentStatuses.find((s) => s.status === "offered");

      const b = branchMap.get(student.branch) || {
        branch: student.branch,
        totalStudents: 0,
        placed: 0,
        totalSalary: 0,
        salaryCount: 0,
        totalCgpa: 0,
      };
      b.totalStudents += 1;
      b.totalCgpa += Number(student.cgpa || 0);
      if (isPlaced) {
        b.placed += 1;
        const job = Array.isArray(placedJob?.jobs) ? placedJob.jobs[0] : placedJob?.jobs;
        if (job?.salary_min && job?.salary_max) {
          const avgSalary = (Number(job.salary_min) + Number(job.salary_max)) / 2;
          b.totalSalary += avgSalary;
          b.salaryCount += 1;
        }
      }
      branchMap.set(student.branch, b);

      const y = yearMap.get(student.graduation_year) || {
        year: student.graduation_year,
        totalStudents: 0,
        placed: 0,
      };
      y.totalStudents += 1;
      if (isPlaced) y.placed += 1;
      yearMap.set(student.graduation_year, y);
    });

    statusList.forEach((status) => {
      if (status.status === "offered") {
        const job = Array.isArray(status.jobs) ? status.jobs[0] : status.jobs;
        if (!job) return;
        const company = job.company_name || "Unknown";
        const c = companyMap.get(company) || {
          company,
          offers: 0,
          totalSalary: 0,
          salaryCount: 0,
        };
        c.offers += 1;
        if (job.salary_min && job.salary_max) {
          const avgSalary = (Number(job.salary_min) + Number(job.salary_max)) / 2;
          c.totalSalary += avgSalary;
          c.salaryCount += 1;
        }
        companyMap.set(company, c);
      }
    });

    const byBranch = Array.from(branchMap.values()).map((b) => ({
      branch: b.branch,
      totalStudents: b.totalStudents,
      placed: b.placed,
      placementRate: b.totalStudents ? Math.round((b.placed / b.totalStudents) * 100) : 0,
      avgSalary: b.salaryCount ? Number((b.totalSalary / b.salaryCount).toFixed(1)) : 0,
      avgCgpa: b.totalStudents ? Number((b.totalCgpa / b.totalStudents).toFixed(1)) : 0,
    }));

    const byYear = Array.from(yearMap.values()).map((y) => ({
      year: y.year,
      totalStudents: y.totalStudents,
      placed: y.placed,
      placementRate: y.totalStudents ? Math.round((y.placed / y.totalStudents) * 100) : 0,
    }));

    const topCompanies = Array.from(companyMap.values())
      .map((c) => ({
        company: c.company,
        offers: c.offers,
        avgSalary: c.salaryCount ? Number((c.totalSalary / c.salaryCount).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.offers - a.offers);

    res.json({ byBranch, byYear, topCompanies });
  } catch (err) {
    logger.error({ err }, "Placement stats error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/readiness-heatmap", async (req: AuthRequest, res) => {
  try {
    const collegeId = await getTpoCollegeId(req);
    if (!collegeId) {
      res.status(400).json({ error: "TPO is not linked to a college" });
      return;
    }

    const { data: profiles } = await db
      .from("candidate_profiles")
      .select("id, user_id, roll_number, branch, cgpa, resume_ats_analysis, resume_url, user:user_id(name)")
      .eq("college_id", collegeId);

    const students = (profiles || []) as any[];
    const candidateIds = students.map((s) => s.user_id);

    const { data: attempts } = candidateIds.length > 0
      ? await db
          .from("attempts")
          .select("id, candidate_id, score, status, exam_id, exams:exam_id(total_marks)")
          .in("candidate_id", candidateIds)
          .eq("status", "completed")
      : { data: [] };

    const { data: allAttempts } = candidateIds.length > 0
      ? await db
          .from("attempts")
          .select("id, candidate_id, exam_id")
          .in("candidate_id", candidateIds)
      : { data: [] };

    const attemptIds = (allAttempts || []).map((a: any) => a.id);
    const attemptIdToCandidate = new Map((allAttempts || []).map((a: any) => [a.id, a.candidate_id]));

    const { data: codingSubs } = attemptIds.length > 0
      ? await db
          .from("coding_submissions")
          .select("attempt_id, score, coding_questions:coding_question_id(marks)")
          .in("attempt_id", attemptIds)
      : { data: [] };

    const { data: interviews } = candidateIds.length > 0
      ? await db
          .from("ai_interviews")
          .select("candidate_id, score, status")
          .in("candidate_id", candidateIds)
          .eq("status", "completed")
      : { data: [] };

    const { data: exams } = await db
      .from("exams")
      .select("id");

    const totalExams = (exams || []).length;

    const studentScores = students.map((student) => {
      const candidateId = student.user_id;
      const studentAttempts = (attempts || []).filter((a: any) => a.candidate_id === candidateId);
      const studentCoding = (codingSubs || []).filter((c: any) => attemptIdToCandidate.get(c.attempt_id) === candidateId);
      const studentInterviews = (interviews || []).filter((i: any) => i.candidate_id === candidateId);

      const examPercentages = studentAttempts.map((a: any) => {
        const exam = Array.isArray(a.exams) ? a.exams[0] : a.exams;
        return exam?.total_marks ? ((a.score || 0) / exam.total_marks) * 100 : 0;
      });
      const examAvg = examPercentages.length
        ? examPercentages.reduce((sum: number, p: number) => sum + p, 0) / examPercentages.length
        : 0;

      const codingPercentages = studentCoding.map((c: any) => {
        const q = Array.isArray(c.coding_questions) ? c.coding_questions[0] : c.coding_questions;
        return q?.marks ? ((c.score || 0) / q.marks) * 100 : 0;
      });
      const codingScore = codingPercentages.length
        ? codingPercentages.reduce((sum: number, p: number) => sum + p, 0) / codingPercentages.length
        : examAvg;

      const interviewScores = studentInterviews.map((i: any) => i.score || 0);
      const interviewScore = interviewScores.length
        ? interviewScores.reduce((sum: number, s: number) => sum + s, 0) / interviewScores.length
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

      const uniqueExams = new Set(studentAttempts.map((a: any) => a.exam_id)).size;
      const breadth = totalExams ? Math.min(100, (uniqueExams / totalExams) * 100) : Math.min(100, uniqueExams * 10);

      const readinessScore = Math.round(
        (examAvg * 0.40) +
        (codingScore * 0.25) +
        (interviewScore * 0.20) +
        (consistency * 0.10) +
        (breadth * 0.05)
      );

      const zone = readinessScore >= 75 ? "ready" : readinessScore >= 50 ? "approaching" : "needs_work";
      const userName = Array.isArray(student.user) ? student.user[0]?.name : student.user?.name;

      return {
        candidateId: student.user_id,
        name: userName || "Unknown",
        roll_number: student.roll_number || "",
        branch: student.branch || "",
        cgpa: Number(student.cgpa || 0),
        readinessScore,
        zone,
        resume_ats_analysis: student.resume_ats_analysis,
        resume_url: student.resume_url,
      };
    });

    const zoneCounts = {
      ready: studentScores.filter((s) => s.zone === "ready").length,
      approaching: studentScores.filter((s) => s.zone === "approaching").length,
      needs_work: studentScores.filter((s) => s.zone === "needs_work").length,
    };

    res.json({ students: studentScores, zoneCounts });
  } catch (err) {
    logger.error({ err }, "Readiness heatmap error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/company-performance", async (req: AuthRequest, res) => {
  try {
    const collegeId = await getTpoCollegeId(req);
    if (!collegeId) {
      res.status(400).json({ error: "TPO is not linked to a college" });
      return;
    }

    const { data: jobs } = await db
      .from("jobs")
      .select("id, company_name")
      .eq("college_id", collegeId);

    const jobList = jobs || [];
    const jobIds = jobList.map((j) => j.id);

    const { data: statuses } = jobIds.length > 0
      ? await db
          .from("candidate_status")
          .select("job_id, status")
          .in("job_id", jobIds)
      : { data: [] };

    const statusList = (statuses || []) as any[];

    const companyMap = new Map<string, {
      company: string;
      drives: number;
      registered: number;
      examTaken: number;
      passed: number;
      shortlisted: number;
      offered: number;
    }>();

    jobList.forEach((job) => {
      const company = job.company_name || "Unknown";
      const c = companyMap.get(company) || {
        company,
        drives: 0,
        registered: 0,
        examTaken: 0,
        passed: 0,
        shortlisted: 0,
        offered: 0,
      };
      c.drives += 1;
      companyMap.set(company, c);
    });

    statusList.forEach((status: any) => {
      const job = jobList.find((j) => j.id === status.job_id);
      if (!job) return;
      const company = job.company_name || "Unknown";
      const c = companyMap.get(company);
      if (!c) return;

      const s = status.status;
      if (s === "registered") c.registered += 1;
      if (["exam_taken", "passed", "shortlisted", "on_hold", "offered"].includes(s)) c.examTaken += 1;
      if (["passed", "shortlisted", "on_hold", "offered"].includes(s)) c.passed += 1;
      if (["shortlisted", "on_hold", "offered"].includes(s)) c.shortlisted += 1;
      if (s === "offered") c.offered += 1;
    });

    const companies = Array.from(companyMap.values()).map((c) => ({
      company: c.company,
      drives: c.drives,
      registered: c.registered,
      examTaken: c.examTaken,
      passed: c.passed,
      shortlisted: c.shortlisted,
      offered: c.offered,
      conversionRate: c.registered ? Math.round((c.offered / c.registered) * 100) : 0,
    }));

    res.json({ companies });
  } catch (err) {
    logger.error({ err }, "Company performance error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/upload-tracking", async (req: AuthRequest, res) => {
  try {
    const collegeId = await getTpoCollegeId(req);
    if (!collegeId) {
      res.status(400).json({ error: "TPO is not linked to a college" });
      return;
    }

    const { data: uploads } = await db
      .from("tpo_uploads")
      .select("id, file_name, rows_total, rows_created, rows_failed, status, created_at")
      .eq("tpo_id", req.user!.id)
      .eq("college_id", collegeId)
      .order("created_at", { ascending: false });

    const uploadList = (uploads || []) as any[];

    const formattedUploads = uploadList.map((u) => {
      const total = u.rows_total || 0;
      const created = u.rows_created || 0;
      return {
        id: u.id,
        fileName: u.file_name || "",
        rowsTotal: total,
        rowsCreated: created,
        rowsFailed: u.rows_failed || 0,
        successRate: total ? Math.round((created / total) * 100) : 0,
        createdAt: u.created_at,
      };
    });

    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("en-US", { month: "short" }),
      });
    }

    const trend = months.map((month) => {
      const monthUploads = uploadList.filter((u) => u.created_at?.startsWith(month.key));
      const totalRows = monthUploads.reduce((sum, u) => sum + (u.rows_total || 0), 0);
      const createdRows = monthUploads.reduce((sum, u) => sum + (u.rows_created || 0), 0);
      return {
        month: month.label,
        uploads: monthUploads.length,
        successRate: totalRows ? Math.round((createdRows / totalRows) * 100) : 0,
      };
    });

    res.json({ uploads: formattedUploads, trend });
  } catch (err) {
    logger.error({ err }, "Upload tracking error");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

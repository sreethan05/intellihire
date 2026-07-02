import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, transaction } from "../lib/postgres.js";
import { scanMarksheetOCR } from "../lib/ocr.js";
import { scanMarksheet, hasAiKey } from "../lib/ai.js";
import { authMiddleware, roleMiddleware, type AuthRequest } from "../middleware/auth.js";

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(["tpo"]));

type StudentRow = {
  roll_number: string;
  name: string;
  branch: string;
  cgpa: number;
  graduation_year: number;
  email?: string;
};

type TpoCollege = {
  college_id: string;
  college: { code?: string } | Array<{ code?: string }> | null;
};

async function getTpoCollege(tpoId: string) {
  const { data: tpo, error } = await db
    .from("users")
    .select("college_id, college:college_id(code)")
    .eq("id", tpoId)
    .single();

  if (error || !tpo?.college_id) {
    throw new Error("TPO is not linked to a college");
  }

  return tpo as TpoCollege;
}

async function provisionCandidateAccounts(rows: StudentRow[], tpo: TpoCollege, tpoUserId: string) {
  const college = Array.isArray(tpo.college) ? tpo.college[0] : tpo.college;
  const collegeCode = college?.code || "college";
  const created: any[] = [];
  const failed: any[] = [];

  for (const row of rows) {
    const rollNumber = String(row.roll_number || "").trim().toUpperCase();
    const name = String(row.name || "").trim();
    const branch = String(row.branch || "").trim().toUpperCase();
    const cgpa = Number(row.cgpa);
    const graduationYear = Number(row.graduation_year);

    if (!rollNumber || !name || !branch || Number.isNaN(cgpa) || Number.isNaN(graduationYear)) {
      failed.push({ row, reason: "Missing or invalid required fields" });
      continue;
    }

    const email = row.email || `${rollNumber.toLowerCase()}@${String(collegeCode).toLowerCase()}.student.local`;
    const password_hash = await bcrypt.hash(rollNumber, 10);
    try {
      const user = await transaction(async (client) => {
        const userResult = await client.query(
          `INSERT INTO "users" ("name", "email", "password_hash", "role", "roll_number", "college_id", "must_change_password", "profile_complete", "created_by")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT ("roll_number") DO UPDATE SET
             "name" = EXCLUDED."name",
             "email" = EXCLUDED."email",
             "password_hash" = EXCLUDED."password_hash",
             "college_id" = EXCLUDED."college_id"
           RETURNING "id", "name", "email", "roll_number"`,
          [name, email, password_hash, "candidate", rollNumber, tpo.college_id, true, false, tpoUserId]
        );
        const userRow = userResult.rows[0];
        if (!userRow) throw new Error("Could not create user record");

        await client.query(
          `INSERT INTO "candidate_profiles" ("user_id", "college_id", "roll_number", "branch", "cgpa", "graduation_year")
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT ("user_id") DO UPDATE SET
             "college_id" = EXCLUDED."college_id",
             "roll_number" = EXCLUDED."roll_number",
             "branch" = EXCLUDED."branch",
             "cgpa" = EXCLUDED."cgpa",
             "graduation_year" = EXCLUDED."graduation_year"`,
          [userRow.id, tpo.college_id, rollNumber, branch, cgpa, graduationYear]
        );

        return userRow;
      });

      created.push(user);
    } catch (txErr: any) {
      failed.push({ row, reason: txErr.message || "Database transaction failed" });
    }
  }

  return { created, failed };
}

router.get("/dashboard", async (req: AuthRequest, res) => {
  try {
    const { data: tpo } = await db
      .from("users")
      .select("college_id, college:college_id(id, name, code)")
      .eq("id", req.user!.id)
      .single();

    if (!tpo?.college_id) {
      res.status(400).json({ error: "TPO is not linked to a college" });
      return;
    }

    const { data: drives } = await db
      .from("jobs")
      .select("id, title, company_name, drive_date, status")
      .eq("college_id", tpo.college_id)
      .order("created_at", { ascending: false });

    const driveList = drives || [];
    const driveIds = driveList.map(d => d.id);

    const [{ data: profiles }, { data: statuses }, { data: attempts }] = await Promise.all([
      db
        .from("candidate_profiles")
        .select("id, user_id, branch, cgpa, profile_complete, documents_verified")
        .eq("college_id", tpo.college_id),
      driveIds.length > 0
        ? db.from("candidate_status").select("id, status, job_id").in("job_id", driveIds)
        : Promise.resolve({ data: [] }),
      db
        .from("attempts")
        .select("id, candidate_id, status, score, exams:exam_id(total_marks)")
        .eq("status", "completed"),
    ]);

    const students = profiles || [];
    const studentIds = new Set(students.map((student) => student.user_id));
    const collegeAttempts = (attempts || []).filter((attempt) => studentIds.has(attempt.candidate_id));
    const placed = (statuses || []).filter((item: any) => item.status === "offered").length;
    const branchMap = new Map<string, { branch: string; count: number; verified: number; complete: number; averageCgpa: number; placed: number }>();
    students.forEach((student) => {
      const current = branchMap.get(student.branch) || { branch: student.branch, count: 0, verified: 0, complete: 0, averageCgpa: 0, placed: 0 };
      current.count += 1;
      current.verified += student.documents_verified ? 1 : 0;
      current.complete += student.profile_complete ? 1 : 0;
      current.averageCgpa += Number(student.cgpa || 0);
      branchMap.set(student.branch, current);
    });

    const cgpaBands = [
      { label: "9.0+", min: 9, max: 10.1 },
      { label: "8.0-8.9", min: 8, max: 9 },
      { label: "7.0-7.9", min: 7, max: 8 },
      { label: "Below 7", min: 0, max: 7 },
    ].map((band) => ({
      label: band.label,
      students: students.filter((student) => Number(student.cgpa || 0) >= band.min && Number(student.cgpa || 0) < band.max).length,
    }));

    const averageAttemptPercentage = collegeAttempts.length
      ? Number((collegeAttempts.reduce((sum: number, attempt: any) => {
          const exam = Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams;
          return sum + (exam?.total_marks ? ((attempt.score || 0) / exam.total_marks) * 100 : 0);
        }, 0) / collegeAttempts.length).toFixed(1))
      : 0;

    res.json({
      college: Array.isArray(tpo.college) ? tpo.college[0] : tpo.college,
      stats: {
        students: students.length,
        profileComplete: students.filter((student) => student.profile_complete).length,
        pendingVerification: students.filter((student) => !student.documents_verified).length,
        activeDrives: (drives || []).filter((drive) => drive.status === "active").length,
        placed,
        placementRate: students.length ? Number(((placed / students.length) * 100).toFixed(1)) : 0,
        averageCgpa: students.length ? Number((students.reduce((sum, student) => sum + Number(student.cgpa || 0), 0) / students.length).toFixed(2)) : 0,
        averageAttemptPercentage,
      },
      branchBreakdown: Array.from(branchMap.values()).map((item) => ({
        ...item,
        averageCgpa: item.count ? Number((item.averageCgpa / item.count).toFixed(2)) : 0,
      })),
      cgpaBands,
      recentDrives: drives || [],
    });
  } catch (err) {
    console.error("TPO dashboard error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/upload-students", async (req: AuthRequest, res) => {
  try {
    const rows = req.body.rows as StudentRow[];
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "Student rows are required" });
      return;
    }

    const tpo = await getTpoCollege(req.user!.id);
    const { created, failed } = await provisionCandidateAccounts(rows, tpo, req.user!.id);

    res.json({ message: `${created.length} student account(s) processed`, created, failed });
  } catch (err) {
    console.error("Upload students error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/scan-marksheets", async (req: AuthRequest, res) => {
  try {
    const files = req.body.files as Array<{ name: string; mimeType: string; data: string }>;
    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: "At least one marksheet file is required" });
      return;
    }

    const scanned: StudentRow[] = [];
    const failed: any[] = [];

    for (const file of files) {
      try {
        if (!file.name || !file.mimeType || !file.data) {
          failed.push({ file: file.name || "unknown", reason: "Missing file payload" });
          continue;
        }

        // ── Step 1: OCR + rule-based parser (no API, no limits) ──
        let student = await scanMarksheetOCR(file);

        // ── Step 2: If OCR confidence is low, try AI as fallback ──
        if (student.confidence < 0.6 && hasAiKey()) {
          try {
            student = await scanMarksheet(file);
            console.log(`[scan] AI fallback used for ${file.name}`);
          } catch {
            console.warn(`[scan] AI fallback failed for ${file.name}, using OCR result`);
          }
        }

        scanned.push(student);
      } catch (err) {
        failed.push({ file: file.name || "unknown", reason: err instanceof Error ? err.message : "Scan failed" });
      }
    }

    const tpo = await getTpoCollege(req.user!.id);
    const provisioned = await provisionCandidateAccounts(scanned, tpo, req.user!.id);

    res.json({
      message: `${provisioned.created.length} candidate account(s) created from ${scanned.length} scanned marksheet(s)`,
      students: scanned,
      created: provisioned.created,
      failed: [...failed, ...provisioned.failed],
    });
  } catch (err) {
    console.error("Scan marksheets error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/students", async (req: AuthRequest, res) => {
  try {
    const { data: tpo } = await db.from("users").select("college_id").eq("id", req.user!.id).single();
    if (!tpo?.college_id) {
      res.status(400).json({ error: "TPO is not linked to a college" });
      return;
    }

    const { data, error } = await db
      .from("candidate_profiles")
      .select("*, user:user_id(id, name, email, roll_number, profile_complete, created_at)")
      .eq("college_id", tpo.college_id)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ students: data || [] });
  } catch (err) {
    console.error("TPO students error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/students/:profileId/verification", async (req: AuthRequest, res) => {
  try {
    const { profileId } = req.params;
    const { documents_verified } = req.body;
    const { data: tpo } = await db.from("users").select("college_id").eq("id", req.user!.id).single();
    const { data, error } = await db
      .from("candidate_profiles")
      .update({ documents_verified: Boolean(documents_verified) })
      .eq("id", profileId)
      .eq("college_id", tpo?.college_id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ student: data });
  } catch (err) {
    console.error("Verify documents error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/dashboard/summary", async (req: AuthRequest, res) => {
  try {
    const { data: tpo } = await db.from("users").select("college_id").eq("id", req.user!.id).single();
    if (!tpo?.college_id) {
      res.status(400).json({ error: "TPO is not linked to a college" });
      return;
    }
    
    // 1. Counters
    const [{ count: totalRegistered }, { count: totalEligible }, { count: pendingVerification }] = await Promise.all([
      db.from("users").select("*", { count: "exact", head: true }).eq("college_id", tpo.college_id).eq("role", "candidate"),
      db.from("candidate_profiles").select("*", { count: "exact", head: true }).eq("college_id", tpo.college_id).eq("documents_verified", true),
      db.from("candidate_profiles").select("*", { count: "exact", head: true }).eq("college_id", tpo.college_id).eq("documents_verified", false)
    ]);
    
    const { data: jobs } = await db.from("jobs")
      .select("id, title, status, drive_date")
      .eq("college_id", tpo.college_id);
    
    const activeDrivesCount = jobs?.filter(j => j.status === "active").length || 0;
    
    const { data: placedRes } = await db.from("candidate_status")
      .select("*, candidate:candidate_id(college_id)")
      .eq("candidate.college_id", tpo.college_id)
      .in("status", ["offered", "placed"]);
    
    const totalPlaced = placedRes?.length || 0;
    
    const placementRate = totalRegistered && totalRegistered > 0 ? Math.round((totalPlaced / totalRegistered) * 100) : 0;
    
    // TPO Action Items compilation
    const actionItems: any[] = [];
    if (pendingVerification && pendingVerification > 0) {
      actionItems.push({
        id: "tpo_docs_verify",
        title: "Pending Document Verification",
        description: `${pendingVerification} students are waiting for profile marksheet approvals.`,
        priority: "urgent",
        action_url: "/tpo/students?tab=pending"
      });
    }
    
    if (jobs) {
      const closingSoonJobs = jobs.filter(j => j.status === "active" && j.drive_date && new Date(j.drive_date).getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000);
      for (const job of closingSoonJobs) {
        actionItems.push({
          id: `tpo_job_${job.id}`,
          title: `Drive: '${job.title}' closing soon`,
          description: `The application deadline is in less than 2 days.`,
          priority: "high",
          action_url: "/tpo/drives"
        });
      }
    }
    
    res.json({
      summary: {
        totalRegistered: totalRegistered || 0,
        totalEligible: totalEligible || 0,
        totalPlaced,
        activeDrives: activeDrivesCount,
        pendingVerification: pendingVerification || 0,
        placementRate,
        actionItems
      }
    });
  } catch (err) {
    console.error("Fetch TPO dashboard summary error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/verify/batch", async (req: AuthRequest, res) => {
  try {
    const { studentIds, documents_verified } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      res.status(400).json({ error: "No student profile IDs provided for batch verification" });
      return;
    }
    
    const { data: tpo } = await db.from("users").select("college_id").eq("id", req.user!.id).single();
    if (!tpo?.college_id) {
      res.status(400).json({ error: "TPO is not linked to a college" });
      return;
    }
    
    const updated: any[] = [];
    for (const profileId of studentIds) {
      const { data } = await db.from("candidate_profiles")
        .update({ documents_verified: Boolean(documents_verified), placement_ready: Boolean(documents_verified) })
        .eq("id", profileId)
        .eq("college_id", tpo.college_id)
        .select()
        .maybeSingle();
      if (data) {
        updated.push(data);
      }
    }
    
    res.json({ message: `Batch updated ${updated.length} profile(s).`, updated });
  } catch (err) {
    console.error("Batch verification error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

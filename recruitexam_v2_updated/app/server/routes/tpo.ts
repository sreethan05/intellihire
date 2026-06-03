import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase";
import { scanMarksheetOCR } from "../lib/ocr";
import { scanMarksheet, hasAiKey } from "../lib/ai";
import { authMiddleware, roleMiddleware, type AuthRequest } from "../middleware/auth";

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
  const { data: tpo, error } = await supabase
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
  const created = [];
  const failed = [];

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
    const { data: user, error: userError } = await supabase
      .from("users")
      .upsert({
        name,
        email,
        password_hash,
        role: "candidate",
        roll_number: rollNumber,
        college_id: tpo.college_id,
        must_change_password: true,
        profile_complete: false,
        created_by: tpoUserId,
      }, { onConflict: "roll_number" })
      .select("id, name, email, roll_number")
      .single();

    if (userError || !user) {
      failed.push({ row, reason: userError?.message || "Could not create user" });
      continue;
    }

    const { error: profileError } = await supabase
      .from("candidate_profiles")
      .upsert({
        user_id: user.id,
        college_id: tpo.college_id,
        roll_number: rollNumber,
        branch,
        cgpa,
        graduation_year: graduationYear,
      }, { onConflict: "user_id" });

    if (profileError) {
      failed.push({ row, reason: profileError.message });
      continue;
    }

    created.push(user);
  }

  return { created, failed };
}

router.get("/dashboard", async (req: AuthRequest, res) => {
  try {
    const { data: tpo } = await supabase
      .from("users")
      .select("college_id, college:college_id(id, name, code)")
      .eq("id", req.user!.id)
      .single();

    if (!tpo?.college_id) {
      res.status(400).json({ error: "TPO is not linked to a college" });
      return;
    }

    const { data: drives } = await supabase
      .from("jobs")
      .select("id, title, company_name, drive_date, status")
      .eq("college_id", tpo.college_id)
      .order("created_at", { ascending: false });

    const driveList = drives || [];
    const driveIds = driveList.map(d => d.id);

    const [{ data: profiles }, { data: statuses }, { data: attempts }] = await Promise.all([
      supabase
        .from("candidate_profiles")
        .select("id, user_id, branch, cgpa, profile_complete, documents_verified")
        .eq("college_id", tpo.college_id),
      driveIds.length > 0
        ? supabase.from("candidate_status").select("id, status, job_id").in("job_id", driveIds)
        : Promise.resolve({ data: [] }),
      supabase
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
    const failed = [];

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
    const { data: tpo } = await supabase.from("users").select("college_id").eq("id", req.user!.id).single();
    if (!tpo?.college_id) {
      res.status(400).json({ error: "TPO is not linked to a college" });
      return;
    }

    const { data, error } = await supabase
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
    const { data: tpo } = await supabase.from("users").select("college_id").eq("id", req.user!.id).single();
    const { data, error } = await supabase
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

export default router;

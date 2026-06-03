import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase";
import { authMiddleware, roleMiddleware, type AuthRequest } from "../middleware/auth";
import { generateAiJson, hasAiKey } from "../lib/ai";
import { getPasswordValidationError, isValidEmail } from "../lib/validation";


const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(["recruiter"]));

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

router.post("/create-candidate", async (req: AuthRequest, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "Name, email, and password required" });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ error: "Enter a valid candidate email address" });
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
        role: "candidate",
        created_by: req.user!.id,
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ message: "Candidate created", candidate: data });
  } catch (err) {
    console.error("Create candidate error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/candidates", async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, created_at")
      .eq("role", "candidate");

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ candidates: data || [] });
  } catch (err) {
    console.error("Fetch candidates error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/colleges", async (_req: AuthRequest, res) => {
  try {
    const { data, error } = await supabase
      .from("colleges")
      .select("id, name, code, location, created_at")
      .order("name");

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ colleges: data || [] });
  } catch (err) {
    console.error("Fetch colleges error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/colleges-summary", async (req: AuthRequest, res) => {
  try {
    const recruiterId = req.user!.id;

    // 1. Fetch colleges
    const { data: colleges, error: colErr } = await supabase
      .from("colleges")
      .select("id, name, code, location, created_at")
      .order("name");

    if (colErr) {
      res.status(400).json({ error: colErr.message });
      return;
    }

    // 2. Fetch recruiter's jobs
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, title, company_name, college_id, company_description, status")
      .eq("created_by", recruiterId);

    const jobList = jobs || [];
    const jobIds = jobList.map(j => j.id);

    // 3. Fetch candidate profiles
    const { data: profiles } = await supabase
      .from("candidate_profiles")
      .select("user_id, college_id, cgpa, branch");

    const profileList = profiles || [];

    // 4. Fetch candidate statuses for recruiter's jobs
    let pipelineList: any[] = [];
    if (jobIds.length > 0) {
      const { data: pipelineData } = await supabase
        .from("candidate_status")
        .select("job_id, candidate_id, status")
        .in("job_id", jobIds);
      pipelineList = pipelineData || [];
    }

    // 5. Fetch exam attempts under recruiter
    const { data: attempts } = await supabase
      .from("attempts")
      .select("id, exam_id, candidate_id, score, status")
      .eq("recruiter_id", recruiterId);

    const attemptList = attempts || [];

    // 6. Fetch AI interviews
    const { data: aiInterviews } = await supabase
      .from("ai_interviews")
      .select("id, candidate_id, score, status");

    const interviewList = aiInterviews || [];

    // Calculate metrics for each college
    const summary = (colleges || []).map(college => {
      // Find jobs associated with this college
      const collegeJobs = jobList.filter(j => {
        if (j.college_id === college.id) return true;
        const parsed = deserializeDriveColleges(j.company_description);
        return parsed.college_ids.includes(college.id);
      });

      // Find candidates belonging to this college
      const collegeProfiles = profileList.filter(p => p.college_id === college.id);
      const collegeCandidateIds = collegeProfiles.map(p => p.user_id);
      const collegeCandidateIdsSet = new Set(collegeCandidateIds);

      // Candidate status list for this college
      const collegePipeline = pipelineList.filter(p => collegeCandidateIdsSet.has(p.candidate_id));

      // Attempt list for this college
      const collegeAttempts = attemptList.filter(a => collegeCandidateIdsSet.has(a.candidate_id));
      const completedAttempts = collegeAttempts.filter(a => a.status === "completed");

      // AI Interviews for this college
      const collegeInterviews = interviewList.filter(i => collegeCandidateIdsSet.has(i.candidate_id));

      // Metrics calculation
      const drivesCount = collegeJobs.length;
      const candidatesCount = collegeProfiles.length;
      const registeredCount = collegePipeline.length;
      const attemptsCount = collegeAttempts.length;
      const completedAttemptsCount = completedAttempts.length;
      const passCount = completedAttempts.filter(a => (a.score ?? 0) >= 40).length; // general default pass bar
      const offersCount = collegePipeline.filter(p => p.status === "offered").length;
      const aiInterviewsCount = collegeInterviews.length;

      const averageScore = completedAttemptsCount
        ? Number((completedAttempts.reduce((sum, a) => sum + (a.score ?? 0), 0) / completedAttemptsCount).toFixed(1))
        : 0;

      return {
        id: college.id,
        name: college.name,
        code: college.code,
        location: college.location,
        drivesCount,
        candidatesCount,
        registeredCount,
        attemptsCount,
        completedAttemptsCount,
        passCount,
        offersCount,
        aiInterviewsCount,
        averageScore,
      };
    });

    res.json({ colleges: summary });
  } catch (err) {
    console.error("Colleges summary error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


export function serializeDriveColleges(description: string, collegeIds: string[], aiConfig?: any) {
  const metadata = { college_ids: collegeIds, aiConfig };
  return `${description || ""}\n\n===METADATA===\n${JSON.stringify(metadata)}`;
}

export function deserializeDriveColleges(description: string) {
  const parts = (description || "").split("\n\n===METADATA===\n");
  if (parts.length > 1) {
    try {
      const metadata = JSON.parse(parts[1]);
      return {
        description: parts[0],
        college_ids: metadata.college_ids || [],
        aiConfig: metadata.aiConfig || {
          persona: "",
          instructions: "",
          rubric: "",
          examples: [],
          temperature: 0.4
        }
      };
    } catch (e) {
      // Ignore
    }
  }
  return {
    description: description || "",
    college_ids: [],
    aiConfig: {
      persona: "",
      instructions: "",
      rubric: "",
      examples: [],
      temperature: 0.4
    }
  };
}

function getDriveCollegeIds(drive: any): string[] {
  if (drive.company_description) {
    const parsed = deserializeDriveColleges(drive.company_description);
    if (parsed.college_ids.length > 0) {
      return parsed.college_ids;
    }
  }
  return drive.college_id ? [drive.college_id] : [];
}

router.post("/drives", async (req: AuthRequest, res) => {
  try {
    const {
      title,
      company_name,
      company_description,
      college_id,
      college_ids,
      min_cgpa,
      allowed_branches,
      required_skills,
      salary_min,
      salary_max,
      drive_date,
      exam_id,
      interview_pass_score,
      interview_duration,
    } = req.body;

    const actualCollegeId = college_id || (Array.isArray(college_ids) && college_ids[0]) || null;
    const finalCollegeIds = Array.isArray(college_ids) && college_ids.length > 0 ? college_ids : (actualCollegeId ? [actualCollegeId] : []);

    if (!title || !company_name || !actualCollegeId || !Array.isArray(allowed_branches) || allowed_branches.length === 0) {
      res.status(400).json({ error: "Title, company, college, and branches are required" });
      return;
    }

    const finalDescription = serializeDriveColleges(company_description || "", finalCollegeIds);

    const { data: drive, error } = await supabase
      .from("jobs")
      .insert({
        title,
        company_name,
        company_description: finalDescription,
        college_id: actualCollegeId,
        min_cgpa: Number(min_cgpa || 0),
        allowed_branches: allowed_branches.map((branch: string) => branch.toUpperCase()),
        required_skills: Array.isArray(required_skills) ? required_skills : [],
        salary_min: salary_min || null,
        salary_max: salary_max || null,
        drive_date: drive_date || null,
        exam_id: exam_id || null,
        interview_pass_score: interview_pass_score !== undefined ? Number(interview_pass_score) : 60,
        interview_duration: interview_duration !== undefined ? Number(interview_duration) : 15,
        created_by: req.user!.id,
      })
      .select()
      .single();

    if (error || !drive) {
      res.status(400).json({ error: error?.message || "Could not create drive" });
      return;
    }

    const eligible = await findEligibleCandidates(drive);
    if (eligible.length > 0) {
      await supabase.from("candidate_status").upsert(
        eligible.map((candidate) => ({
          job_id: drive.id,
          candidate_id: candidate.user_id,
          status: "registered",
        })),
        { onConflict: "job_id,candidate_id", ignoreDuplicates: true }
      );

      if (drive.exam_id) {
        await supabase.from("exam_assignments").upsert(
          eligible.map((candidate) => ({
            exam_id: drive.exam_id,
            candidate_id: candidate.user_id,
            assigned_by: req.user!.id,
            job_id: drive.id,
          })),
          { onConflict: "exam_id,candidate_id", ignoreDuplicates: true }
        );
      }
    }

    const parsedDesc = deserializeDriveColleges(drive.company_description);
    let collegesList: any[] = [];
    if (finalCollegeIds.length > 0) {
      const { data } = await supabase.from("colleges").select("id, name, code").in("id", finalCollegeIds);
      collegesList = data || [];
    }

    const enrichedDrive = {
      ...drive,
      company_description: parsedDesc.description,
      college_ids: parsedDesc.college_ids,
      colleges: collegesList
    };

    res.json({ message: "Drive created", drive: enrichedDrive, eligibleCount: eligible.length });
  } catch (err) {
    console.error("Create drive error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/drives", async (req: AuthRequest, res) => {
  try {
    const { data: rawDrives, error } = await supabase
      .from("jobs")
      .select("*, college:college_id(id, name, code), exam:exam_id(id, title)")
      .eq("created_by", req.user!.id)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    const drives = rawDrives || [];
    const allCollegeIdsSet = new Set<string>();
    drives.forEach((drive: any) => {
      const ids = getDriveCollegeIds(drive);
      ids.forEach(id => allCollegeIdsSet.add(id));
      if (drive.college_id) allCollegeIdsSet.add(drive.college_id);
    });

    const allCollegeIds = Array.from(allCollegeIdsSet);
    const collegesMap: Record<string, any> = {};
    if (allCollegeIds.length > 0) {
      const { data: collegesList } = await supabase
        .from("colleges")
        .select("id, name, code, location")
        .in("id", allCollegeIds);
      collegesList?.forEach((c: any) => {
        collegesMap[c.id] = c;
      });
    }

    const enrichedDrives = drives.map((drive: any) => {
      const collegeIds = getDriveCollegeIds(drive);
      const colleges = collegeIds.map(id => collegesMap[id]).filter(Boolean);
      const parsedDesc = deserializeDriveColleges(drive.company_description);
      return {
        ...drive,
        company_description: parsedDesc.description,
        college_ids: collegeIds,
        colleges: colleges.length > 0 ? colleges : (drive.college ? [drive.college] : []),
      };
    });

    res.json({ drives: enrichedDrives });
  } catch (err) {
    console.error("Fetch drives error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/drives/:driveId/eligible-candidates", async (req: AuthRequest, res) => {
  try {
    const { data: drive, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", req.params.driveId)
      .eq("created_by", req.user!.id)
      .single();

    if (error || !drive) {
      res.status(404).json({ error: "Drive not found" });
      return;
    }

    const eligible = await findEligibleCandidates(drive);
    res.json({ candidates: eligible, count: eligible.length });
  } catch (err) {
    console.error("Eligible candidates error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/drives/:driveId/assign-exam", async (req: AuthRequest, res) => {
  try {
    const { exam_id } = req.body;
    const { data: drive, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", req.params.driveId)
      .eq("created_by", req.user!.id)
      .single();

    if (error || !drive || !exam_id) {
      res.status(400).json({ error: "Drive and exam are required" });
      return;
    }

    const eligible = await findEligibleCandidates(drive);
    await supabase.from("jobs").update({ exam_id }).eq("id", drive.id);

    const { data, error: assignError } = await supabase.from("exam_assignments").upsert(
      eligible.map((candidate) => ({
        exam_id,
        candidate_id: candidate.user_id,
        assigned_by: req.user!.id,
        job_id: drive.id,
      })),
      { onConflict: "exam_id,candidate_id", ignoreDuplicates: true }
    ).select();

    if (assignError) {
      res.status(400).json({ error: assignError.message });
      return;
    }

    res.json({ message: `${data?.length || 0} eligible candidate(s) assigned`, assignments: data || [] });
  } catch (err) {
    console.error("Assign drive exam error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

async function findEligibleCandidates(drive: any) {
  const branches = Array.isArray(drive.allowed_branches) ? drive.allowed_branches : [];
  const collegeIds = getDriveCollegeIds(drive);

  if (collegeIds.length === 0) return [];

  let query = supabase
    .from("candidate_profiles")
    .select("*, user:user_id(id, name, email, roll_number, profile_complete)")
    .in("college_id", collegeIds)
    .gte("cgpa", Number(drive.min_cgpa || 0));

  if (branches.length > 0) {
    query = query.in("branch", branches.map((branch: string) => branch.toUpperCase()));
  }

  const { data, error } = await query.order("cgpa", { ascending: false });
  if (error) return [];
  return data || [];
}

router.get("/dashboard", async (req: AuthRequest, res) => {
  try {
    const recruiterId = req.user!.id;
    const collegeId = req.query.collegeId as string | undefined;

    const { data: drives } = await supabase
      .from("jobs")
      .select("id, title, company_name, college_id, min_cgpa, allowed_branches, status, drive_date, exam_id, company_description")
      .eq("created_by", recruiterId);

    let driveList = drives || [];
    if (collegeId) {
      driveList = driveList.filter((d: any) => {
        if (d.college_id === collegeId) return true;
        const parsed = deserializeDriveColleges(d.company_description);
        return parsed.college_ids.includes(collegeId);
      });
    }
    const driveIds = driveList.map(d => d.id);

    // Get candidate profile list to get user_ids of this college
    let profilesQuery = supabase
      .from("candidate_profiles")
      .select("id, user_id, branch, cgpa, profile_complete, documents_verified, college_id");
    if (collegeId) {
      profilesQuery = profilesQuery.eq("college_id", collegeId);
    }
    const { data: profiles } = await profilesQuery;
    const profileList = profiles || [];
    const collegeCandidateUserIds = profileList.map(p => p.user_id);

    let candidatesQuery = supabase
      .from("users")
      .select("id, name, email, created_at")
      .eq("role", "candidate");
    if (collegeId) {
      if (collegeCandidateUserIds.length > 0) {
        candidatesQuery = candidatesQuery.in("id", collegeCandidateUserIds);
      } else {
        candidatesQuery = candidatesQuery.eq("id", "00000000-0000-0000-0000-000000000000"); // select nothing
      }
    }
    const { data: candidates } = await candidatesQuery;
    const candidateList = candidates || [];

    let pipelineQuery = supabase.from("candidate_status").select("id, job_id, candidate_id, status");
    if (driveIds.length > 0) {
      pipelineQuery = pipelineQuery.in("job_id", driveIds);
    } else {
      pipelineQuery = pipelineQuery.in("job_id", ["00000000-0000-0000-0000-000000000000"]);
    }
    if (collegeId) {
      if (collegeCandidateUserIds.length > 0) {
        pipelineQuery = pipelineQuery.in("candidate_id", collegeCandidateUserIds);
      } else {
        pipelineQuery = pipelineQuery.eq("id", "00000000-0000-0000-0000-000000000000");
      }
    }
    const { data: pipelineData } = await pipelineQuery;

    let assignmentsQuery = supabase.from("exam_assignments").select("exam_id, candidate_id").eq("assigned_by", recruiterId);
    if (collegeId) {
      if (collegeCandidateUserIds.length > 0) {
        assignmentsQuery = assignmentsQuery.in("candidate_id", collegeCandidateUserIds);
      } else {
        assignmentsQuery = assignmentsQuery.eq("candidate_id", "00000000-0000-0000-0000-000000000000");
      }
    }
    const { data: assignments } = await assignmentsQuery;

    let attemptsQuery = supabase
      .from("attempts")
      .select("id, exam_id, candidate_id, status, score, started_at, submitted_at, exams:exam_id(title, total_marks, pass_marks), users:candidate_id(name, email)")
      .eq("recruiter_id", recruiterId)
      .order("started_at", { ascending: false });
    if (collegeId) {
      if (collegeCandidateUserIds.length > 0) {
        attemptsQuery = attemptsQuery.in("candidate_id", collegeCandidateUserIds);
      } else {
        attemptsQuery = attemptsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
      }
    }
    const { data: attempts } = await attemptsQuery;

    const { data: exams } = await supabase
      .from("exams")
      .select("id, title, total_marks, pass_marks, created_at, available_from, available_until")
      .eq("created_by", recruiterId);


    const pipelineList = (pipelineData || []).map((item: any) => ({ ...item, jobs: true }));
    const examList = exams || [];
    const assignmentList = assignments || [];
    const attemptList = attempts || [];
    const completedAttempts = attemptList.filter((attempt) => attempt.status === "completed");
    const inProgressAttempts = attemptList.filter((attempt) => attempt.status === "in_progress");
    const passedAttempts = completedAttempts.filter((attempt) => {
      const attemptExam = Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams;
      const passMarks = attemptExam?.pass_marks ?? 0;
      return (attempt.score ?? 0) >= passMarks;
    });

    const completionRate = assignmentList.length
      ? Number(((completedAttempts.length / assignmentList.length) * 100).toFixed(1))
      : 0;

    const averageScore = completedAttempts.length
      ? Number(
          (
            completedAttempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) /
            completedAttempts.length
          ).toFixed(1)
        )
      : 0;

    const passRate = completedAttempts.length
      ? Number(((passedAttempts.length / completedAttempts.length) * 100).toFixed(1))
      : 0;

    const examPerformance = examList.map((exam) => {
      const examAssignments = assignmentList.filter((assignment) => assignment.exam_id === exam.id);
      const examAttempts = attemptList.filter((attempt) => attempt.exam_id === exam.id);
      const examCompleted = examAttempts.filter((attempt) => attempt.status === "completed");
      const examPassed = examCompleted.filter((attempt) => (attempt.score ?? 0) >= exam.pass_marks);

      return {
        examId: exam.id,
        title: exam.title,
        assignedCount: examAssignments.length,
        attemptCount: examAttempts.length,
        completedCount: examCompleted.length,
        averageScore: examCompleted.length
          ? Number(
              (
                examCompleted.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) /
                examCompleted.length
              ).toFixed(1)
            )
          : 0,
        passRate: examCompleted.length
          ? Number(((examPassed.length / examCompleted.length) * 100).toFixed(1))
          : 0,
      };
    });

    const candidatePerformance = candidateList
      .map((candidate) => {
        const candidateAttempts = attemptList.filter((attempt) => attempt.candidate_id === candidate.id);
        const candidateCompleted = candidateAttempts.filter((attempt) => attempt.status === "completed");

        return {
          candidateId: candidate.id,
          name: candidate.name,
          email: candidate.email,
          attempts: candidateAttempts.length,
          completedAttempts: candidateCompleted.length,
          averageScore: candidateCompleted.length
            ? Number(
                (
                  candidateCompleted.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) /
                  candidateCompleted.length
                ).toFixed(1)
              )
            : 0,
        };
      })
      .sort((left, right) => right.averageScore - left.averageScore)
      .slice(0, 6);

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

    const resultSummary = {
      pass: passedAttempts.length,
      fail: Math.max(0, completedAttempts.length - passedAttempts.length),
      inProgress: inProgressAttempts.length,
    };

    const driveAnalytics = driveList.map((drive) => {
      const drivePipeline = pipelineList.filter((item: any) => item.job_id === drive.id);
      const driveAssignments = assignmentList.filter((assignment: any) => {
        const assignmentExam = examList.find((exam) => exam.id === assignment.exam_id);
        return assignmentExam?.id === drive.exam_id;
      });
      const driveAttempts = attemptList.filter((attempt) => driveAssignments.some((assignment: any) => assignment.candidate_id === attempt.candidate_id));
      const driveCompleted = driveAttempts.filter((attempt) => attempt.status === "completed");
      return {
        driveId: drive.id,
        label: drive.title,
        company: drive.company_name,
        registered: drivePipeline.length,
        assigned: driveAssignments.length,
        attempted: driveAttempts.length,
        completed: driveCompleted.length,
        offered: drivePipeline.filter((item: any) => item.status === "offered").length,
      };
    });

    const funnel = [
      { label: "Registered", value: pipelineList.length },
      { label: "Assigned", value: assignmentList.length },
      { label: "Exam Taken", value: completedAttempts.length },
      { label: "Passed", value: passedAttempts.length },
      { label: "Shortlisted", value: pipelineList.filter((item: any) => item.status === "shortlisted").length },
      { label: "Offered", value: pipelineList.filter((item: any) => item.status === "offered").length },
    ];

    const branchMap = new Map<string, { label: string; candidates: number; averageCgpa: number; verified: number }>();
    profileList.forEach((profile) => {
      const current = branchMap.get(profile.branch) || { label: profile.branch, candidates: 0, averageCgpa: 0, verified: 0 };
      current.candidates += 1;
      current.averageCgpa += Number(profile.cgpa || 0);
      current.verified += profile.documents_verified ? 1 : 0;
      branchMap.set(profile.branch, current);
    });
    const branchAnalytics = Array.from(branchMap.values()).map((item) => ({
      ...item,
      averageCgpa: item.candidates ? Number((item.averageCgpa / item.candidates).toFixed(2)) : 0,
    }));

    res.json({
      stats: {
        candidates: candidateList.length,
        drives: driveList.length,
        registered: pipelineList.length,
        offers: pipelineList.filter((item: any) => item.status === "offered").length,
        exams: examList.length,
        assignments: assignmentList.length,
        attempts: attemptList.length,
        completedAttempts: completedAttempts.length,
        inProgressAttempts: inProgressAttempts.length,
        averageScore,
        completionRate,
        passRate,
      },
      examPerformance,
      candidatePerformance,
      driveAnalytics,
      branchAnalytics,
      funnel,
      recentAttempts: attemptList.slice(0, 12),
      recentExams,
      examTrend,
      resultSummary,
    });
  } catch (err) {
    console.error("Recruiter dashboard error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/recruiter/drives/:driveId/ai-config
router.get("/drives/:driveId/ai-config", async (req: AuthRequest, res) => {
  try {
    const { data: drive, error } = await supabase
      .from("jobs")
      .select("id, company_description")
      .eq("id", req.params.driveId)
      .eq("created_by", req.user!.id)
      .single();

    if (error || !drive) {
      res.status(404).json({ error: "Drive not found" });
      return;
    }

    const { aiConfig } = deserializeDriveColleges(drive.company_description);
    res.json({ aiConfig });
  } catch (err) {
    console.error("Fetch AI config error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/recruiter/drives/:driveId/ai-config
router.post("/drives/:driveId/ai-config", async (req: AuthRequest, res) => {
  try {
    const { aiConfig } = req.body;
    if (!aiConfig) {
      res.status(400).json({ error: "aiConfig required" });
      return;
    }

    const { data: drive, error } = await supabase
      .from("jobs")
      .select("id, company_description, college_id")
      .eq("id", req.params.driveId)
      .eq("created_by", req.user!.id)
      .single();

    if (error || !drive) {
      res.status(404).json({ error: "Drive not found" });
      return;
    }

    const collegeIds = getDriveCollegeIds(drive);
    const { description } = deserializeDriveColleges(drive.company_description);

    const updatedDescription = serializeDriveColleges(description, collegeIds, aiConfig);

    const { data, error: updateError } = await supabase
      .from("jobs")
      .update({ company_description: updatedDescription })
      .eq("id", drive.id)
      .select()
      .single();

    if (updateError) {
      res.status(400).json({ error: updateError.message });
      return;
    }

    res.json({ message: "AI Config saved successfully", drive: data });
  } catch (err) {
    console.error("Save AI config error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/recruiter/drives/:driveId/test-evaluation
router.post("/drives/:driveId/test-evaluation", async (req: AuthRequest, res) => {
  try {
    const { question, answer, aiConfig } = req.body;
    if (!question || !answer || !aiConfig) {
      res.status(400).json({ error: "question, answer, and aiConfig are required" });
      return;
    }

    const persona = aiConfig.persona || "";
    const customRubric = aiConfig.rubric || "";
    const examples = aiConfig.examples || [];

    const fallbackScore = Math.max(35, Math.min(95, 35 + answer.trim().split(/\s+/).filter(Boolean).length));

    if (!hasAiKey()) {
      res.json({
        score: fallbackScore,
        feedback: "API key not configured. Fallback grading is active.",
      });
      return;
    }

    const prompt = `
Return only JSON.
You are scoring a test answer for a recruiter's custom AI face-to-face interview model.
${persona ? `Evaluate as this interviewer persona: ${persona}.` : ""}
Score from 0 to 100 for: relevance, technical clarity, communication, specificity, and evidence.
${customRubric ? `Use this specific grading rubric to judge and grade the answer:\n${customRubric}` : "Give one concise actionable feedback sentence."}

${examples && examples.length > 0 ? `
Use the following training examples to understand how you should score and provide feedback for answers:
${examples.map((ex: any, idx: number) => `
Example ${idx + 1}:
Question: ${ex.question}
Answer: ${ex.answer}
Suggested Score: ${ex.score}
Suggested Feedback: ${ex.feedback}
`).join("\n")}
` : ""}

Question: ${question}
Answer: ${answer}

Schema:
{
  "score": 82,
  "feedback": "One concise sentence."
}
`;

    const result = await generateAiJson<{ score?: unknown; feedback?: unknown }>(prompt);
    const score = Number(result.score || fallbackScore);
    const feedback = String(result.feedback || "Good effort.").trim();

    res.json({ score, feedback });
  } catch (err: any) {
    console.error("Test evaluation error:", err);
    res.status(500).json({ error: err.message || "Server error during test evaluation" });
  }
});

export default router;

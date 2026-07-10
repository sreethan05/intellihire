import { recruiterRepository as recruiterRepo } from "../repositories/recruiterRepository.js";
import { recordPipelineStage } from "../lib/postgres.js";
import axios from "axios";
import { aiService } from "../lib/ai.js";
import { sendDriveRegisteredEmail } from "../lib/email.js";
import { logger } from "../lib/logger.js";
import bcrypt from "bcryptjs";
import { getPasswordValidationError } from "../lib/validation.js";
import { PASSWORD_SALT_ROUNDS } from "../lib/constants.js";

const APP_URL = process.env.VITE_API_URL?.replace("/api", "") || "http://localhost:3000";

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
    } catch {
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

const formatDate = (date?: string | null) => 
  date ? new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

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

export async function createCandidate(candidateData: any, recruiterId: string) {
  const { name, email, password } = candidateData;
  const passwordError = getPasswordValidationError(password);
  if (passwordError) {
    throw new Error(passwordError);
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
  return recruiterRepo.createUser({
    name,
    email,
    password_hash: passwordHash,
    role: "candidate",
    created_by: recruiterId,
  });
}

export async function getCandidatesList(page: number, limit: number) {
  const data = await recruiterRepo.getCandidates(page, limit);
  const count = await recruiterRepo.getCandidatesCount();
  return { candidates: data || [], total: count };
}

export async function getCollegesList() {
  const data = await recruiterRepo.getColleges();
  return { colleges: data || [] };
}

export async function getCollegesSummary(recruiterId: string) {
  const colleges = await recruiterRepo.getColleges();
  const jobs = await recruiterRepo.getRecruiterJobs(recruiterId);
  const profiles = await recruiterRepo.getCandidateProfiles();
  
  const jobIds = jobs.map(j => j.id);
  const pipelineList = jobIds.length > 0 
    ? await recruiterRepo.getCandidateStatusByJobIds(jobIds) 
    : [];

  const attemptList = await recruiterRepo.getAttemptsByRecruiter(recruiterId);
  const interviewList = await recruiterRepo.getAiInterviews();

  const summary = (colleges || []).map(college => {
    const collegeJobs = jobs.filter(j => {
      if (j.college_id === college.id) return true;
      const parsed = deserializeDriveColleges(j.company_description);
      return parsed.college_ids.includes(college.id);
    });

    const collegeProfiles = profiles.filter(p => p.college_id === college.id);
    const collegeCandidateIds = collegeProfiles.map(p => p.user_id);
    const collegeCandidateIdsSet = new Set(collegeCandidateIds);

    const collegePipeline = pipelineList.filter(p => collegeCandidateIdsSet.has(p.candidate_id));
    const collegeAttempts = attemptList.filter(a => collegeCandidateIdsSet.has(a.candidate_id));
    const completedAttempts = collegeAttempts.filter(a => a.status === "completed");
    const collegeInterviews = interviewList.filter(i => collegeCandidateIdsSet.has(i.candidate_id));

    const drivesCount = collegeJobs.length;
    const candidatesCount = collegeProfiles.length;
    const registeredCount = collegePipeline.length;
    const attemptsCount = collegeAttempts.length;
    const completedAttemptsCount = completedAttempts.length;
    const passCount = completedAttempts.filter(a => (a.score ?? 0) >= 40).length;
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

  return { colleges: summary };
}

export async function createDrive(driveData: any, recruiterId: string) {
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
  } = driveData;

  const actualCollegeId = college_id || (Array.isArray(college_ids) && college_ids[0]) || null;
  const finalCollegeIds = Array.isArray(college_ids) && college_ids.length > 0 ? college_ids : (actualCollegeId ? [actualCollegeId] : []);

  if (!title || !company_name || !actualCollegeId || !Array.isArray(allowed_branches) || allowed_branches.length === 0) {
    throw new Error("Title, company, college, and branches are required");
  }

  const finalDescription = serializeDriveColleges(company_description || "", finalCollegeIds);

  const drive = await recruiterRepo.insertJob({
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
    created_by: recruiterId,
  });

  const eligible = await findEligibleCandidates(drive);
  if (eligible.length > 0) {
    await recruiterRepo.upsertCandidateStatus(
      eligible.map((candidate) => ({
        job_id: drive.id,
        candidate_id: candidate.user_id,
        status: "registered",
      }))
    );

    for (const candidate of eligible) {
      await recordPipelineStage(
        candidate.user_id,
        drive.id,
        "registered",
        "Auto-registered for drive by eligibility criteria",
        recruiterId
      );
    }

    if (drive.exam_id) {
      await recruiterRepo.upsertExamAssignments(
        eligible.map((candidate) => ({
          exam_id: drive.exam_id,
          candidate_id: candidate.user_id,
          assigned_by: recruiterId,
          job_id: drive.id,
        }))
      );
    }

    for (const candidate of eligible) {
      const user = (candidate as any).user;
      if (user?.email) {
        sendDriveRegisteredEmail(user.email, user.name || "Candidate", title, company_name, APP_URL)
          .catch((err) => logger.error({ err, userId: user.id }, "Failed to send drive registration email"));
      }
    }
  }

  const parsedDesc = deserializeDriveColleges(drive.company_description);
  let collegesList: any[] = [];
  if (finalCollegeIds.length > 0) {
    collegesList = await recruiterRepo.getCollegesByIds(finalCollegeIds);
  }

  return {
    drive: {
      ...drive,
      company_description: parsedDesc.description,
      college_ids: parsedDesc.college_ids,
      colleges: collegesList
    },
    eligibleCount: eligible.length
  };
}

export async function getDrivesList(recruiterId: string, page?: number, limit?: number) {
  const { jobs: drives, total } = await recruiterRepo.getJobsByRecruiter(recruiterId, page, limit);
  const allCollegeIdsSet = new Set<string>();
  drives.forEach((drive: any) => {
    const ids = getDriveCollegeIds(drive);
    ids.forEach(id => allCollegeIdsSet.add(id));
    if (drive.college_id) allCollegeIdsSet.add(drive.college_id);
  });

  const allCollegeIds = Array.from(allCollegeIdsSet);
  const collegesMap: Record<string, any> = {};
  if (allCollegeIds.length > 0) {
    const collegesList = await recruiterRepo.getCollegesByIds(allCollegeIds);
    collegesList.forEach((c: any) => {
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

  return { drives: enrichedDrives, total };
}

export async function getEligibleCandidates(driveId: string, recruiterId: string) {
  const drive = await recruiterRepo.getJobByIdAndRecruiter(driveId, recruiterId);
  if (!drive) {
    throw new Error("Drive not found");
  }
  const eligible = await findEligibleCandidates(drive);
  return { candidates: eligible, count: eligible.length };
}

export async function assignExam(driveId: string, examId: string, recruiterId: string) {
  const drive = await recruiterRepo.getJobByIdAndRecruiter(driveId, recruiterId);
  if (!drive) {
    throw new Error("Drive not found");
  }

  const eligible = await findEligibleCandidates(drive);
  await recruiterRepo.updateJob(drive.id, { exam_id: examId });

  const data = await recruiterRepo.upsertExamAssignments(
    eligible.map((candidate) => ({
      exam_id: examId,
      candidate_id: candidate.user_id,
      assigned_by: recruiterId,
      job_id: drive.id,
    }))
  );

  return { message: `${data?.length || 0} eligible candidate(s) assigned`, assignments: data || [] };
}

export async function getDashboardData(recruiterId: string, collegeId?: string) {
  const drives = await recruiterRepo.getJobsForDashboard(recruiterId);

  let driveList = drives || [];
  if (collegeId) {
    driveList = driveList.filter((d: any) => {
      if (d.college_id === collegeId) return true;
      const parsed = deserializeDriveColleges(d.company_description);
      return parsed.college_ids.includes(collegeId);
    });
  }
  const driveIds = driveList.map(d => d.id);

  const profiles = await recruiterRepo.getCandidateProfilesByCollege(collegeId);
  const collegeCandidateUserIds = profiles.map(p => p.user_id);

  const candidates = await recruiterRepo.getUsersForDashboard(collegeId ? collegeCandidateUserIds : undefined);
  const candidateList = candidates || [];

  const pipelineData = await recruiterRepo.getCandidateStatusForDashboard(driveIds, collegeId ? collegeCandidateUserIds : undefined);
  const assignments = await recruiterRepo.getAssignmentsForDashboard(recruiterId, collegeId ? collegeCandidateUserIds : undefined);
  const attempts = await recruiterRepo.getAttemptsForDashboard(recruiterId, collegeId ? collegeCandidateUserIds : undefined);
  const exams = await recruiterRepo.getExamsByRecruiter(recruiterId);

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
  profiles.forEach((profile) => {
    const branchName = profile.branch || "Unknown";
    const current = branchMap.get(branchName) || { label: branchName, candidates: 0, averageCgpa: 0, verified: 0 };
    current.candidates += 1;
    current.averageCgpa += Number(profile.cgpa || 0);
    current.verified += profile.documents_verified ? 1 : 0;
    branchMap.set(branchName, current);
  });
  const branchAnalytics = Array.from(branchMap.values()).map((item) => ({
    ...item,
    averageCgpa: item.candidates ? Number((item.averageCgpa / item.candidates).toFixed(2)) : 0,
  }));

  return {
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
  };
}

export async function getAiConfig(driveId: string, recruiterId: string) {
  const drive = await recruiterRepo.getJobByIdAndRecruiter(driveId, recruiterId);
  if (!drive) {
    throw new Error("Drive not found");
  }
  const { aiConfig } = deserializeDriveColleges(drive.company_description);
  return { aiConfig };
}

export async function saveAiConfig(driveId: string, aiConfig: any, recruiterId: string) {
  const drive = await recruiterRepo.getJobByIdAndRecruiter(driveId, recruiterId);
  if (!drive) {
    throw new Error("Drive not found");
  }

  const collegeIds = getDriveCollegeIds(drive);
  const { description } = deserializeDriveColleges(drive.company_description);
  const updatedDescription = serializeDriveColleges(description, collegeIds, aiConfig);

  const updatedDrive = await recruiterRepo.updateJob(drive.id, { company_description: updatedDescription });
  return { drive: updatedDrive };
}

export async function getCompareCandidates(candidateIds: string[]) {
  const results: any[] = [];
  for (const cid of candidateIds) {
    const user = await recruiterRepo.getUserById(cid);
    const profile = await recruiterRepo.getCandidateProfileByUserId(cid);
    const attempts = await recruiterRepo.getAttemptsByCandidateId(cid);
    const interviews = await recruiterRepo.getInterviewsByCandidateId(cid);

    const avgExamScore = attempts.length
      ? Math.round(attempts.reduce((sum, a) => sum + (a.score || 0), 0) / attempts.length)
      : 0;
      
    const avgCommScore = interviews.length
      ? Math.round(interviews.reduce((sum, i) => sum + (i.communication_score || 0), 0) / interviews.length)
      : 0;
      
    const avgTechScore = interviews.length
      ? Math.round(interviews.reduce((sum, i) => sum + (i.technical_score || 0), 0) / interviews.length)
      : 0;
      
    results.push({
      candidateId: cid,
      name: user?.name || "Candidate",
      rollNumber: user?.roll_number || "",
      branch: profile?.branch || "Unknown",
      cgpa: profile?.cgpa || 0,
      skills: profile?.skills || [],
      avgExamScore,
      avgCommScore,
      avgTechScore,
      proctorFlags: 0
    });
  }
  return { comparison: results };
}

export async function generateAiShortlist(criteria: string) {
  const profiles = await recruiterRepo.getCandidateProfilesForShortlist();
  if (!profiles || profiles.length === 0) {
    return { shortlist: [] };
  }

  const candidatesSummary: any[] = [];
  for (const p of profiles) {
    const attempts = await recruiterRepo.getAttemptsByCandidateId(p.user_id);
    const interviews = await recruiterRepo.getInterviewsByCandidateId(p.user_id);

    const avgExamScore = attempts.length
      ? Math.round(attempts.reduce((sum, a) => sum + (a.score || 0), 0) / attempts.length)
      : 0;

    const avgCommScore = interviews.length
      ? Math.round(interviews.reduce((sum, i) => sum + (i.communication_score || 0), 0) / interviews.length)
      : 0;

    candidatesSummary.push({
      id: p.user_id,
      name: p.user?.name || "Unknown",
      cgpa: p.cgpa,
      skills: p.skills || [],
      avgExamScore,
      avgCommScore,
      branch: p.branch
    });
  }

  const systemPrompt = `You are an AI recruiting assistant. Analyze the candidate pool and select the best matches according to the recruiter's criteria. Return a JSON object containing a 'shortlist' array.`;
  const userPrompt = `
Recruiter Shortlist Criteria: "${criteria}"

Candidate Pool:
${JSON.stringify(candidatesSummary, null, 2)}

Return a JSON object in this format:
{
  "shortlist": [
    {
      "candidate_id": "UUID",
      "name": "Candidate Name",
      "rank": 1,
      "justification": "Why selected based on the criteria"
    }
  ]
}
`;

  const result = await aiService.generateAiJson<{ shortlist: any[] }>({ systemPrompt, userPrompt });
  return { shortlist: result.shortlist || [] };
}

export async function uploadOfferLetter(candidateId: string, jobId: string, filename: string, recruiterId: string) {
  const offerLetterUrl = `/uploads/offers/${filename}`;

  const status = await recruiterRepo.updateCandidateStatus(candidateId, jobId, {
    status: "offered",
    offer_letter_url: offerLetterUrl,
    updated_at: new Date().toISOString(),
  });

  await recordPipelineStage(
    candidateId,
    jobId,
    "offered",
    "Offer Letter extended by recruiter",
    recruiterId
  );

  axios.post("http://127.0.0.1:5000/internal/notify", {
    userId: candidateId,
    payload: {
      title: "New Job Offer Extended! 🎉",
      body: "You have received a new job offer with an attached letter. Go to your command center to review it.",
      type: "offer_received",
      metadata: { jobId }
    }
  }).catch((err) => {
    logger.error({ err }, "Failed to send realtime notification via Python gateway");
  });

  await recruiterRepo.insertActivityLog({
    actor_id: recruiterId,
    actor_role: "recruiter",
    target_user_id: candidateId,
    type: "offer_made",
    title: "Job Offer Extended",
    description: "A recruiter has extended a job offer with an attached letter.",
    metadata: { job_id: jobId, offer_letter_url: offerLetterUrl },
  });

  return { status };
}

async function findEligibleCandidates(drive: any) {
  const branches = Array.isArray(drive.allowed_branches) ? drive.allowed_branches : [];
  const collegeIds = getDriveCollegeIds(drive);
  if (collegeIds.length === 0) return [];

  return recruiterRepo.getCandidatesForEligibility(
    collegeIds,
    Number(drive.min_cgpa || 0),
    branches.map((b: string) => b.toUpperCase())
  );
}

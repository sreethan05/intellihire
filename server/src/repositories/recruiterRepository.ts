import { db } from "../lib/postgres.js";

export async function getCandidates(page: number, limit: number) {
  const fromOffset = (page - 1) * limit;
  const toOffset = fromOffset + limit - 1;
  const { data, error } = await db
    .from("users")
    .select("id, name, email, roll_number, college_id, profile_complete")
    .eq("role", "candidate")
    .order("created_at", { ascending: false })
    .range(fromOffset, toOffset);
  if (error) throw error;
  return data;
}

export async function getCandidatesCount() {
  const { count, error } = await db
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("role", "candidate");
  if (error) throw error;
  return count || 0;
}

export async function getColleges() {
  const { data, error } = await db
    .from("colleges")
    .select("id, name, code, location, created_at")
    .order("name");
  if (error) throw error;
  return data;
}

export async function getRecruiterJobs(recruiterId: string) {
  const { data, error } = await db
    .from("jobs")
    .select("id, title, company_name, college_id, company_description, status")
    .eq("created_by", recruiterId);
  if (error) throw error;
  return data || [];
}

export async function getCandidateProfiles() {
  const { data, error } = await db
    .from("candidate_profiles")
    .select("user_id, college_id, cgpa, branch, profile_complete, documents_verified");
  if (error) throw error;
  return data || [];
}

export async function getCandidateProfilesByCollege(collegeId?: string) {
  let query = db.from("candidate_profiles").select("id, user_id, branch, cgpa, profile_complete, documents_verified, college_id");
  if (collegeId) {
    query = query.eq("college_id", collegeId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getCandidateStatusByJobIds(jobIds: string[]) {
  const { data, error } = await db
    .from("candidate_status")
    .select("job_id, candidate_id, status")
    .in("job_id", jobIds);
  if (error) throw error;
  return data || [];
}

export async function getAttemptsByRecruiter(recruiterId: string) {
  const { data, error } = await db
    .from("attempts")
    .select("id, exam_id, candidate_id, score, status, submitted_at")
    .eq("recruiter_id", recruiterId);
  if (error) throw error;
  return data || [];
}

export async function getAiInterviews() {
  const { data, error } = await db
    .from("ai_interviews")
    .select("id, candidate_id, score, status");
  if (error) throw error;
  return data || [];
}

export async function createUser(userData: any) {
  const { data, error } = await db
    .from("users")
    .insert(userData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function insertJob(jobData: any) {
  const { data, error } = await db
    .from("jobs")
    .insert(jobData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function upsertCandidateStatus(statusList: any[]) {
  const { error } = await db.from("candidate_status").upsert(statusList, {
    onConflict: "job_id,candidate_id",
    ignoreDuplicates: true,
  });
  if (error) throw error;
}

export async function upsertExamAssignments(assignments: any[]) {
  const { data, error } = await db.from("exam_assignments").upsert(assignments, {
    onConflict: "exam_id,candidate_id",
    ignoreDuplicates: true,
  }).select();
  if (error) throw error;
  return data;
}

export async function getCollegesByIds(collegeIds: string[]) {
  const { data, error } = await db
    .from("colleges")
    .select("id, name, code, location")
    .in("id", collegeIds);
  if (error) throw error;
  return data || [];
}

export async function getJobsByRecruiter(recruiterId: string) {
  const { data, error } = await db
    .from("jobs")
    .select("*, college:college_id(id, name, code), exam:exam_id(id, title)")
    .eq("created_by", recruiterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getJobsForDashboard(recruiterId: string) {
  const { data, error } = await db
    .from("jobs")
    .select("id, title, company_name, college_id, min_cgpa, allowed_branches, status, drive_date, exam_id, company_description")
    .eq("created_by", recruiterId);
  if (error) throw error;
  return data || [];
}

export async function getJobByIdAndRecruiter(jobId: string, recruiterId: string) {
  const { data, error } = await db
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("created_by", recruiterId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateJob(jobId: string, updateData: any) {
  const { data, error } = await db
    .from("jobs")
    .update(updateData)
    .eq("id", jobId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getCandidatesForEligibility(collegeIds: string[], minCgpa: number, branches: string[]) {
  let query = db
    .from("candidate_profiles")
    .select("*, user:user_id(id, name, email, roll_number, profile_complete)")
    .in("college_id", collegeIds)
    .gte("cgpa", minCgpa);

  if (branches.length > 0) {
    query = query.in("branch", branches);
  }

  const { data, error } = await query.order("cgpa", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getUsersForDashboard(collegeCandidateUserIds?: string[]) {
  let query = db.from("users").select("id, name, email, created_at").eq("role", "candidate");
  if (collegeCandidateUserIds && collegeCandidateUserIds.length > 0) {
    query = query.in("id", collegeCandidateUserIds);
  } else if (collegeCandidateUserIds) {
    query = query.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getCandidateStatusForDashboard(driveIds: string[], collegeCandidateUserIds?: string[]) {
  let query = db.from("candidate_status").select("id, job_id, candidate_id, status");
  if (driveIds.length > 0) {
    query = query.in("job_id", driveIds);
  } else {
    query = query.in("job_id", ["00000000-0000-0000-0000-000000000000"]);
  }
  if (collegeCandidateUserIds && collegeCandidateUserIds.length > 0) {
    query = query.in("candidate_id", collegeCandidateUserIds);
  } else if (collegeCandidateUserIds) {
    query = query.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getAssignmentsForDashboard(recruiterId: string, collegeCandidateUserIds?: string[]) {
  let query = db.from("exam_assignments").select("exam_id, candidate_id").eq("assigned_by", recruiterId);
  if (collegeCandidateUserIds && collegeCandidateUserIds.length > 0) {
    query = query.in("candidate_id", collegeCandidateUserIds);
  } else if (collegeCandidateUserIds) {
    query = query.eq("candidate_id", "00000000-0000-0000-0000-000000000000");
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getAttemptsForDashboard(recruiterId: string, collegeCandidateUserIds?: string[]) {
  let query = db
    .from("attempts")
    .select("id, exam_id, candidate_id, status, score, started_at, submitted_at, exams:exam_id(title, total_marks, pass_marks), users:candidate_id(name, email)")
    .eq("recruiter_id", recruiterId)
    .order("started_at", { ascending: false });
  if (collegeCandidateUserIds && collegeCandidateUserIds.length > 0) {
    query = query.in("candidate_id", collegeCandidateUserIds);
  } else if (collegeCandidateUserIds) {
    query = query.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getExamsByRecruiter(recruiterId: string) {
  const { data, error } = await db
    .from("exams")
    .select("id, title, total_marks, pass_marks, created_at, available_from, available_until")
    .eq("created_by", recruiterId);
  if (error) throw error;
  return data || [];
}

export async function getUserById(userId: string) {
  const { data, error } = await db.from("users")
    .select("id, name, email, roll_number")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function getCandidateProfileByUserId(userId: string) {
  const { data, error } = await db.from("candidate_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAttemptsByCandidateId(candidateId: string) {
  const { data, error } = await db.from("attempts")
    .select("score, status")
    .eq("candidate_id", candidateId)
    .eq("status", "completed");
  if (error) throw error;
  return data || [];
}

export async function getInterviewsByCandidateId(candidateId: string) {
  const { data, error } = await db.from("ai_interviews")
    .select("communication_score, technical_score, speaking_score")
    .eq("candidate_id", candidateId)
    .eq("status", "completed");
  if (error) throw error;
  return data || [];
}

export async function getCandidateProfilesForShortlist() {
  const { data, error } = await db.from("candidate_profiles")
    .select("*, user:user_id(name, email, roll_number)");
  if (error) throw error;
  return data || [];
}

export async function updateCandidateStatus(candidateId: string, jobId: string, updateData: any) {
  const { data, error } = await db
    .from("candidate_status")
    .update(updateData)
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function insertActivityLog(activity: any) {
  const { error } = await db.from("activity_feed").insert(activity);
  if (error) throw error;
}

export const recruiterRepository = {
  getCandidates,
  getCandidatesCount,
  getColleges,
  getRecruiterJobs,
  getCandidateProfiles,
  getCandidateProfilesByCollege,
  getCandidateStatusByJobIds,
  getAttemptsByRecruiter,
  getAiInterviews,
  createUser,
  insertJob,
  upsertCandidateStatus,
  upsertExamAssignments,
  getCollegesByIds,
  getJobsByRecruiter,
  getJobsForDashboard,
  getJobByIdAndRecruiter,
  updateJob,
  getCandidatesForEligibility,
  getUsersForDashboard,
  getCandidateStatusForDashboard,
  getAssignmentsForDashboard,
  getAttemptsForDashboard,
  getExamsByRecruiter,
  getUserById,
  getCandidateProfileByUserId,
  getAttemptsByCandidateId,
  getInterviewsByCandidateId,
  getCandidateProfilesForShortlist,
  updateCandidateStatus,
  insertActivityLog,
};

import { db } from "../lib/postgres.js";

export async function getAttemptsByCandidate(candidateId: string, examId?: string) {
  let query = db
    .from("attempts")
    .select("id, exam_id, score, submitted_at, exams:exam_id(id, title, description, total_marks, pass_marks)")
    .eq("candidate_id", candidateId)
    .eq("status", "completed")
    .order("submitted_at", { ascending: false });

  if (examId) {
    query = query.eq("exam_id", examId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getQuestionsCount() {
  const { count, error } = await db.from("questions").select("*", { count: "exact", head: true });
  if (error) throw error;
  return count || 0;
}

export async function getInterviewById(interviewId: string) {
  const { data, error } = await db
    .from("ai_interviews")
    .select("*, jobs(*)")
    .eq("id", interviewId)
    .single();
  if (error) throw error;
  return data;
}

export async function getJobById(jobId: string) {
  const { data, error } = await db
    .from("jobs")
    .select("id, title, company_name, company_description, required_skills, interview_pass_score")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getInterviewAnswers(interviewId: string) {
  const { data, error } = await db
    .from("ai_interview_answers")
    .select("*")
    .eq("interview_id", interviewId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getPendingInterviews(candidateId: string) {
  const { data, error } = await db
    .from("ai_interviews")
    .select("*, jobs(title, company_name)")
    .eq("candidate_id", candidateId)
    .eq("status", "scheduled")
    .order("scheduled_start", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getRecruiterPendingInterviews(_recruiterId: string) {
  const { data, error } = await db
    .from("ai_interviews")
    .select("*, users:candidate_id(id, name, email), jobs:job_id(title)")
    .in("status", ["scheduled", "completed"])
    .order("scheduled_start", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function insertInterview(interview: any) {
  const { data, error } = await db
    .from("ai_interviews")
    .insert(interview)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInterview(interviewId: string, updateData: any) {
  const { data, error } = await db
    .from("ai_interviews")
    .update(updateData)
    .eq("id", interviewId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function insertInterviewAnswer(answer: any) {
  const { data, error } = await db
    .from("ai_interview_answers")
    .insert(answer)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getInterviewsByCandidate(candidateId: string) {
  const { data, error } = await db
    .from("ai_interviews")
    .select("*, jobs(title, company_name)")
    .eq("candidate_id", candidateId)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getCompletedInterviewsByRecruiterJobs(jobIds: string[]) {
  const { data, error } = await db
    .from("ai_interviews")
    .select("*, users:candidate_id(id, name, email, roll_number), jobs:job_id(title, company_name)")
    .eq("status", "completed")
    .in("job_id", jobIds)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getCandidateProfile(userId: string) {
  const { data, error } = await db
    .from("candidate_profiles")
    .select("skills, domain_preference")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getInterviewSummaries(role: string, userId: string, collegeId?: string) {
  let query = db
    .from("ai_interviews")
    .select("*, candidate:candidate_id(id, name, email), job:job_id(title, company_name), exam:exam_id(title)")
    .order("started_at", { ascending: false });

  if (role === "recruiter") {
    // 1. Fetch exam IDs created by this recruiter
    const { data: exams } = await db
      .from("exams")
      .select("id")
      .eq("created_by", userId);
    const examIds = (exams || []).map((e) => e.id);

    // 2. Fetch job IDs created by this recruiter
    const { data: jobs } = await db
      .from("jobs")
      .select("id")
      .eq("created_by", userId);
    const jobIds = (jobs || []).map((j) => j.id);

    if (examIds.length === 0 && jobIds.length === 0) {
      return [];
    }

    const conditions: string[] = [];
    if (examIds.length > 0) {
      conditions.push(`exam_id.in.(${examIds.join(",")})`);
    }
    if (jobIds.length > 0) {
      conditions.push(`job_id.in.(${jobIds.join(",")})`);
    }

    query = query.or(conditions.join(","));
  }

  if (collegeId) {
    const { data: profiles } = await db
      .from("candidate_profiles")
      .select("user_id")
      .eq("college_id", collegeId);
    const userIds = (profiles || []).map(p => p.user_id);
    if (userIds.length === 0) {
      return [];
    }
    query = query.in("candidate_id", userIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export const interviewRepository = {
  getAttemptsByCandidate,
  getQuestionsCount,
  getInterviewById,
  getJobById,
  getInterviewAnswers,
  getPendingInterviews,
  getRecruiterPendingInterviews,
  insertInterview,
  updateInterview,
  insertInterviewAnswer,
  getInterviewsByCandidate,
  getCompletedInterviewsByRecruiterJobs,
  getCandidateProfile,
  getInterviewSummaries,
};

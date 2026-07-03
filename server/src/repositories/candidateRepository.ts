import { db } from "../lib/postgres.js";

export async function findPublicPortfolio(slug: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

  let query = db.from("candidate_profiles")
    .select("id, user_id, photo_url, branch, cgpa, graduation_year, skills, resume_url, documents_verified, public_portfolio_slug, github_url, linkedin_url, portfolio_url, bio, projects, semester_grades, user:user_id(name), college:college_id(name, code)");

  if (isUuid) {
    query = query.eq("user_id", slug);
  } else {
    query = query.eq("public_portfolio_slug", slug);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCandidateAnswers(userId: string) {
  const { data, error } = await db.from("answers")
    .select("*, question:question_id(topic), attempt:attempt_id(candidate_id)")
    .eq("attempt.candidate_id", userId);
  if (error) throw error;
  return data;
}

export async function getCompletedInterviews(userId: string) {
  const { data, error } = await db.from("ai_interviews")
    .select("communication_score")
    .eq("candidate_id", userId)
    .eq("status", "completed");
  if (error) throw error;
  return data;
}

export async function getCodingSubmissions(userId: string) {
  const { data, error } = await db.from("coding_submissions")
    .select("score, coding_questions(marks), attempt:attempt_id(candidate_id)")
    .eq("attempt.candidate_id", userId)
    .eq("status", "tested");
  if (error) throw error;
  return data;
}

export async function getCandidateApplications(userId: string) {
  const { data, error } = await db.from("candidate_status")
    .select("id, status, updated_at, job:job_id(title, company_name)")
    .eq("candidate_id", userId);
  if (error) throw error;
  return data;
}

export async function getUserById(userId: string) {
  const { data, error } = await db.from("users")
    .select("id, name, email, roll_number, college_id, profile_complete, must_change_password")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function getProfileByUserId(userId: string) {
  const { data, error } = await db.from("candidate_profiles")
    .select("*, college:college_id(id, name, code)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId: string, profileData: any) {
  const { data, error } = await db.from("candidate_profiles")
    .update({ ...profileData, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateUser(userId: string, userData: any) {
  const { data, error } = await db.from("users")
    .update(userData)
    .eq("id", userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getExamAssignments(userId: string) {
  const { data, error } = await db.from("exam_assignments")
    .select("*, exam:exam_id(id, title, description, duration, total_marks, pass_marks, available_from, available_until, status, shuffle_questions, negative_marking, created_at)")
    .eq("candidate_id", userId);
  if (error) throw error;
  return data;
}

export async function getAttemptsByExamIds(userId: string, examIds: string[]) {
  const { data, error } = await db.from("attempts")
    .select("id, exam_id, status, score, started_at, submitted_at")
    .eq("candidate_id", userId)
    .order("started_at", { ascending: false })
    .in("exam_id", examIds);
  if (error) throw error;
  return data;
}

export async function getLeaderboardAttempts(examIds: string[]) {
  const { data, error } = await db.from("attempts")
    .select("candidate_id, score, status, submitted_at, users:candidate_id(id, name, email), exams:exam_id(total_marks)")
    .eq("status", "completed")
    .in("exam_id", examIds);
  if (error) throw error;
  return data;
}

export const candidateRepository = {
  findPublicPortfolio,
  getCandidateAnswers,
  getCompletedInterviews,
  getCodingSubmissions,
  getCandidateApplications,
  getUserById,
  getProfileByUserId,
  updateProfile,
  updateUser,
  getExamAssignments,
  getAttemptsByExamIds,
  getLeaderboardAttempts,
};

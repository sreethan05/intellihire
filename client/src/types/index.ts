export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "tpo" | "recruiter" | "candidate";
  roll_number?: string | null;
  college_id?: string | null;
  profile_complete?: boolean;
  must_change_password?: boolean;
}

export interface College {
  id: string;
  name: string;
  code: string;
  location?: string | null;
  created_at: string;
}

export interface CandidateProfile {
  id: string;
  user_id: string;
  college_id: string;
  roll_number: string;
  branch: string;
  cgpa: number;
  graduation_year: number;
  phone?: string | null;
  skills?: string[] | null;
  domain_preference?: string | null;
  marksheet_url?: string | null;
  resume_url?: string | null;
  documents_verified?: boolean;
  profile_complete?: boolean;
}

export interface JobDrive {
  id: string;
  title: string;
  company_name: string;
  company_description?: string | null;
  college_id: string;
  min_cgpa: number;
  allowed_branches: string[];
  required_skills: string[];
  salary_min?: number | null;
  salary_max?: number | null;
  drive_date?: string | null;
  exam_id?: string | null;
  interview_pass_score?: number | null;
  status: string;
  created_by: string;
  created_at: string;
  college?: College;
}

export interface Exam {
  id: string;
  title: string;
  description: string | null;
  duration: number;
  total_marks: number;
  pass_marks: number;
  available_from?: string | null;
  available_until?: string | null;
  status?: "draft" | "published" | "closed" | string;
  shuffle_questions?: boolean;
  negative_marking?: number;
  created_by: string;
  created_at: string;
}

export interface Question {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  marks: number;
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  question_id: string;
  marks: number;
  question: Question;
}

export interface CodingQuestion {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  starter_code: string;
  test_cases: TestCase[];
  marks: number;
}

export interface TestCase {
  input: string;
  expected_output: string;
}

export interface ExamCodingQuestion {
  id: string;
  exam_id: string;
  coding_question_id: string;
  marks: number;
  question: CodingQuestion;
}

export interface ExamAssignment {
  id: string;
  exam_id: string;
  candidate_id: string;
  assigned_by: string;
  assigned_at: string;
  exam: Exam;
  attempts?: Attempt[];
}

export interface Attempt {
  id: string;
  exam_id: string;
  candidate_id: string;
  recruiter_id: string;
  status: string;
  score: number | null;
  started_at: string;
  submitted_at: string | null;
  exam?: Exam;
  exams?: { title: string; total_marks?: number; pass_marks?: number };
  users?: { name: string; email: string };
}

export interface InterviewStageResult {
  intro_score: number;
  speaking_score: number;
  pronunciation_score: number;
  technical_score: number;
  selected: boolean;
}

export interface Answer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_option: string;
  is_correct: boolean;
  marks_obtained: number;
}

export interface CodingSubmission {
  id: string;
  attempt_id: string;
  coding_question_id: string;
  code: string;
  language: string;
  score: number;
  status: string;
}

export interface DashboardStats {
  recruiters?: number;
  tpos?: number;
  colleges?: number;
  drives?: number;
  registered?: number;
  offers?: number;
  profileComplete?: number;
  documentsVerified?: number;
  candidates?: number;
  exams?: number;
  attempts?: number;
  assignments?: number;
  completedAttempts?: number;
  inProgressAttempts?: number;
  pendingAssignments?: number;
  averageScore?: number;
  passRate?: number;
  completionRate?: number;
  bestScore?: number;
  passCount?: number;
  assigned?: number;
  completed?: number;
  inProgress?: number;
  pending?: number;
  rank?: number;
  totalRanked?: number;
  averagePercentage?: number;
}

export interface DashboardListItem {
  id: string;
  title: string;
  subtitle: string;
  meta?: string;
  tone?: "blue" | "violet" | "green" | "amber" | "rose" | "cyan";
  status?: string;
  score?: number;
  percentage?: number;
  date?: string | null;
  examId?: string;
  candidateId?: string;
  candidateName?: string;
  candidateEmail?: string;
}

export interface DashboardTrendPoint {
  [key: string]: string | number | undefined;
  month: string;
  score?: number;
  created?: number;
  conducted?: number;
}

export interface LeaderboardItem {
  candidateId: string;
  name: string;
  email?: string;
  attempts: number;
  completedAttempts: number;
  averageScore: number;
  averagePercentage?: number;
  rank?: number;
}

export interface DashboardMetric {
  label: string;
  value: number;
}

export interface AdminRecruiterSnapshot {
  id: string;
  name: string;
  email: string;
  created_at?: string;
  candidateCount: number;
  examCount: number;
  attemptCount: number;
  completedCount: number;
}

export interface RecruiterExamPerformance {
  examId: string;
  title: string;
  assignedCount: number;
  attemptCount: number;
  completedCount: number;
  averageScore: number;
  passRate: number;
}

export interface RecruiterCandidatePerformance {
  candidateId: string;
  name: string;
  email: string;
  attempts: number;
  completedAttempts: number;
  averageScore: number;
}

export interface CandidatePerformanceItem {
  examId: string;
  title: string;
  score: number;
  totalMarks: number;
  passMarks: number;
  percentage: number;
  submittedAt: string | null;
  status: "pass" | "fail";
}

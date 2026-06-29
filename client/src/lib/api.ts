import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;

export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
};

export const adminApi = {
  createRecruiter: (data: { name: string; email: string; password: string }) =>
    api.post("/admin/create-recruiter", data),
  createTpo: (data: { name: string; email: string; password: string; college_name: string; college_code: string; location?: string }) =>
    api.post("/admin/create-tpo", data),
  getRecruiters: () => api.get("/admin/recruiters"),
  getTpos: () => api.get("/admin/tpos"),
  getDashboard: () => api.get("/admin/dashboard"),
};

export const recruiterApi = {
  createCandidate: (data: { name: string; email: string; password: string }) =>
    api.post("/recruiter/create-candidate", data),
  getCandidates: () => api.get("/recruiter/candidates"),
  getDashboard: (collegeId?: string | null) =>
    api.get("/recruiter/dashboard", { params: collegeId ? { collegeId } : undefined }),
  getColleges: () => api.get("/recruiter/colleges"),
  createDrive: (data: {
    title: string;
    company_name: string;
    company_description?: string;
    college_id: string;
    college_ids?: string[];
    min_cgpa: number;
    allowed_branches: string[];
    required_skills: string[];
    salary_min?: number;
    salary_max?: number;
    drive_date?: string;
    exam_id?: string;
    interview_pass_score?: number;
    interview_duration?: number;
  }) => api.post("/recruiter/drives", data),
  getDrives: () => api.get("/recruiter/drives"),
  getDriveEligibleCandidates: (driveId: string) => api.get(`/recruiter/drives/${driveId}/eligible-candidates`),
  assignDriveExam: (driveId: string, exam_id: string) => api.post(`/recruiter/drives/${driveId}/assign-exam`, { exam_id }),
  getDriveAiConfig: (driveId: string) => api.get(`/recruiter/drives/${driveId}/ai-config`),
  saveDriveAiConfig: (driveId: string, aiConfig: any) => api.post(`/recruiter/drives/${driveId}/ai-config`, { aiConfig }),
  testDriveAiConfig: (driveId: string, data: { question: string; answer: string; aiConfig: any }) =>
    api.post(`/recruiter/drives/${driveId}/test-evaluation`, data),
};

export const tpoApi = {
  getDashboard: () => api.get("/tpo/dashboard"),
  scanMarksheets: (files: Array<{ name: string; mimeType: string; data: string }>) =>
    api.post("/tpo/scan-marksheets", { files }),
  uploadStudents: (rows: Array<{ roll_number: string; name: string; branch: string; cgpa: number; graduation_year: number; email?: string }>) =>
    api.post("/tpo/upload-students", { rows }),
  getStudents: () => api.get("/tpo/students"),
  verifyDocuments: (candidate_profile_id: string, documents_verified: boolean) =>
    api.patch(`/tpo/students/${candidate_profile_id}/verification`, { documents_verified }),
};

export const examApi = {
  createExam: (data: {
    title: string;
    description: string;
    duration: number;
    total_marks: number;
    pass_marks: number;
    available_from?: string;
    available_until?: string;
    status?: "draft" | "published" | "closed";
    shuffle_questions?: boolean;
    negative_marking?: number;
  }) => api.post("/exam/create", data),
  addQuestions: (data: {
    exam_id: string;
    questions: Array<{
      question_text: string;
      option_a: string;
      option_b: string;
      option_c: string;
      option_d: string;
      correct_option: string;
      marks: number;
    }>;
  }) => api.post("/exam/add-questions", data),
  addCodingQuestions: (data: {
    exam_id: string;
    coding_questions: Array<{
      title: string;
      description: string;
      difficulty: string;
      starter_code: string;
      test_cases: Array<{ input: string; expected_output: string }>;
      marks: number;
    }>;
  }) => api.post("/exam/add-coding-questions", data),
  assignExam: (data: { exam_id: string; candidate_ids: string[] }) =>
    api.post("/exam/assign", data),
  getExams: () => api.get("/exam/list"),
  getExam: (examId: string) => api.get(`/exam/${examId}`),
  getBankMcq: () => api.get("/exam/bank/mcq"),
  getBankCoding: () => api.get("/exam/bank/coding"),
  linkBankMcq: (data: { exam_id: string; question_ids: string[] }) =>
    api.post("/exam/bank/link-mcq", data),
  linkBankCoding: (data: { exam_id: string; coding_question_ids: string[] }) =>
    api.post("/exam/bank/link-coding", data),
  saveBankMcqs: (questions: any[]) => api.post("/exam/bank/add-mcqs", { questions }),
  saveBankCoding: (question: any) => api.post("/exam/bank/add-coding", { question }),
};

export const candidateApi = {
  getDashboard: () => api.get("/candidate/dashboard"),
  getExams: () => api.get("/candidate/exams"),
  getExam: (examId: string) => api.get(`/candidate/exam/${examId}`),
  getProfile: () => api.get("/candidate/profile"),
  completeOnboarding: (data: {
    password: string;
    phone: string;
    skills: string[];
    domain_preference: string;
    marksheet_url?: string;
    resume_url?: string;
  }) => api.post("/candidate/onboarding", data),
};

export const resultApi = {
  submitMcq: (data: {
    attempt_id: string;
    question_id: string;
    selected_option: string;
  }) => api.post("/result/submit-mcq", data),
  submitCode: (data: {
    attempt_id: string;
    coding_question_id: string;
    code: string;
    language: string;
  }) => api.post("/result/submit-code", data),
  submitExam: (attempt_id: string) =>
    api.post("/result/submit-exam", { attempt_id }),
  updateCodeScore: (data: {
    attempt_id: string;
    coding_question_id: string;
    score: number;
    code: string;
    language: string;
  }) => api.post("/result/update-code-score", data),
  getAllResults: (collegeId?: string | null) =>
    api.get("/result/all", { params: collegeId ? { collegeId } : undefined }),
  getResults: (examId: string, collegeId?: string | null) =>
    api.get(`/result/${examId}`, { params: collegeId ? { collegeId } : undefined }),
  getAttempt: (attemptId: string) => api.get(`/result/attempt/${attemptId}`),
};

export const compilerApi = {
  runCode: (data: { code: string; language: string; stdin?: string }) =>
    api.post("/compiler/run", data),
  submitCode: (data: {
    code: string;
    language: string;
    test_cases: Array<{ input: string; expected_output: string }>;
  }) => api.post("/compiler/submit", data),
};

export const proctoringApi = {
  logEvent: (data: {
    attempt_id: string;
    exam_id: string;
    event_type: "camera_check" | "snapshot" | "violation" | "submission";
    violation_count?: number;
    message?: string;
    snapshot_data?: string | null;
  }) => api.post("/proctoring/events", data),
  getAttemptEvents: (attemptId: string) => api.get(`/proctoring/attempt/${attemptId}`),
  getExamSummary: (examId: string, collegeId?: string | null) =>
    api.get(`/proctoring/exam/${examId}/summary`, { params: collegeId ? { collegeId } : undefined }),
  getActiveMonitoring: (examId: string, collegeId?: string | null) =>
    api.get(`/proctoring/exam/${examId}/active-monitoring`, { params: collegeId ? { collegeId } : undefined }),
  overrideAttempt: (attemptId: string) => api.post(`/proctoring/attempt/${attemptId}/override`),
};

export const aiApi = {
  parseResume: (data: { resume_text: string; job_skills?: string[] }) =>
    api.post("/ai/resume-parse", data),
  generateMcq: (data: { topic: string; difficulty: string; count: number }) =>
    api.post("/ai/generate-mcq", data),
  generateCoding: (data: { topic: string; difficulty: string; count?: number }) =>
    api.post("/ai/generate-coding", data),
  createImprovementReport: (attempt_id: string) =>
    api.post("/ai/improvement-report", { attempt_id }),
};

export const interviewApi = {
  getQuestions: () => api.get("/interview/questions"),
  eligibility: (examId?: string) => api.get("/interview/eligibility", { params: examId ? { exam_id: examId } : undefined }),
  pending: () => api.get("/interview/pending"),
  recruiterPending: (collegeId?: string | null) => api.get("/interview/recruiter/pending", { params: collegeId ? { collegeId } : undefined }),
  start: (data?: { job_id?: string; exam_id?: string }) => api.post("/interview/start", data || {}),
  schedule: (interviewId: string, data: { scheduled_start_at?: string; scheduled_end_at?: string; start_at?: string; end_at?: string }) =>
    api.post(`/interview/${interviewId}/schedule`, data),
  submitAnswer: (interviewId: string, data: { question: string; answer: string; stage: number }) =>
    api.post(`/interview/${interviewId}/answer`, data),
  submit: (interviewId: string) => api.post(`/interview/${interviewId}/submit`),
  mine: () => api.get("/interview/mine"),
  summaries: (collegeId?: string | null) =>
    api.get("/interview/summaries", { params: collegeId ? { collegeId } : undefined }),
  getAnswers: (interviewId: string) => api.get(`/interview/${interviewId}/answers`),
};

export const assetApi = {
  getCertificates: () => api.get("/assets/certificates"),
  getBadges: () => api.get("/assets/badges"),
};

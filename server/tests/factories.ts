export function createMockUser(overrides = {}) {
  const id = "user-" + Math.random().toString(36).substring(2, 8);
  return {
    id,
    name: "Test User",
    email: `${id}@example.com`,
    role: "candidate",
    ...overrides,
  };
}

export function createMockProfile(overrides = {}) {
  return {
    user_id: "user-123",
    branch: "Computer Science",
    cgpa: 8.5,
    skills: ["React", "Node.js"],
    graduation_year: 2026,
    bio: "Passionate developer",
    projects: [],
    semester_grades: [],
    college: { id: "col-1", name: "Test College", code: "TCOL" },
    ...overrides,
  };
}

export function createMockAttempt(overrides = {}) {
  return {
    id: "attempt-" + Math.random().toString(36).substring(2, 8),
    exam_id: "exam-123",
    candidate_id: "user-123",
    score: 80,
    status: "completed",
    submitted_at: new Date().toISOString(),
    exams: {
      id: "exam-123",
      title: "JavaScript Fundamentals",
      description: "Test your JS skills",
      total_marks: 100,
      pass_marks: 50,
    },
    ...overrides,
  };
}

export function createMockJob(overrides = {}) {
  return {
    id: "job-" + Math.random().toString(36).substring(2, 8),
    title: "Software Engineer",
    company_name: "Tech Corp",
    company_description: "A cool tech company",
    required_skills: ["React", "TypeScript"],
    interview_pass_score: 60,
    ...overrides,
  };
}

export function createMockInterview(overrides = {}) {
  return {
    id: "interview-" + Math.random().toString(36).substring(2, 8),
    candidate_id: "user-123",
    exam_id: "exam-123",
    job_id: "job-123",
    status: "started",
    questions: [
      "Explain variables",
      "What is a closure?",
      "How does async work?",
    ],
    ...overrides,
  };
}

export function createMockAnswer(overrides = {}) {
  return {
    id: "answer-" + Math.random().toString(36).substring(2, 8),
    interview_id: "interview-123",
    question: "What is a closure?",
    answer: "A closure is when a function retains access to its outer scope.",
    score: 85,
    ...overrides,
  };
}

export function createMockDrive(overrides = {}) {
  return {
    id: "drive-123",
    title: "Test Drive",
    company_name: "TestCo",
    college_id: "col-1",
    allowed_branches: ["CSE"],
    min_cgpa: 7.0,
    ...overrides,
  };
}

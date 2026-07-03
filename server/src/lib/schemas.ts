import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email or roll number is required")
    .max(255, "Identifier too long"),
  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password too long"),
});

export const createUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
  role: z.enum(["admin", "tpo", "recruiter", "candidate"]),
});

export const createRecruiterSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const createTpoSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  college_name: z.string().min(1, "College name is required").max(200),
  college_code: z.string().min(1, "College code is required").max(50),
  location: z.string().max(200).optional(),
});

export const createCandidateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  roll_number: z.string().max(50).optional(),
  college_id: z.string().uuid().optional(),
});

export const createExamSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional(),
  duration: z.number().int().min(5, "Duration must be at least 5 minutes"),
  total_marks: z.number().int().positive("Total marks must be positive"),
  pass_marks: z.number().int().min(0, "Pass marks cannot be negative"),
  available_from: z.string().datetime().optional(),
  available_until: z.string().datetime().optional(),
}).refine((data) => data.pass_marks <= data.total_marks, {
  message: "Pass marks cannot be greater than total marks",
  path: ["pass_marks"],
});

export const paginationSchema = z.object({
  page: z.string().optional().transform((v) => Math.max(1, Number(v) || 1)),
  limit: z.string().optional().transform((v) => {
    const n = Number(v) || 50;
    return Math.min(50, Math.max(1, n));
  }),
});

export const createJobSchema = z.object({
  title: z.string().min(1, "Job title is required").max(200),
  company_name: z.string().min(1, "Company name is required").max(200),
  description: z.string().max(5000).optional(),
  location: z.string().max(200).optional(),
  salary_range: z.string().max(100).optional(),
  job_type: z.enum(["full_time", "internship", "contract"]).default("full_time"),
  college_id: z.string().uuid().optional(),
  exam_id: z.string().uuid().optional(),
});

export const aiGenerateSchema = z.object({
  topic: z.string().min(1, "Topic is required").max(100),
  difficulty: z.enum(["easy", "medium", "hard", "very_hard"]).default("medium"),
  count: z.number().int().min(1).max(50).default(10),
  type: z.enum(["mcq", "coding"]).default("mcq"),
});

export const interviewAnswerSchema = z.object({
  interview_id: z.string().uuid(),
  question_index: z.number().int().min(0),
  answer_text: z.string().max(5000).optional(),
  audio_url: z.string().url().optional(),
});

export const proctoringEventSchema = z.object({
  attempt_id: z.string().uuid(),
  event_type: z.enum(["face_missing", "multiple_faces", "tab_switch", "copy_paste", "suspicious_movement"]),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  details: z.string().max(1000).optional(),
});

// ─── NEW SCHEMAS FOR ROUTE VALIDATION ───

export const startExamSchema = z.object({
  exam_id: z.string().uuid("exam_id must be a valid UUID"),
});

export const scheduleInterviewSchema = z.object({
  scheduled_start: z.string().datetime().optional(),
  scheduled_end: z.string().datetime().optional(),
});

export const interviewAnswerBodySchema = z.object({
  question: z.string().min(1, "Question is required").max(2000),
  answer: z.string().max(10000).optional(),
  stage: z.number().int().min(1).max(20).optional(),
});

export const submitMcqSchema = z.object({
  attempt_id: z.string().uuid("attempt_id must be a valid UUID"),
  question_id: z.string().uuid("question_id must be a valid UUID"),
  selected_option: z.string().min(1, "selected_option is required").max(1),
});

export const submitCodeSchema = z.object({
  attempt_id: z.string().uuid("attempt_id must be a valid UUID"),
  coding_question_id: z.string().uuid("coding_question_id must be a valid UUID"),
  code: z.string().max(50000, "Code exceeds maximum length"),
  language: z.string().min(1, "Language is required").max(50),
});

export const submitExamSchema = z.object({
  attempt_id: z.string().uuid("attempt_id must be a valid UUID"),
});

export const updateCodeScoreSchema = z.object({
  attempt_id: z.string().uuid("attempt_id must be a valid UUID"),
  coding_question_id: z.string().uuid("coding_question_id must be a valid UUID"),
  score: z.number().int().min(0).max(100),
  code: z.string().max(50000).optional(),
  language: z.string().max(50).optional(),
});

export const updateProfileSchema = z.object({
  phone: z.string().max(20).optional(),
  skills: z.array(z.string().max(100)).max(100).optional(),
  domain_preference: z.string().max(100).optional(),
  github_url: z.string().url().max(500).optional().or(z.literal("")),
  linkedin_url: z.string().url().max(500).optional().or(z.literal("")),
  portfolio_url: z.string().url().max(500).optional().or(z.literal("")),
  bio: z.string().max(2000).optional(),
  photo_url: z.string().url().max(500).optional().or(z.literal("")),
  projects: z.array(z.object({}).passthrough()).max(50).optional(),
  semester_grades: z.array(z.object({}).passthrough()).max(20).optional(),
});

export const onboardingSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  phone: z.string().min(1, "Phone is required").max(20),
  skills: z.array(z.string().min(1).max(100)).min(1, "At least one skill is required").max(50),
  domain_preference: z.string().min(1, "Domain preference is required").max(100),
  marksheet_url: z.string().url().max(500).optional().or(z.literal("")),
  resume_url: z.string().url().max(500).optional().or(z.literal("")),
});

export const proctoringLogEventSchema = z.object({
  attempt_id: z.string().uuid("attempt_id must be a valid UUID"),
  exam_id: z.string().uuid("exam_id must be a valid UUID"),
  event_type: z.enum(["camera_check", "snapshot", "violation", "submission"]),
  violation_count: z.number().int().min(0).optional(),
  message: z.string().max(2000).optional(),
  snapshot_data: z.string().max(10000000).optional(), // base64 snapshots can be large
});

export const respondOfferSchema = z.object({
  response: z.enum(["accept", "decline", "negotiate"]),
  notes: z.string().max(5000).optional().or(z.literal("")),
});

export const linkBankMcqSchema = z.object({
  exam_id: z.string().uuid(),
  question_ids: z.array(z.string().uuid()),
});

export const linkBankCodingSchema = z.object({
  exam_id: z.string().uuid(),
  coding_question_ids: z.array(z.string().uuid()),
});

export const addQuestionsSchema = z.object({
  exam_id: z.string().uuid(),
  questions: z.array(
    z.object({
      question_text: z.string().min(1).max(10000),
      option_a: z.string().min(1).max(5000),
      option_b: z.string().min(1).max(5000),
      option_c: z.string().min(1).max(5000),
      option_d: z.string().min(1).max(5000),
      correct_option: z.enum(["a", "b", "c", "d", "A", "B", "C", "D"]),
      marks: z.number().int().min(1),
    })
  ),
});

export const addCodingQuestionsSchema = z.object({
  exam_id: z.string().uuid(),
  coding_questions: z.array(
    z.object({
      title: z.string().min(1).max(255),
      description: z.string().min(1).max(20000),
      difficulty: z.enum(["easy", "medium", "hard"]),
      starter_code: z.string().max(50000),
      test_cases: z.array(
        z.object({
          input: z.string().max(10000),
          expected_output: z.string().max(10000),
        })
      ),
      marks: z.number().int().min(1),
    })
  ),
});

export const assignExamSchema = z.object({
  exam_id: z.string().uuid(),
  candidate_ids: z.array(z.string().uuid()),
});

export const uploadStudentsSchema = z.object({
  rows: z.array(
    z.object({
      roll_number: z.string().min(1).max(50),
      name: z.string().min(1).max(100),
      branch: z.string().min(1).max(100),
      cgpa: z.number().min(0).max(10),
      graduation_year: z.number().int().min(1900).max(2100),
      email: z.string().email().max(100).optional().or(z.literal("")),
    })
  ),
});

export const scanMarksheetsSchema = z.object({
  files: z.array(
    z.object({
      name: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(100),
      data: z.string(),
    })
  ),
});

export const studentVerificationSchema = z.object({
  documents_verified: z.boolean(),
});

export const verifyStudentBatchSchema = z.object({
  studentIds: z.array(z.string().uuid()),
  documents_verified: z.boolean(),
});

export const assignDriveExamSchema = z.object({
  exam_id: z.string().uuid(),
});

export const saveDriveAiConfigSchema = z.object({
  aiConfig: z.object({}).passthrough(),
});

export const testDriveAiConfigSchema = z.object({
  question: z.string().min(1).max(5000),
  answer: z.string().min(1).max(20000),
  aiConfig: z.object({}).passthrough(),
});

export const aiShortlistSchema = z.object({
  criteria: z.string().min(1).max(5000),
});

export const resumeParseSchema = z.object({
  resume_text: z.string().min(1).max(1000000),
  job_skills: z.array(z.string().max(100)).max(100).optional(),
});

export const generateMcqSchema = z.object({
  topic: z.string().min(1).max(500),
  difficulty: z.enum(["easy", "medium", "hard"]),
  count: z.number().int().min(1).max(50),
});

export const generateCodingSchema = z.object({
  topic: z.string().min(1).max(500),
  difficulty: z.enum(["easy", "medium", "hard"]),
  count: z.number().int().min(1).max(50).optional(),
});

export const improvementReportSchema = z.object({
  attempt_id: z.string().uuid(),
});

export const runCodeSchema = z.object({
  code: z.string().max(50000),
  language: z.string().min(1).max(50),
  stdin: z.string().max(10000).optional(),
});

export const submitCompilerSchema = z.object({
  code: z.string().max(50000),
  language: z.string().min(1).max(50),
  test_cases: z.array(
    z.object({
      input: z.string().max(10000),
      expected_output: z.string().max(10000),
    })
  ),
});

export const snapshotOverrideSchema = z.object({
  violation_severity: z.enum(["low", "medium", "high", "critical"]),
});

export const addBankQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      question_text: z.string().min(1).max(10000),
      option_a: z.string().min(1).max(5000),
      option_b: z.string().min(1).max(5000),
      option_c: z.string().min(1).max(5000),
      option_d: z.string().min(1).max(5000),
      correct_option: z.enum(["a", "b", "c", "d", "A", "B", "C", "D"]),
      marks: z.number().int().min(1).optional(),
    })
  ),
});

export const addBankCodingSchema = z.object({
  question: z.object({
    title: z.string().min(1).max(255),
    description: z.string().min(1).max(20000),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    starter_code: z.string().max(50000).optional(),
    test_cases: z.array(
      z.object({
        input: z.string().max(10000),
        expected_output: z.string().max(10000),
      })
    ).optional(),
    marks: z.number().int().min(1).optional(),
  }),
});

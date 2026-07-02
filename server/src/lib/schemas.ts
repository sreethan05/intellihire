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

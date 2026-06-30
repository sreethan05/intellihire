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

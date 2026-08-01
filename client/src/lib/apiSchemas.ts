import { z } from "zod";

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(["admin", "tpo", "recruiter", "candidate"]),
  roll_number: z.string().nullable().optional(),
  college_id: z.string().nullable().optional(),
  profile_complete: z.boolean().optional(),
  must_change_password: z.boolean().optional(),
});

export const AuthMeResponseSchema = z.object({ user: UserSchema });
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;

export const ProfileStatsResponseSchema = z.object({
  title: z.string(),
  stats: z.array(z.object({ label: z.string(), value: z.string() })),
});
export type ProfileStatsResponse = z.infer<typeof ProfileStatsResponseSchema>;

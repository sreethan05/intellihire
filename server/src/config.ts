import dotenv from "dotenv";
import { z } from "zod";
import { resolve } from "path";

// Load .env from project root (config.ts is in server/src/)
const __dirname = import.meta.dirname;
dotenv.config({ path: resolve(__dirname, "../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("5000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required").optional(),
  VITE_API_URL: z.string().url().optional().default("http://localhost:5000/api"),
  FRONTEND_URL: z.string().url().optional().default("http://localhost:5173"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  JUDGE0_API_URL: z.string().optional(),
  FILE_STORAGE_DIR: z.string().optional().default("uploads"),
  DISABLE_RATE_LIMITS: z.enum(["true", "false"]).default("false"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues.map((e) => `  - ${e.path.join(".")}: ${e.message}`).join("\n");
    console.error("\n❌ Invalid environment variables:\n" + errors + "\n");
    process.exit(1);
  }
  return result.data;
}

export const config = parseEnv();

/** Derive a valid CORS origin from VITE_API_URL by stripping the /api path suffix */
export function getCorsOrigin(): string {
  const url = config.VITE_API_URL;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url.replace(/\/api\/?$/, "");
  }
}

/** Get allowed CORS origins based on environment */
export function getAllowedOrigins(): string[] {
  if (config.NODE_ENV === "production") {
    const origins = [getCorsOrigin(), config.FRONTEND_URL].filter(Boolean);
    return [...new Set(origins)];
  }
  return [
    "http://localhost:3000",
    "http://localhost:5000",
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4173",
  ];
}

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../.env") });

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";

import { initSentry } from "./lib/sentry.js";
import { isPostgresConfigured, storageRoot } from "./lib/postgres.js";
import { getBankStats } from "./lib/examPipeline.js";
initSentry();
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/logger.js";

import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import recruiterRoutes from "./routes/recruiter.js";
import candidateRoutes from "./routes/candidate.js";
import tpoRoutes from "./routes/tpo.js";
import examRoutes from "./routes/exam.js";
import resultRoutes from "./routes/result.js";
import compilerRoutes from "./routes/compiler.js";
import proctoringRoutes from "./routes/proctoring.js";
import aiRoutes from "./routes/ai.js";
import interviewRoutes from "./routes/interview.js";
import candidateAssetsRoutes from "./routes/candidateAssets.js";
import candidateAnalyticsRoutes from "./routes/candidateAnalytics.js";
import recruiterAnalyticsRoutes from "./routes/recruiterAnalytics.js";
import tpoAnalyticsRoutes from "./routes/tpoAnalytics.js";
import adminAnalyticsRoutes from "./routes/adminAnalytics.js";
import hubRoutes from "./routes/hub.js";

import docsRoutes from "./routes/docs.js";

const NODE_ENV = process.env.NODE_ENV || "development";

export function createApp() {
  const app = express();

  // ─── Security Headers ───
  app.use(helmet());

  // ─── CORS (environment-aware) ───
  const allowedOrigins =
    NODE_ENV === "production"
      ? ([process.env.VITE_API_URL].filter(Boolean) as string[])
      : [
          "http://localhost:3000",
          "http://localhost:5000",
          "http://localhost:5173",
          "http://localhost:4173",
          "http://127.0.0.1:5173",
          "http://127.0.0.1:4173",
        ];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Not allowed by CORS: ${origin}`));
        }
      },
      credentials: true,
    })
  );

  // ─── Rate Limiting ───
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.DISABLE_RATE_LIMITS === "true" ? 10000 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.DISABLE_RATE_LIMITS === "true" ? 1000 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts, please try again later." },
  });

  const codeSubmitLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: process.env.DISABLE_RATE_LIMITS === "true" ? 10000 : 5, // 5 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many compilation attempts, please try again in a minute." },
  });

  const resumeUploadLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: process.env.DISABLE_RATE_LIMITS === "true" ? 10000 : 5, // 5 uploads per 5 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many resume uploads, please try again in a few minutes." },
  });

  app.use("/api", generalLimiter);
  app.use("/api/auth/login", loginLimiter);
  app.use("/api/compiler/submit", codeSubmitLimiter);
  app.use("/api/candidate/resume/upload", resumeUploadLimiter);

  // ─── Body Parsing ───
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));
  app.use("/uploads", express.static(storageRoot));

  // ─── Request Logging ───
  app.use(requestLogger);

  // ─── API Routes ───
  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/admin", adminAnalyticsRoutes);
  app.use("/api/recruiter", recruiterRoutes);
  app.use("/api/recruiter", recruiterAnalyticsRoutes);
  app.use("/api/tpo", tpoRoutes);
  app.use("/api/tpo", tpoAnalyticsRoutes);
  app.use("/api/candidate", candidateRoutes);
  app.use("/api/candidate", candidateAnalyticsRoutes);
  app.use("/api/exam", examRoutes);
  app.use("/api/result", resultRoutes);
  app.use("/api/compiler", compilerRoutes);
  app.use("/api/proctoring", proctoringRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api/interview", interviewRoutes);
  app.use("/api/assets", candidateAssetsRoutes);
  app.use("/api/hub", hubRoutes);
  app.use("/api/docs", docsRoutes);

  // ─── Health Check ───
  /**
   * @openapi
   * /api/health:
   *   get:
   *     summary: Get system health status
   *     tags: [System]
   *     responses:
   *       200:
   *         description: System is healthy
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: healthy
   *                 timestamp:
   *                   type: string
   *                   format: date-time
   *                 environment:
   *                   type: string
   *                 services:
   *                   type: object
   *       503:
   *         description: System is degraded
   */
  app.get("/api/health", async (_req, res) => {
    const isPostgresHealthy = isPostgresConfigured();
    const isGroqConfigured = Boolean(process.env.GROQ_API_KEY);

    let pipelineStatus = { healthy: false, totalMcq: 0, totalCoding: 0 };
    try {
      pipelineStatus = await getBankStats();
    } catch {
      // Pipeline status unavailable
    }

    const judge0Status = {
      endpoint: process.env.JUDGE0_API_URL || "https://ce.judge0.com",
      isPrivate: Boolean(process.env.JUDGE0_API_URL && !process.env.JUDGE0_API_URL.includes("ce.judge0.com")),
    };

    // In test/dev environments, be lenient. In production, require postgres.
    const allHealthy = NODE_ENV === "production" 
      ? isPostgresHealthy 
      : (isPostgresHealthy || isGroqConfigured);

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      services: {
        postgres: isPostgresHealthy,
        groq: isGroqConfigured,
        judge0: judge0Status,
        email: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
        sentry: Boolean(process.env.SENTRY_DSN),
        pipeline: pipelineStatus,
      },
    });
  });

  // ─── Static Frontend (production) ───
  const distPath = path.resolve(process.cwd(), "dist");
  app.use(express.static(distPath));

  app.get("/{*splat}", (_req, res) => {
    const indexPath = path.join(distPath, "index.html");
    // Check if file exists before sending, otherwise return 404
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });

  // ─── Global Error Handler ───
  app.use(errorHandler);

  return app;
}

export const app = createApp();

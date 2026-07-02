import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";

import { config, getAllowedOrigins } from "./config.js";
import { initSentry } from "./lib/sentry.js";
import { isPostgresConfigured, storageRoot } from "./lib/postgres.js";
import { getBankStats } from "./lib/examPipeline.js";
initSentry();
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/logger.js";
import { logger } from "./lib/logger.js";

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

import { auditMiddleware } from "./middleware/auditLogger.js";

const NODE_ENV = config.NODE_ENV;
const API_PREFIX = "/api/v1";

export function createApp() {
  const app = express();

  // ─── Security Headers ───
  app.use(helmet());

  // ─── CORS (environment-aware) ───
  const allowedOrigins = getAllowedOrigins();

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn({ origin, allowedOrigins }, "CORS blocked request");
          callback(new Error(`Not allowed by CORS: ${origin}`));
        }
      },
      credentials: true,
    })
  );

  // ─── Rate Limiting ───
  const isRateLimitDisabled = config.DISABLE_RATE_LIMITS === "true";

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isRateLimitDisabled ? 10000 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isRateLimitDisabled ? 1000 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts, please try again later." },
  });

  const codeSubmitLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: isRateLimitDisabled ? 10000 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many compilation attempts, please try again in a minute." },
  });

  const resumeUploadLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: isRateLimitDisabled ? 10000 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many resume uploads, please try again in a few minutes." },
  });

  const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: isRateLimitDisabled ? 10000 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "AI rate limit exceeded. Max 5 requests per hour." },
  });

  const interviewLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: isRateLimitDisabled ? 10000 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Interview evaluation rate limit exceeded. Max 10 requests per hour." },
  });

  app.use(API_PREFIX, generalLimiter);
  app.use(`${API_PREFIX}/auth/login`, loginLimiter);
  app.use(`${API_PREFIX}/compiler/submit`, codeSubmitLimiter);
  app.use(`${API_PREFIX}/candidate/resume/upload`, resumeUploadLimiter);
  app.use(`${API_PREFIX}/ai`, aiLimiter);
  app.use(`${API_PREFIX}/interview`, interviewLimiter);

  // ─── Body Parsing ───
  // Default 1MB JSON limit; bulk upload routes get higher limit below
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use("/uploads", express.static(storageRoot));

  // ─── Request Logging ───
  app.use(requestLogger);
  app.use(auditMiddleware);

  // ─── API Routes (v1) ───
  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/admin`, adminRoutes);
  app.use(`${API_PREFIX}/admin`, adminAnalyticsRoutes);
  app.use(`${API_PREFIX}/recruiter`, recruiterRoutes);
  app.use(`${API_PREFIX}/recruiter`, recruiterAnalyticsRoutes);
  app.use(`${API_PREFIX}/tpo`, tpoRoutes);
  app.use(`${API_PREFIX}/tpo`, tpoAnalyticsRoutes);
  app.use(`${API_PREFIX}/candidate`, candidateRoutes);
  app.use(`${API_PREFIX}/candidate`, candidateAnalyticsRoutes);
  app.use(`${API_PREFIX}/exam`, examRoutes);
  app.use(`${API_PREFIX}/result`, resultRoutes);
  app.use(`${API_PREFIX}/compiler`, compilerRoutes);
  app.use(`${API_PREFIX}/proctoring`, proctoringRoutes);
  app.use(`${API_PREFIX}/ai`, aiRoutes);
  app.use(`${API_PREFIX}/interview`, interviewRoutes);
  app.use(`${API_PREFIX}/assets`, candidateAssetsRoutes);
  app.use(`${API_PREFIX}/hub`, hubRoutes);
  app.use(`${API_PREFIX}/docs`, docsRoutes);

  // ─── Legacy /api routes (redirect to v1) ───
  app.use("/api", (req, res, next) => {
    // Health check stays at /api/health for compatibility
    if (req.path === "/health") {
      return next("route");
    }
    // Everything else redirect to v1
    const target = `${API_PREFIX}${req.path}`;
    logger.warn({ originalUrl: req.originalUrl, target }, "Legacy API path used; redirecting to v1");
    res.redirect(308, target);
  });

  // ─── Health Check ───
  /**
   * @openapi
   * /api/v1/health:
   *   get:
   *     summary: Get system health status
   *     tags: [System]
   *     responses:
   *       200:
   *         description: System is healthy
   *       503:
   *         description: System is degraded
   */
  app.get("/api/health", async (_req, res) => {
    const isPostgresHealthy = isPostgresConfigured();
    const isGroqConfigured = Boolean(config.GROQ_API_KEY);

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
        email: Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS),
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

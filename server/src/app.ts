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
import { requestIdMiddleware } from "./middleware/requestId.js";
import { csrfProtection } from "./middleware/csrf.js";

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
const API_PREFIXES = ["/api/v1", "/api"];

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  // ─── Request Correlation ───
  app.use(requestIdMiddleware);

  if (NODE_ENV === "production") {
    app.use((req, res, next) => {
      const forwardedProto = req.get("x-forwarded-proto");
      if (req.secure || forwardedProto === "https") {
        next();
        return;
      }
      res.redirect(308, `https://${req.get("host")}${req.originalUrl}`);
    });
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: NODE_ENV === "production" ? ["'self'"] : ["'self'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https://*.s3.amazonaws.com", "https://*.amazonaws.com"],
          connectSrc: ["'self'", "ws:", "wss:"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      xContentTypeOptions: true,
    })
  );
  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
    next();
  });

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

  for (const prefix of API_PREFIXES) {
    app.use(prefix, generalLimiter);
    app.use(`${prefix}/auth/login`, loginLimiter);
    app.use(`${prefix}/compiler/submit`, codeSubmitLimiter);
    app.use(`${prefix}/candidate/resume/upload`, resumeUploadLimiter);
    app.use(`${prefix}/ai`, aiLimiter);
    app.use(`${prefix}/interview`, interviewLimiter);
  }

  // ─── Body Parsing ───
  // Default 1MB JSON limit; bulk upload routes get higher limit below
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use("/uploads", express.static(storageRoot));

  // ─── Request Logging ───
  app.use(requestLogger);
  app.use(auditMiddleware);
  app.use(csrfProtection);

  // ─── API Routes ───
  for (const prefix of API_PREFIXES) {
    app.use(`${prefix}/auth`, authRoutes);
    app.use(`${prefix}/admin`, adminRoutes);
    app.use(`${prefix}/admin`, adminAnalyticsRoutes);
    app.use(`${prefix}/recruiter`, recruiterRoutes);
    app.use(`${prefix}/recruiter`, recruiterAnalyticsRoutes);
    app.use(`${prefix}/tpo`, tpoRoutes);
    app.use(`${prefix}/tpo`, tpoAnalyticsRoutes);
    app.use(`${prefix}/candidate`, candidateRoutes);
    app.use(`${prefix}/candidate`, candidateAnalyticsRoutes);
    app.use(`${prefix}/exam`, examRoutes);
    app.use(`${prefix}/result`, resultRoutes);
    app.use(`${prefix}/compiler`, compilerRoutes);
    app.use(`${prefix}/proctoring`, proctoringRoutes);
    app.use(`${prefix}/ai`, aiRoutes);
    app.use(`${prefix}/interview`, interviewRoutes);
    app.use(`${prefix}/assets`, candidateAssetsRoutes);
    app.use(`${prefix}/hub`, hubRoutes);
    app.use(`${prefix}/docs`, docsRoutes);
  }

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
  app.get(["/api/health", "/api/v1/health"], async (_req, res) => {
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

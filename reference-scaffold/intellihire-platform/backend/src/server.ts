import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler.js";
import adminRoutes from "./routes/admin.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import authRoutes from "./routes/auth.routes.js";
import candidateRoutes from "./routes/candidate.routes.js";
import codingRoutes from "./routes/coding.routes.js";
import examRoutes from "./routes/exam.routes.js";
import interviewRoutes from "./routes/interview.routes.js";
import notificationRoutes from "./routes/notifications.routes.js";
import proctoringRoutes from "./routes/proctoring.routes.js";
import recruiterRoutes from "./routes/recruiter.routes.js";
import tpoRoutes from "./routes/tpo.routes.js";

const app = express();
const port = Number(process.env.PORT ?? 5000);

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(",") ?? true, credentials: true }));
app.use(express.json({ limit: "25mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));
app.use("/api/auth", authRoutes);
app.use("/api/tpo", tpoRoutes);
app.use("/api/candidate", candidateRoutes);
app.use("/api/recruiter", recruiterRoutes);
app.use("/api/exam", examRoutes);
app.use("/api/coding", codingRoutes);
app.use("/api/proctoring", proctoringRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/interview", interviewRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`IntelliHire API running on http://localhost:${port}`);
});


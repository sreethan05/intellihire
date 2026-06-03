import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") }); // always resolves to app/.env

import express from "express";
import cors from "cors";
import path from "path";

import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import recruiterRoutes from "./routes/recruiter";
import candidateRoutes from "./routes/candidate";
import tpoRoutes from "./routes/tpo";
import examRoutes from "./routes/exam";
import resultRoutes from "./routes/result";
import compilerRoutes from "./routes/compiler";
import proctoringRoutes from "./routes/proctoring";
import aiRoutes from "./routes/ai";
import interviewRoutes from "./routes/interview";
import candidateAssetsRoutes from "./routes/candidateAssets";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:5000",
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4173",
  ],
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/recruiter", recruiterRoutes);
app.use("/api/tpo", tpoRoutes);
app.use("/api/candidate", candidateRoutes);
app.use("/api/exam", examRoutes);
app.use("/api/result", resultRoutes);
app.use("/api/compiler", compilerRoutes);
app.use("/api/proctoring", proctoringRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/interview", interviewRoutes);
app.use("/api/assets", candidateAssetsRoutes);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      groq: Boolean(process.env.GROQ_API_KEY),
      judge0: "public-ce",
    },
  });
});

// Serve built frontend in production
const distPath = path.resolve(process.cwd(), "dist");
app.use(express.static(distPath));

app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`   API:      http://localhost:${PORT}/api`);
  console.log(`   Health:   http://localhost:${PORT}/api/health`);
});

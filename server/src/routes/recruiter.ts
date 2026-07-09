import { Router } from "express";
import { authMiddleware, roleMiddleware, type AuthRequest } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../middleware/validation.js";
import * as recruiterService from "../services/recruiterService.js";
import {
  createCandidateSchema,
  createJobSchema,
  assignDriveExamSchema,
  saveDriveAiConfigSchema,
  testDriveAiConfigSchema,
  aiShortlistSchema,
  paginationSchema,
} from "../lib/schemas.js";
import { logger } from "../lib/logger.js";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { storageRoot } from "../lib/postgres.js";
import { generateAiJson, hasAiKey } from "../lib/ai.js";

const router = Router();
router.use(authMiddleware);
router.use(roleMiddleware(["recruiter"]));

// Offer letter upload storage
const offersDir = path.resolve(storageRoot, "offers");
fs.mkdir(offersDir, { recursive: true }).catch((err) =>
  logger.error({ err }, "Failed to create offers storage folder")
);

const offerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, offersDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, unique);
  },
});

const uploadOffer = multer({
  storage: offerStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype === "application/pdf" && ext === ".pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed for offer letters"));
    }
  },
});

router.post("/create-candidate", validateBody(createCandidateSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await recruiterService.createCandidate(req.body, req.user!.id);
    res.json({ message: "Candidate created", candidate: data });
  } catch (err: any) {
    next(err);
  }
});

router.get("/candidates", validateQuery(paginationSchema), async (req: AuthRequest, res, next) => {
  try {
    const { page, limit } = req.query as any;
    const { candidates, total } = await recruiterService.getCandidatesList(page, limit);
    res.json({ candidates, total, page, limit });
  } catch (err) {
    next(err);
  }
});

router.get("/colleges", async (_req: AuthRequest, res, next) => {
  try {
    const { colleges } = await recruiterService.getCollegesList();
    res.json({ colleges });
  } catch (err) {
    next(err);
  }
});

router.get("/colleges-summary", async (req: AuthRequest, res, next) => {
  try {
    const { colleges } = await recruiterService.getCollegesSummary(req.user!.id);
    res.json({ colleges });
  } catch (err) {
    next(err);
  }
});

router.post("/drives", validateBody(createJobSchema), async (req: AuthRequest, res, next) => {
  try {
    const result = await recruiterService.createDrive(req.body, req.user!.id);
    res.json({ message: "Drive created", drive: result.drive, eligibleCount: result.eligibleCount });
  } catch (err) {
    next(err);
  }
});

router.get("/drives", validateQuery(paginationSchema), async (req: AuthRequest, res, next) => {
  try {
    const { page, limit } = req.query as any;
    const { drives, total } = await recruiterService.getDrivesList(req.user!.id, page, limit);
    res.json({ drives, total, page, limit });
  } catch (err) {
    next(err);
  }
});

router.get("/drives/:driveId/eligible-candidates", async (req: AuthRequest, res, next) => {
  try {
    const { candidates, count } = await recruiterService.getEligibleCandidates(req.params.driveId as string, req.user!.id);
    res.json({ candidates, count });
  } catch (err) {
    next(err);
  }
});

router.post("/drives/:driveId/assign-exam", validateBody(assignDriveExamSchema), async (req: AuthRequest, res, next) => {
  try {
    const { exam_id } = req.body;
    const result = await recruiterService.assignExam(req.params.driveId as string, exam_id, req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/dashboard", async (req: AuthRequest, res, next) => {
  try {
    const collegeId = req.query.collegeId as string | undefined;
    const data = await recruiterService.getDashboardData(req.user!.id, collegeId);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get("/drives/:driveId/ai-config", async (req: AuthRequest, res, next) => {
  try {
    const { aiConfig } = await recruiterService.getAiConfig(req.params.driveId as string, req.user!.id);
    res.json({ aiConfig });
  } catch (err) {
    next(err);
  }
});

router.post("/drives/:driveId/ai-config", validateBody(saveDriveAiConfigSchema), async (req: AuthRequest, res, next) => {
  try {
    const { aiConfig } = req.body;
    const { drive } = await recruiterService.saveAiConfig(req.params.driveId as string, aiConfig, req.user!.id);
    res.json({ message: "AI Config saved successfully", drive });
  } catch (err) {
    next(err);
  }
});

router.post("/drives/:driveId/test-evaluation", validateBody(testDriveAiConfigSchema), async (req: AuthRequest, res, next) => {
  try {
    const { question, answer, aiConfig } = req.body;

    const persona = aiConfig.persona || "";
    const customRubric = aiConfig.rubric || "";
    const examples = aiConfig.examples || [];
    const fallbackScore = Math.max(35, Math.min(95, 35 + answer.trim().split(/\s+/).filter(Boolean).length));

    if (!hasAiKey()) {
      res.json({
        score: fallbackScore,
        feedback: "API key not configured. Fallback grading is active.",
      });
      return;
    }

    const prompt = `
Return only JSON.
You are scoring a test answer for a recruiter's custom AI face-to-face interview model.
${persona ? `Evaluate as this interviewer persona: ${persona}.` : ""}
Score from 0 to 100 for: relevance, technical clarity, communication, specificity, and evidence.
${customRubric ? `Use this specific grading rubric to judge and grade the answer:\n${customRubric}` : "Give one concise actionable feedback sentence."}

${examples && examples.length > 0 ? `
Use the following training examples to understand how you should score and provide feedback for answers:
${examples.map((ex: any, idx: number) => `
Example ${idx + 1}:
Question: ${ex.question}
Answer: ${ex.answer}
Suggested Score: ${ex.score}
Suggested Feedback: ${ex.feedback}
`).join("\n")}
` : ""}

Question: ${question}
Answer: ${answer}

Schema:
{
  "score": 82,
  "feedback": "One concise sentence."
}
`;

    const result = await generateAiJson<{ score?: unknown; feedback?: unknown }>(prompt);
    const score = Number(result.score || fallbackScore);
    const feedback = String(result.feedback || "Good effort.").trim();

    res.json({ score, feedback });
  } catch (err: any) {
    next(err);
  }
});

router.get("/candidates/compare", async (req: AuthRequest, res, next) => {
  try {
    const candidateIds = (req.query.candidateIds as string || "").split(",").filter(Boolean);
    if (candidateIds.length === 0) {
      res.status(400).json({ error: "At least one candidate ID is required for comparison" });
      return;
    }
    const result = await recruiterService.getCompareCandidates(candidateIds);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/ai/shortlist", validateBody(aiShortlistSchema), async (req: AuthRequest, res, next) => {
  try {
    const { criteria } = req.body;
    const result = await recruiterService.generateAiShortlist(criteria);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/offers/:candidateId/:jobId", uploadOffer.single("offerLetter"), async (req: AuthRequest, res, next) => {
  try {
    const { candidateId, jobId } = req.params;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: "Offer letter PDF is required" });
      return;
    }

    const { status } = await recruiterService.uploadOfferLetter(candidateId as string, jobId as string, file.filename, req.user!.id);
    res.json({ message: "Offer letter uploaded and candidate notified", status });
  } catch (err) {
    next(err);
  }
});

export default router;

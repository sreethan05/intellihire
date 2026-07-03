import { Router } from "express";
import { authMiddleware, roleMiddleware, type AuthRequest } from "../middleware/auth.js";
import * as interviewService from "../services/interviewService.js";

const router = Router();
router.use(authMiddleware);

// GET /api/interview/questions
router.get("/questions", (_req: AuthRequest, res) => {
  res.json({ stages: interviewService.STAGES });
});

// GET /api/interview/eligibility
router.get("/eligibility", async (req: AuthRequest, res, next) => {
  try {
    const result = await interviewService.checkEligibility(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/interview/pending
router.get("/pending", async (req: AuthRequest, res, next) => {
  try {
    const interviews = await interviewService.getPendingInterviewsList(req.user!.id);
    res.json({ interviews });
  } catch (err) {
    next(err);
  }
});

// GET /api/interview/recruiter/pending
router.get("/recruiter/pending", async (req: AuthRequest, res, next) => {
  try {
    const interviews = await interviewService.getRecruiterPending(req.user!.id);
    res.json({ interviews });
  } catch (err) {
    next(err);
  }
});

// POST /api/interview/start
router.post("/start", async (req: AuthRequest, res, next) => {
  try {
    const { job_id, exam_id } = req.body;
    const interview = await interviewService.startInterview(req.user!.id, job_id, exam_id);
    res.json({ message: "Interview started", interview });
  } catch (err) {
    next(err);
  }
});

// POST /api/interview/:interviewId/schedule
router.post("/:interviewId/schedule", roleMiddleware(["recruiter"]), async (req: AuthRequest, res, next) => {
  try {
    const { scheduled_start, scheduled_end } = req.body;
    const interview = await interviewService.scheduleInterview(req.params.interviewId as string, scheduled_start, scheduled_end);
    res.json({ message: "Interview scheduled successfully", interview });
  } catch (err) {
    next(err);
  }
});

// GET /api/interview/:interviewId/answers
router.get("/:interviewId/answers", async (req: AuthRequest, res, next) => {
  try {
    const answers = await interviewService.getInterviewAnswersList(req.params.interviewId as string);
    res.json({ answers });
  } catch (err) {
    next(err);
  }
});

// POST /api/interview/:interviewId/answer
router.post("/:interviewId/answer", async (req: AuthRequest, res, next) => {
  try {
    const { question, answer, stage } = req.body;
    const result = await interviewService.feedAnswer(
      req.params.interviewId as string,
      req.user!.id,
      question,
      answer,
      Number(stage || 1)
    );
    res.json({ message: "Answer saved", answer: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/interview/:interviewId/submit
router.post("/:interviewId/submit", async (req: AuthRequest, res, next) => {
  try {
    const result = await interviewService.submitInterview(req.params.interviewId as string, req.user!.id);
    res.json({ message: "Interview submitted for evaluation", interview: result.interview });
  } catch (err) {
    next(err);
  }
});

// GET /api/interview/mine
router.get("/mine", async (req: AuthRequest, res, next) => {
  try {
    const { interviews } = await interviewService.getCandidateInterviews(req.user!.id);
    res.json({ interviews });
  } catch (err) {
    next(err);
  }
});

// GET /api/interview/summaries
router.get("/summaries", async (req: AuthRequest, res, next) => {
  try {
    const collegeId = req.query.collegeId as string | undefined;
    const { interviews } = await interviewService.getRecruiterInterviews(req.user!.role, req.user!.id, collegeId);
    res.json({ interviews });
  } catch (err) {
    next(err);
  }
});

// GET /api/interview/:interviewId
router.get("/:interviewId", async (req: AuthRequest, res, next) => {
  try {
    const result = await interviewService.getInterviewDetails(req.params.interviewId as string, req.user!.id, req.user!.role);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

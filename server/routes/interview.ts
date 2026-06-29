import { Router } from "express";
import { supabase } from "../lib/supabase";
import { generateAiJson, hasAiKey } from "../lib/ai";
import { authMiddleware, roleMiddleware, type AuthRequest } from "../middleware/auth";
import { deserializeDriveColleges } from "./recruiter";


const router = Router();
router.use(authMiddleware);

// ─── Stage definitions ───────────────────────────────────────────────────────
export const STAGES = [
  { id: 1, name: "Introduction", questionCount: 2 },
  { id: 2, name: "Speaking Skills", questionCount: 2 },
  { id: 3, name: "Technical", questionCount: 3 },
];

const defaultIntroQuestions = [
  "Please introduce yourself — your name, background, and what you're currently working on or studying.",
  "Tell me about your most impactful project or achievement and what role you played in it.",
];

const defaultSpeakingQuestions = [
  "Describe a challenge you faced recently and walk me through how you communicated it to your team or mentor.",
  "Explain a technical concept from your domain as if you were teaching it to someone new.",
];

const defaultTechnicalQuestions = [
  "What data structures would you use to solve a real-time leaderboard problem, and why?",
  "Explain the difference between synchronous and asynchronous programming with a practical example.",
  "How would you design a simple URL shortener service? Walk me through the key components.",
];

type PassedAttempt = {
  attemptId: string;
  examId: string;
  examTitle: string;
  examDescription: string | null;
  score: number;
  totalMarks: number;
  passMarks: number;
  percentage: number;
  submittedAt: string | null;
};

async function getPassedAttempts(candidateId: string, examId?: string) {
  let query = supabase
    .from("attempts")
    .select("id, exam_id, score, submitted_at, exams:exam_id(id, title, description, total_marks, pass_marks)")
    .eq("candidate_id", candidateId)
    .eq("status", "completed")
    .order("submitted_at", { ascending: false });

  if (examId) {
    query = query.eq("exam_id", examId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || [])
    .map((attempt: any): PassedAttempt | null => {
      const exam = Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams;
      const score = Number(attempt.score || 0);
      const passMarks = Number(exam?.pass_marks || 0);
      const totalMarks = Number(exam?.total_marks || 0);
      if (!exam || score < passMarks) return null;
      return {
        attemptId: attempt.id,
        examId: attempt.exam_id,
        examTitle: exam.title || "Qualified Exam",
        examDescription: exam.description || null,
        score,
        totalMarks,
        passMarks,
        percentage: totalMarks ? Number(((score / totalMarks) * 100).toFixed(1)) : 0,
        submittedAt: attempt.submitted_at || null,
      };
    })
    .filter((a): a is PassedAttempt => Boolean(a));
}

function scoreAnswer(answer: string) {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const hasExample = /\b(project|built|implemented|improved|designed|deployed|resolved|debugged)\b/i.test(answer);
  const hasStructure = /\b(first|then|because|therefore|result|impact)\b/i.test(answer);
  return Math.max(35, Math.min(95, 35 + Math.min(words, 80) + (hasExample ? 10 : 0) + (hasStructure ? 8 : 0)));
}

function clampScore(value: unknown, fallback = 0) {
  const score = Number(value);
  if (Number.isNaN(score)) return fallback;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function fallbackFeedback(score: number) {
  return score >= 75 ? "Clear answer with useful detail." : "Add more concrete examples and outcomes.";
}

// ─── Build stage-wise questions ──────────────────────────────────────────────
async function buildStageQuestions(candidateId: string, attempt: PassedAttempt, job: any) {
  // Stage 1: Introduction — fixed templates personalised by exam
  const introQuestions = defaultIntroQuestions;

  // Stage 2: Speaking skills — fixed templates
  const speakingQuestions = defaultSpeakingQuestions;

  // Stage 3: Technical — AI-generated from job description
  let technicalQuestions = defaultTechnicalQuestions;

  if (hasAiKey()) {
    try {
      const { data: profile } = await supabase
        .from("candidate_profiles")
        .select("skills, domain_preference")
        .eq("user_id", candidateId)
        .maybeSingle();

      let cleanJobDesc = "Not provided";
      let persona = "";
      let customInstructions = "";

      if (job) {
        const { description, aiConfig } = deserializeDriveColleges(job.company_description);
        cleanJobDesc = description;
        if (aiConfig) {
          persona = aiConfig.persona;
          customInstructions = aiConfig.instructions;
        }
      }

      const jobContext = job
        ? `Job title: ${job.title}\nCompany: ${job.company_name}\nDescription: ${cleanJobDesc}\nRequired skills: ${Array.isArray(job.required_skills) ? job.required_skills.join(", ") : "Not provided"}`
        : `Exam: ${attempt.examTitle}\nExam description: ${attempt.examDescription || "Not provided"}`;

      const result = await generateAiJson<{ questions?: unknown[] }>(`
Return only JSON.
Generate exactly 3 technical interview questions for a campus placement AI interview.
Questions must be specific to the job role and test practical knowledge.
Make them conversational — suitable for a spoken voice interview, not written answers.

${jobContext}
Candidate skills: ${Array.isArray(profile?.skills) ? profile.skills.join(", ") : "Not provided"}
Exam score: ${attempt.score}/${attempt.totalMarks}

${persona ? `The interviewer persona is: ${persona}. Please match this tone/style.` : ""}
${customInstructions ? `Custom instructions to follow:\n${customInstructions}` : ""}

Schema:
{
  "questions": [
    "Question 1",
    "Question 2",
    "Question 3"
  ]
}
`);

      const generated = Array.isArray(result.questions)
        ? result.questions.map((q) => String(q).trim()).filter(Boolean).slice(0, 3)
        : [];

      if (generated.length >= 2) technicalQuestions = generated;
    } catch (err) {
      console.warn("AI technical question generation failed, using defaults:", err);
    }
  }

  return {
    stage1: introQuestions,
    stage2: speakingQuestions,
    stage3: technicalQuestions,
    all: [...introQuestions, ...speakingQuestions, ...technicalQuestions],
  };
}

// ─── Score a single answer (stage-aware) ─────────────────────────────────────
async function evaluateAnswer(question: string, answer: string, stage: number, job?: any) {
  const fallbackScore = scoreAnswer(answer);

  if (!hasAiKey()) {
    return {
      score: fallbackScore,
      feedback: fallbackFeedback(fallbackScore),
      pronunciation_score: stage === 2 ? Math.min(100, fallbackScore + 5) : undefined,
      clarity_score: stage === 2 ? Math.min(100, fallbackScore - 3) : undefined,
    };
  }

  let persona = "";
  let customRubric = "";
  let examples: any[] = [];

  if (job?.company_description) {
    const { aiConfig } = deserializeDriveColleges(job.company_description);
    if (aiConfig) {
      persona = aiConfig.persona || "";
      customRubric = aiConfig.rubric || "";
      examples = aiConfig.examples || [];
    }
  }

  try {
    if (stage === 2) {
      // Speaking skills stage: also score pronunciation and clarity
      const systemPrompt = `You are evaluating a spoken voice interview answer for speaking skills, clarity, and pronunciation.
${persona ? `Evaluate as this interviewer persona: ${persona}.` : ""}
Analyze for:
- Overall communication quality (0-100)
- Pronunciation quality inferred from word choice/coherence (0-100)
- Clarity and consistency of expression (0-100)
${customRubric ? `Use this specific grading rubric:\n${customRubric}` : ""}
Return ONLY JSON.
Constraints:
- "feedback" MUST be exactly one concise improvement sentence (max 18 words).
Schema:
{
  "score": 78,
  "pronunciation_score": 75,
  "clarity_score": 80,
  "feedback": "One concise feedback sentence."
}`;

      const userPrompt = `Question: ${question}\nAnswer: ${answer}`;

      const result = await generateAiJson<{
        score?: unknown;
        feedback?: unknown;
        pronunciation_score?: unknown;
        clarity_score?: unknown;
      }>({ systemPrompt, userPrompt });

      const score = clampScore(result.score, fallbackScore);
      return {
        score,
        feedback: String(result.feedback || fallbackFeedback(score)).trim(),
        pronunciation_score: clampScore(result.pronunciation_score, score),
        clarity_score: clampScore(result.clarity_score, score),
      };
    }

    // Default scoring for intro and technical stages
    const systemPrompt = `You are scoring a live AI interview answer.
${persona ? `Evaluate as this interviewer persona: ${persona}.` : ""}
Score 0-100 for: relevance, technical clarity, communication, specificity, and evidence.
${customRubric ? `Use this specific grading rubric to judge and grade the answer:\n${customRubric}` : ""}
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
Return ONLY JSON.
Constraints:
- "feedback" MUST be exactly one concise improvement sentence (max 18 words).
Schema:
{
  "score": 82,
  "feedback": "One concise feedback sentence."
}`;

    const userPrompt = `Question: ${question}\nAnswer: ${answer}`;

    const result = await generateAiJson<{ score?: unknown; feedback?: unknown }>({ systemPrompt, userPrompt });
    const score = clampScore(result.score, fallbackScore);
    return {
      score,
      feedback: String(result.feedback || fallbackFeedback(score)).trim(),
    };
  } catch (err) {
    console.warn("AI answer scoring failed, using fallback:", err);
    return {
      score: fallbackScore,
      feedback: fallbackFeedback(fallbackScore),
    };
  }
}

// ─── Summarize entire interview with stage scores ─────────────────────────────
async function summarizeInterview(
  answers: Array<{ score: number; question: string; answer: string; stage: number; pronunciation_score?: number; clarity_score?: number }>,
  interviewPassScore: number,
  job?: any
) {
  const stage1Answers = answers.filter((a) => a.stage === 1);
  const stage2Answers = answers.filter((a) => a.stage === 2);
  const stage3Answers = answers.filter((a) => a.stage === 3);

  const avg = (arr: { score: number }[]) =>
    arr.length ? Math.round(arr.reduce((s, a) => s + a.score, 0) / arr.length) : 0;

  const introScore = avg(stage1Answers);
  const speakingScore = avg(stage2Answers);
  const pronunciationScore = stage2Answers.length
    ? Math.round(stage2Answers.reduce((s, a) => s + (a.pronunciation_score || a.score), 0) / stage2Answers.length)
    : 0;
  const technicalScore = avg(stage3Answers);

  const overallScore = answers.length
    ? Math.round(answers.reduce((s, a) => s + a.score, 0) / answers.length)
    : 0;

  const selected = overallScore >= interviewPassScore;

  const fallback = {
    score: overallScore,
    intro_score: introScore,
    speaking_score: speakingScore,
    pronunciation_score: pronunciationScore,
    technical_score: technicalScore,
    selected,
    relevance_score: Math.max(0, Math.min(100, overallScore + 3)),
    communication_score: Math.max(0, Math.min(100, overallScore - 2)),
    summary: `Candidate completed ${answers.length} interview responses with an overall score of ${overallScore}/100.`,
    feedback: overallScore >= 75
      ? "Strong interview performance. Keep answers concise and back them with measurable outcomes."
      : "Improve with stronger examples, clearer structure, and deeper technical explanation.",
  };

  if (!answers.length || !hasAiKey()) return fallback;

  let persona = "";
  if (job?.company_description) {
    const { aiConfig } = deserializeDriveColleges(job.company_description);
    if (aiConfig) {
      persona = aiConfig.persona || "";
    }
  }

  try {
    const transcript = answers
      .map((a, i) => `Stage ${a.stage} Q${i + 1}: ${a.question}\nAnswer: ${a.answer}\nScore: ${a.score}`)
      .join("\n\n");

    const systemPrompt = `You are summarizing a completed technical placement AI interview.
${persona ? `The interview was conducted by the AI persona: ${persona}.` : ""}
Grade overall candidate relevance (0-100) and communication (0-100) based on transcript.
Return ONLY JSON.
Constraints:
- "summary": Single summary paragraph (max 60 words).
- "feedback": Short improvement paragraph (max 40 words).
Schema:
{
  "relevance_score": 84,
  "communication_score": 79,
  "summary": "Overall summary of the candidate performance.",
  "feedback": "Improvement-oriented feedback."
}`;

    const userPrompt = `Transcript:\n${transcript}`;

    const result = await generateAiJson<{
      relevance_score?: unknown;
      communication_score?: unknown;
      summary?: unknown;
      feedback?: unknown;
    }>({ systemPrompt, userPrompt });

    return {
      ...fallback,
      relevance_score: clampScore(result.relevance_score, fallback.relevance_score),
      communication_score: clampScore(result.communication_score, fallback.communication_score),
      summary: String(result.summary || fallback.summary).trim(),
      feedback: String(result.feedback || fallback.feedback).trim(),
    };
  } catch (err) {
    console.warn("AI interview summary failed, using fallback:", err);
    return fallback;
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get("/questions", (_req: AuthRequest, res) => {
  res.json({ questions: defaultTechnicalQuestions, stages: STAGES });
});

router.get("/eligibility", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "candidate") {
      res.status(403).json({ error: "Only candidates can access interview eligibility" });
      return;
    }

    const requestedExamId = typeof req.query.exam_id === "string" ? req.query.exam_id : undefined;
    const passedAttempts = await getPassedAttempts(req.user!.id, requestedExamId);

    res.json({
      eligible: passedAttempts.length > 0,
      selectedAttempt: passedAttempts[0] || null,
      passedAttempts,
      message: passedAttempts.length
        ? "Candidate is eligible for the AI interview."
        : "Pass an assigned exam to unlock the AI interview.",
    });
  } catch (err) {
    console.error("Interview eligibility error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get candidate's pending interview (auto-assigned after shortlisting)
router.get("/pending", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "candidate") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { data, error } = await supabase
      .from("ai_interviews")
      .select("*, exam:exam_id(title, description), job:job_id(title, company_name, interview_pass_score)")
      .eq("candidate_id", req.user!.id)
      .eq("status", "pending")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ interview: data || null });
  } catch (err) {
    console.error("Pending interview error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// List interviews waiting for the recruiter to set start/end time
router.get("/recruiter/pending", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "recruiter") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const collegeId = req.query.collegeId as string | undefined;

    // 1) Fetch exam IDs and job IDs created by this recruiter
    const [{ data: exams }, { data: jobs }] = await Promise.all([
      supabase.from("exams").select("id").eq("created_by", req.user!.id),
      supabase.from("jobs").select("id").eq("created_by", req.user!.id),
    ]);

    const examIds = (exams || []).map((e: any) => e.id);
    const jobIds = (jobs || []).map((j: any) => j.id);

    if (examIds.length === 0 && jobIds.length === 0) {
      res.json({ interviews: [] });
      return;
    }

    // 2) Fetch pending/scheduled AI interviews for those exams/jobs
    let query = supabase
      .from("ai_interviews")
      .select(
        "*, candidate:candidate_id(id, name, email), job:job_id(id, title, company_name), exam:exam_id(id, title)"
      )
      .eq("status", "pending")
      .order("started_at", { ascending: false });

    const conditions: string[] = [];
    if (examIds.length > 0) conditions.push(`exam_id.in.(${examIds.join(",")})`);
    if (jobIds.length > 0) conditions.push(`job_id.in.(${jobIds.join(",")})`);
    query = query.or(conditions.join(","));

    if (collegeId) {
      const { data: profiles } = await supabase
        .from("candidate_profiles")
        .select("user_id")
        .eq("college_id", collegeId);
      const userIds = (profiles || []).map(p => p.user_id);
      if (userIds.length === 0) {
        res.json({ interviews: [] });
        return;
      }
      query = query.in("candidate_id", userIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ interviews: data || [] });
  } catch (err) {
    console.error("Recruiter pending interviews error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/start", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "candidate") {
      res.status(403).json({ error: "Only candidates can start interviews" });
      return;
    }

    const { job_id, exam_id } = req.body;
    const requestedExamId = typeof exam_id === "string" ? exam_id : undefined;
    const [eligibleAttempt] = await getPassedAttempts(req.user!.id, requestedExamId);

    if (!eligibleAttempt) {
      res.status(403).json({ error: "Pass an assigned exam to unlock the AI interview." });
      return;
    }

    // Resolve job_id if not explicitly provided
    let resolvedJobId = job_id || null;
    if (!resolvedJobId) {
      const { data: jobData } = await supabase
        .from("jobs")
        .select("id")
        .eq("exam_id", eligibleAttempt.examId)
        .limit(1)
        .maybeSingle();
      if (jobData) {
        resolvedJobId = jobData.id;
      }
    }

    // Interview record exists in status "pending"; candidate can start only inside the recruiter-scheduled window.
    const { data: pendingInterview } = await supabase
      .from("ai_interviews")
      .select("id, job_id, scheduled_start_at, scheduled_end_at")
      .eq("candidate_id", req.user!.id)
      .eq("exam_id", eligibleAttempt.examId)
      .eq("status", "pending")
      .maybeSingle();

    if (!pendingInterview) {
      res.status(403).json({ error: "No AI interview record exists yet. Please wait for the recruiter to unlock it." });
      return;
    }

    if (!pendingInterview.scheduled_start_at || !pendingInterview.scheduled_end_at) {
      res.status(403).json({ error: "Recruiter has not scheduled your interview start/end time yet." });
      return;
    }

    const now = Date.now();
    const startMs = new Date(pendingInterview.scheduled_start_at).getTime();
    const endMs = new Date(pendingInterview.scheduled_end_at).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || now < startMs || now > endMs) {
      res.status(403).json({
        error: `Interview is scheduled between ${new Date(startMs).toLocaleString()} and ${new Date(endMs).toLocaleString()}.`,
      });
      return;
    }

    // Activate the scheduled interview
    const { data: interview, error } = await supabase
      .from("ai_interviews")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", pendingInterview.id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    const interviewRecord = interview;

    // Fetch job data for technical question generation
    let job = null;
    const jobId = interviewRecord.job_id || job_id;
    if (jobId) {
      const { data: jobData } = await supabase
        .from("jobs")
        .select("id, title, company_name, company_description, required_skills, interview_pass_score, interview_duration")
        .eq("id", jobId)
        .maybeSingle();
      job = jobData;
    }

    const stageQuestions = await buildStageQuestions(req.user!.id, eligibleAttempt, job);

    res.json({
      interview: interviewRecord,
      questions: stageQuestions.all,
      stages: STAGES,
      stageQuestions: {
        stage1: stageQuestions.stage1,
        stage2: stageQuestions.stage2,
        stage3: stageQuestions.stage3,
      },
      eligibleAttempt,
      job,
    });
  } catch (err) {
    console.error("Start interview error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Recruiter sets the interview start/end window after exam pass
router.post("/:interviewId/schedule", roleMiddleware(["recruiter"]), async (req: AuthRequest, res) => {
  try {
    const { interviewId } = req.params;
    const { scheduled_start_at, scheduled_end_at, start_at, end_at } = req.body as Record<string, any>;

    const startIso = scheduled_start_at || start_at ? new Date(scheduled_start_at || start_at).toISOString() : null;
    const endIso = scheduled_end_at || end_at ? new Date(scheduled_end_at || end_at).toISOString() : null;

    if (!startIso || !endIso) {
      res.status(400).json({ error: "scheduled_start_at and scheduled_end_at are required" });
      return;
    }

    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      res.status(400).json({ error: "scheduled_end_at must be after scheduled_start_at" });
      return;
    }

    const { data: interview } = await supabase
      .from("ai_interviews")
      .select("id, candidate_id, job_id, exam_id, status")
      .eq("id", interviewId)
      .maybeSingle();

    if (!interview) {
      res.status(404).json({ error: "Interview not found" });
      return;
    }

    if (interview.status !== "pending") {
      res.status(403).json({ error: "Interview cannot be scheduled in its current status" });
      return;
    }

    // Verify recruiter owns the job or exam behind this interview
    let recruiterId: string | null = null;
    if (interview.job_id) {
      const { data: job } = await supabase.from("jobs").select("created_by").eq("id", interview.job_id).maybeSingle();
      recruiterId = job?.created_by ?? null;
    } else if (interview.exam_id) {
      const { data: exam } = await supabase.from("exams").select("created_by").eq("id", interview.exam_id).maybeSingle();
      recruiterId = exam?.created_by ?? null;
    }

    if (!recruiterId || recruiterId !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { data: updated, error: updErr } = await supabase
      .from("ai_interviews")
      .update({
        scheduled_start_at: startIso,
        scheduled_end_at: endIso,
        scheduled_by: req.user!.id,
        status: "pending",
        // Keep started_at aligned with the scheduled window for recruiter/candidate listing.
        started_at: startIso,
      })
      .eq("id", interviewId)
      .select()
      .single();

    if (updErr) throw updErr;

    // Notify the candidate about the scheduled window
    try {
      await supabase.from("notifications").insert({
        user_id: interview.candidate_id,
        title: "AI Interview Scheduled",
        body: `Your AI interview is scheduled between ${new Date(startIso).toLocaleString()} and ${new Date(endIso).toLocaleString()}.`,
      });
    } catch (notifErr) {
      console.warn("Candidate schedule notification warning (non-fatal):", notifErr);
    }

    res.json({ interview: updated });
  } catch (err) {
    console.error("Schedule interview error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/:interviewId/answers", async (req: AuthRequest, res) => {
  try {
    const { interviewId } = req.params;

    const { data: interview, error: intErr } = await supabase
      .from("ai_interviews")
      .select("candidate_id, job_id, exam_id, status, score, feedback, summary, started_at, submitted_at, intro_score, speaking_score, pronunciation_score, technical_score, relevance_score, communication_score, selected")
      .eq("id", interviewId)
      .maybeSingle();

    if (intErr || !interview) {
      res.status(404).json({ error: "Interview not found" });
      return;
    }

    const isCandidateOwner = req.user!.id === interview.candidate_id;
    const isStaff = ["admin", "recruiter"].includes(req.user!.role);

    if (!isCandidateOwner && req.user!.role === "recruiter") {
      let recruiterId: string | null = null;
      if (interview.job_id) {
        const { data: job } = await supabase.from("jobs").select("created_by").eq("id", interview.job_id).maybeSingle();
        recruiterId = job?.created_by ?? null;
      } else if (interview.exam_id) {
        const { data: exam } = await supabase.from("exams").select("created_by").eq("id", interview.exam_id).maybeSingle();
        recruiterId = exam?.created_by ?? null;
      }
      if (!recruiterId || recruiterId !== req.user!.id) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    } else if (!isCandidateOwner && req.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { data: answers, error: ansErr } = await supabase
      .from("ai_interview_answers")
      .select("*")
      .eq("interview_id", interviewId)
      .order("created_at", { ascending: true });

    if (ansErr) {
      res.status(400).json({ error: ansErr.message });
      return;
    }

    res.json({
      interview,
      answers: answers || [],
    });
  } catch (err) {
    console.error("Fetch interview answers error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/:interviewId/answer", async (req: AuthRequest, res) => {
  try {
    const { interviewId } = req.params;
    const { question, answer, stage = 1, audio } = req.body;
    if (!question || (!answer && !audio)) {
      res.status(400).json({ error: "question and either answer or audio are required" });
      return;
    }

    const { data: interview } = await supabase
      .from("ai_interviews")
      .select("candidate_id, status, job_id")
      .eq("id", interviewId)
      .single();

    if (!interview || interview.candidate_id !== req.user!.id || interview.status === "completed") {
      res.status(403).json({ error: "Interview is not editable" });
      return;
    }

    let job = null;
    if (interview.job_id) {
      const { data: jobData } = await supabase
        .from("jobs")
        .select("company_description")
        .eq("id", interview.job_id)
        .maybeSingle();
      job = jobData;
    }

    let finalAnswer = answer || "";
    let audioUrl = "";

    if (audio) {
      try {
        const audioBuffer = Buffer.from(audio, "base64");
        const fileName = `${interviewId}_${Date.now()}.wav`;

        const { error: uploadError } = await supabase.storage
          .from("intellihire")
          .upload(`audio/${fileName}`, audioBuffer, {
            contentType: "audio/wav",
            upsert: true,
          });

        if (uploadError) {
          console.error("Supabase Storage audio upload error:", uploadError);
        } else {
          const { data: publicUrlData } = supabase.storage
            .from("intellihire")
            .getPublicUrl(`audio/${fileName}`);
          audioUrl = publicUrlData.publicUrl;

          if (process.env.GROQ_API_KEY) {
            const formData = new FormData();
            const audioBlob = new Blob([audioBuffer], { type: "audio/wav" });
            formData.append("file", audioBlob, "answer.wav");
            formData.append("model", "whisper-large-v3");

            const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
              },
              body: formData,
            });

            if (!response.ok) {
              const body = await response.json();
              console.error("Groq Whisper API transcription error:", body?.error?.message);
            } else {
              const body: any = await response.json();
              if (body?.text) {
                finalAnswer = body.text;
              }
            }
          }
        }
      } catch (audioErr) {
        console.error("Audio processing failed, falling back to text:", audioErr);
      }
    }

    // Evaluate the final transcribed text or text fallback
    const evaluation = await evaluateAnswer(String(question), String(finalAnswer), Number(stage), job);

    const feedbackValue = audioUrl
      ? JSON.stringify({ feedback: evaluation.feedback, audio_url: audioUrl })
      : evaluation.feedback;

    const { data, error } = await supabase
      .from("ai_interview_answers")
      .insert({
        interview_id: interviewId,
        question,
        answer: finalAnswer,
        score: evaluation.score,
        feedback: feedbackValue,
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({
      answer: data,
      pronunciation_score: evaluation.pronunciation_score,
      clarity_score: evaluation.clarity_score,
    });
  } catch (err) {
    console.error("Interview answer error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/:interviewId/submit", async (req: AuthRequest, res) => {
  try {
    const { interviewId } = req.params;

    // Fetch interview + job pass score
    const { data: interview } = await supabase
      .from("ai_interviews")
      .select("candidate_id, job_id, exam_id")
      .eq("id", interviewId)
      .single();

    if (!interview || interview.candidate_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    let interviewPassScore = 60; // default
    let job = null;
    if (interview.job_id) {
      const { data: jobData } = await supabase
        .from("jobs")
        .select("interview_pass_score, company_description")
        .eq("id", interview.job_id)
        .maybeSingle();
      job = jobData;
      interviewPassScore = Number(job?.interview_pass_score ?? 60);
    }

    const { data: rawAnswers } = await supabase
      .from("ai_interview_answers")
      .select("score, question, answer")
      .eq("interview_id", interviewId)
      .order("created_at", { ascending: true });

    // Map stage by question index (2 intro, 2 speaking, 3 technical)
    const answers = (rawAnswers || []).map((a: any, i: number) => ({
      score: Number(a.score || 0),
      question: String(a.question || ""),
      answer: String(a.answer || ""),
      stage: i < 2 ? 1 : i < 4 ? 2 : 3,
    }));

    const result = await summarizeInterview(answers, interviewPassScore, job);

    const { data, error } = await supabase
      .from("ai_interviews")
      .update({
        status: "completed",
        score: result.score,
        intro_score: result.intro_score,
        speaking_score: result.speaking_score,
        pronunciation_score: result.pronunciation_score,
        technical_score: result.technical_score,
        selected: result.selected,
        relevance_score: result.relevance_score,
        communication_score: result.communication_score,
        summary: result.summary,
        feedback: result.feedback,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", interviewId)
      .eq("candidate_id", req.user!.id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    // Update candidate_status to offered or rejected based on selection
    try {
      if (interview.job_id) {
        const newStatus = result.selected ? "offered" : "rejected";
        await supabase
          .from("candidate_status")
          .update({ status: newStatus })
          .eq("job_id", interview.job_id)
          .eq("candidate_id", req.user!.id);
      }
    } catch (statusErr) {
      console.warn("Status update warning (non-fatal):", statusErr);
    }

    // Notify the recruiter with selection + analysis
    try {
      let recruiterId: string | null = null;
      if (interview.job_id) {
        const { data: job } = await supabase.from("jobs").select("created_by").eq("id", interview.job_id).maybeSingle();
        recruiterId = job?.created_by ?? null;
      } else if (interview.exam_id) {
        const { data: exam } = await supabase.from("exams").select("created_by").eq("id", interview.exam_id).maybeSingle();
        recruiterId = exam?.created_by ?? null;
      }

      if (recruiterId) {
        await supabase.from("notifications").insert({
          user_id: recruiterId,
          title: result.selected ? "AI Interview Result: Selected" : "AI Interview Result: Not Selected",
          body: `AI interview completed. Overall: ${result.score}/100.\nSummary: ${result.summary}\nFeedback: ${result.feedback}`,
        });
      }
    } catch (notifErr) {
      console.warn("Recruiter completion notification warning (non-fatal):", notifErr);
    }

    res.json({ interview: data, selected: result.selected });
  } catch (err) {
    console.error("Submit interview error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/mine", async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("ai_interviews")
    .select("*")
    .eq("candidate_id", req.user!.id)
    .order("started_at", { ascending: false });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json({ interviews: data || [] });
});

router.get("/summaries", async (req: AuthRequest, res) => {
  try {
    if (!["admin", "recruiter"].includes(req.user!.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const collegeId = req.query.collegeId as string | undefined;

    let query = supabase
      .from("ai_interviews")
      .select("*, candidate:candidate_id(id, name, email), job:job_id(title, company_name), exam:exam_id(title)")
      .order("started_at", { ascending: false });

    if (req.user!.role === "recruiter") {
      // 1. Fetch exam IDs created by this recruiter
      const { data: exams } = await supabase
        .from("exams")
        .select("id")
        .eq("created_by", req.user!.id);
      const examIds = (exams || []).map((e) => e.id);

      // 2. Fetch job IDs created by this recruiter
      const { data: jobs } = await supabase
        .from("jobs")
        .select("id")
        .eq("created_by", req.user!.id);
      const jobIds = (jobs || []).map((j) => j.id);

      if (examIds.length === 0 && jobIds.length === 0) {
        res.json({ interviews: [] });
        return;
      }

      const conditions = [];
      if (examIds.length > 0) {
        conditions.push(`exam_id.in.(${examIds.join(",")})`);
      }
      if (jobIds.length > 0) {
        conditions.push(`job_id.in.(${jobIds.join(",")})`);
      }

      query = query.or(conditions.join(","));
    }

    if (collegeId) {
      const { data: profiles } = await supabase
        .from("candidate_profiles")
        .select("user_id")
        .eq("college_id", collegeId);
      const userIds = (profiles || []).map(p => p.user_id);
      if (userIds.length === 0) {
        res.json({ interviews: [] });
        return;
      }
      query = query.in("candidate_id", userIds);
    }

    const { data, error } = await query;
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ interviews: data || [] });
  } catch (err) {
    console.error("Summaries error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

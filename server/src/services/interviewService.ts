import { interviewRepository as interviewRepo } from "../repositories/interviewRepository.js";
import { aiService } from "../lib/ai.js";
import { deserializeDriveColleges } from "./recruiterService.js";
import { logger } from "../lib/logger.js";
import { gradingQueue } from "../lib/queue.js"; // We will add interview evaluation pushing directly to this queue file.

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

export async function getPassedAttempts(candidateId: string, examId?: string): Promise<PassedAttempt[]> {
  const attempts = await interviewRepo.getAttemptsByCandidate(candidateId, examId);
  return attempts
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

export async function checkEligibility(candidateId: string) {
  const passed = await getPassedAttempts(candidateId);
  if (passed.length === 0) {
    return { eligible: false, message: "No qualifying exam result was found for this candidate account." };
  }
  return { eligible: true, attempts: passed };
}

export async function getPendingInterviewsList(candidateId: string) {
  return interviewRepo.getPendingInterviews(candidateId);
}

export async function getRecruiterPending(recruiterId: string) {
  return interviewRepo.getRecruiterPendingInterviews(recruiterId);
}

export async function startInterview(candidateId: string, jobId?: string, examId?: string) {
  const eligibleAttempts = await getPassedAttempts(candidateId, examId);
  if (eligibleAttempts.length === 0) {
    throw new Error("You must pass the qualifying exam first.");
  }

  const attempt = eligibleAttempts[0];
  const job = jobId ? await interviewRepo.getJobById(jobId) : null;
  const questionsData = await buildStageQuestions(candidateId, attempt, job);

  return interviewRepo.insertInterview({
    candidate_id: candidateId,
    exam_id: attempt.examId,
    job_id: jobId || null,
    status: "started",
    questions: questionsData.all,
  });
}

export async function scheduleInterview(interviewId: string, scheduledStart: string, scheduledEnd: string) {
  return interviewRepo.updateInterview(interviewId, {
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
    status: "scheduled",
  });
}

export async function getInterviewAnswersList(interviewId: string) {
  return interviewRepo.getInterviewAnswers(interviewId);
}

export async function feedAnswer(interviewId: string, candidateId: string, question: string, answer: string, stage: number) {
  const interview = await interviewRepo.getInterviewById(interviewId);
  if (!interview || interview.candidate_id !== candidateId) {
    throw new Error("Forbidden");
  }

  if (interview.status !== "started" && interview.status !== "in_progress") {
    throw new Error("Interview is not active");
  }

  if (interview.status === "started") {
    await interviewRepo.updateInterview(interviewId, { status: "in_progress" });
  }

  const evalResult = await evaluateAnswer(question, answer, stage, interview.jobs);

  return interviewRepo.insertInterviewAnswer({
    interview_id: interviewId,
    question,
    answer,
    score: evalResult.score,
    pronunciation_score: evalResult.pronunciation_score,
    clarity_score: evalResult.clarity_score,
    feedback: evalResult.feedback,
  });
}

export async function submitInterview(interviewId: string, candidateId: string) {
  const interview = await interviewRepo.getInterviewById(interviewId);
  if (!interview || interview.candidate_id !== candidateId) {
    throw new Error("Forbidden");
  }

  // Update status to processing (or submitted)
  const updated = await interviewRepo.updateInterview(interviewId, {
    status: "processing",
    submitted_at: new Date().toISOString(),
  });

  // Push job to the background queue for asynchronous Gemini evaluation!
  gradingQueue.pushInterviewEvaluation(interviewId);

  return { interview: updated };
}

export async function evaluateInterview(interviewId: string) {
  const interview = await interviewRepo.getInterviewById(interviewId);
  if (!interview) {
    throw new Error(`Interview ${interviewId} not found`);
  }

  let interviewPassScore = 60;
  const job = interview.jobs;
  if (job?.interview_pass_score) {
    interviewPassScore = Number(job.interview_pass_score);
  }

  const rawAnswers = await interviewRepo.getInterviewAnswers(interviewId);
  const answers = (rawAnswers || []).map((a: any, i: number) => ({
    score: Number(a.score || 0),
    question: String(a.question || ""),
    answer: String(a.answer || ""),
    stage: i < 2 ? 1 : i < 4 ? 2 : 3,
    pronunciation_score: a.pronunciation_score ? Number(a.pronunciation_score) : undefined,
    clarity_score: a.clarity_score ? Number(a.clarity_score) : undefined,
  }));

  const result = await summarizeInterview(answers, interviewPassScore, job);

  return interviewRepo.updateInterview(interviewId, {
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
  });
}

export async function getInterviewDetails(interviewId: string, userId: string, role: string) {
  const interview = await interviewRepo.getInterviewById(interviewId);
  if (!interview) {
    throw new Error("Interview not found");
  }
  if (role === "candidate" && interview.candidate_id !== userId) {
    throw new Error("Forbidden");
  }
  return { interview };
}

export async function getCandidateInterviews(candidateId: string) {
  const interviews = await interviewRepo.getInterviewsByCandidate(candidateId);
  return { interviews };
}

export async function getRecruiterInterviews(role: string, userId: string, collegeId?: string) {
  const interviews = await interviewRepo.getInterviewSummaries(role, userId, collegeId);
  return { interviews };
}

async function buildStageQuestions(candidateId: string, attempt: PassedAttempt, job: any) {
  const introQuestions = defaultIntroQuestions;
  const speakingQuestions = defaultSpeakingQuestions;
  let technicalQuestions = defaultTechnicalQuestions;

  if (aiService.hasAiKey()) {
    try {
      const profile = await interviewRepo.getCandidateProfile(candidateId);
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

      const result = await aiService.generateAiJson<{ questions?: unknown[] }>(`
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
      logger.warn({ err }, "AI technical question generation failed, using defaults");
    }
  }

  return {
    stage1: introQuestions,
    stage2: speakingQuestions,
    stage3: technicalQuestions,
    all: [...introQuestions, ...speakingQuestions, ...technicalQuestions],
  };
}

async function evaluateAnswer(question: string, answer: string, stage: number, job?: any) {
  const fallbackScore = scoreAnswer(answer);

  if (!aiService.hasAiKey()) {
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

      const result = await aiService.generateAiJson<{
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

    const result = await aiService.generateAiJson<{ score?: unknown; feedback?: unknown }>({ systemPrompt, userPrompt });
    const score = clampScore(result.score, fallbackScore);
    return {
      score,
      feedback: String(result.feedback || fallbackFeedback(score)).trim(),
    };
  } catch (err) {
    logger.warn({ err }, "AI answer scoring failed, using fallback");
    return {
      score: fallbackScore,
      feedback: fallbackFeedback(fallbackScore),
    };
  }
}

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

  if (!answers.length || !aiService.hasAiKey()) return fallback;

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

    const result = await aiService.generateAiJson<{
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
    logger.warn({ err }, "AI interview summary failed, using fallback");
    return fallback;
  }
}

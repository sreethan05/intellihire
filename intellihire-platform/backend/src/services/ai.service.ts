import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

async function jsonPrompt<T>(prompt: string): Promise<T> {
  const response = await client.responses.create({
    model,
    input: prompt,
    text: { format: { type: "json_object" } }
  });
  return JSON.parse(response.output_text) as T;
}

export const AIService = {
  parseResume: (text: string) =>
    jsonPrompt(`Extract from this resume: name, email, phone, skills (as array), education (degree, institution, year), experience (company, role, duration), projects. Return as JSON.\n\n${text.slice(0, 12000)}`),
  generateMcqs: (topic: string, difficulty: string, count: number) =>
    jsonPrompt(`Generate ${Math.min(count, 10)} multiple choice questions on ${topic} at ${difficulty} difficulty for a technical recruitment exam. Each question should have 4 options with one correct answer. Include the correct option index. Return as JSON array under key questions.`),
  generateCodingProblem: (topic: string, difficulty: string) =>
    jsonPrompt(`Create a coding problem on ${topic} at ${difficulty} difficulty. Include: title, problem statement, input format, output format, constraints, 3 sample test cases with input and expected output, 2 hidden test cases. Return as JSON.`),
  generateInterviewQuestions: (payload: { job_title: string; job_description: string; duration_minutes: number; question_types: string[]; candidate_skills?: string[] }) =>
    jsonPrompt(`You are a senior technical recruiter. Generate a structured async interview for this role.
Return JSON with key "questions" as an array of objects. Each object must have: id, type, question, expected_signal.
Create enough questions for ${payload.duration_minutes} minutes, but keep it between 3 and 8 questions.
Question types requested: ${payload.question_types.join(", ")}.
Candidate skills if known: ${(payload.candidate_skills ?? []).join(", ") || "not provided"}.
Job title: ${payload.job_title}
Job description: ${payload.job_description}`),
  generateFollowups: (payload: { job_title: string; questions: unknown; answers: unknown }) =>
    jsonPrompt(`Generate exactly 2 follow-up interview questions based on the candidate's answers. Return JSON with key "questions" as an array of objects with id, type, question, expected_signal. Role: ${payload.job_title}. Original questions: ${JSON.stringify(payload.questions)}. Answers: ${JSON.stringify(payload.answers)}`),
  improvementReport: (topicScores: unknown) =>
    client.responses.create({ model, input: `Analyze this candidate's exam performance. Scores by topic: ${JSON.stringify(topicScores)}. Generate a personalized improvement report with: strengths (top 2 topics), areas to improve (bottom 2 topics), specific study recommendations, estimated preparation time needed. Keep under 300 words.` }).then((r) => r.output_text),
  interviewSummary: (transcript: unknown) =>
    jsonPrompt(`Summarize this technical interview. Provide: overall impression, technical strengths, communication score (1-10), areas of concern, hiring recommendation (strong yes / yes / maybe / no), and a 2-sentence debrief. Interview: ${JSON.stringify(transcript)}`),
  evaluateInterview: (payload: { job_title: string; job_description?: string; questions: unknown; answers: unknown; candidate?: unknown }) =>
    jsonPrompt(`You are an AI interview evaluator for a campus recruitment platform. Be fair, specific, and concise.
Evaluate this candidate for: ${payload.job_title}.
Return JSON with exactly these keys:
overall_score number 0-10,
technical_score number 0-10,
communication_score number 0-10,
problem_solving_score number 0-10,
confidence_score number 0-10,
strengths array of strings,
areas_to_improve array of strings,
per_question_feedback array of { question, score, feedback },
summary string under 90 words,
recommendation one of "strong_hire", "hire", "consider", "not_recommended",
recommendation_message string.
Job description: ${payload.job_description ?? "not provided"}
Candidate: ${JSON.stringify(payload.candidate ?? {})}
Questions: ${JSON.stringify(payload.questions)}
Answers: ${JSON.stringify(payload.answers)}`),
  skillMatch: (candidateSkills: string[], jobRequirements: string[]) =>
    jsonPrompt(`Compare candidate skills ${JSON.stringify(candidateSkills)} with job requirements ${JSON.stringify(jobRequirements)}. Return: match_percentage, matched_skills, missing_skills, recommendation.`),
  candidateDebrief: (data: unknown) =>
    client.responses.create({ model, input: `Write a 3-4 sentence professional debrief paragraph about this candidate summarizing their overall performance, key strengths, and potential fit for the role. Data: ${JSON.stringify(data)}` }).then((r) => r.output_text)
};

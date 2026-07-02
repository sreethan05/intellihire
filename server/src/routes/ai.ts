import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { Router } from "express";
import { db } from "../lib/postgres.js";
import { generateExam, getBankStats } from "../lib/examPipeline.js";
import { authMiddleware, type AuthRequest } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const realFallbackMcqs: Record<string, Record<string, McqQuestion[]>> = JSON.parse(
  await fs.readFile(resolve(__dirname, "../../data/fallbackMcqs.json"), "utf-8")
);

const realFallbackCoding: Record<string, Record<string, CodingDraft[]>> = JSON.parse(
  await fs.readFile(resolve(__dirname, "../../data/fallbackCoding.json"), "utf-8")
);

const router = Router();
router.use(authMiddleware);

type McqQuestion = {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: "A" | "B" | "C" | "D";
  marks: number;
};

type CodingDraft = {
  title: string;
  description: string;
  difficulty: string;
  starter_code: string;
  test_cases: Array<{ input: string; expected_output: string }>;
  marks: number;
};



function normalizeWords(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeDifficulty(raw: string): "easy" | "medium" | "hard" | "very_hard" {
  const d = raw.toLowerCase().trim().replace(/\s+/g, "_");
  if (d.includes("very") && (d.includes("hard") || d.includes("tough") || d.includes("difficult"))) return "very_hard";
  if (d.includes("hard") || d.includes("tough") || d.includes("difficult")) return "hard";
  if (d.includes("easy") || d.includes("simple") || d.includes("basic")) return "easy";
  if (d.includes("medium") || d.includes("moderate") || d.includes("intermediate")) return "medium";
  return "medium";
}

function mapPipelineToMcq(q: any): McqQuestion {
  return {
    question_text: q.question_text,
    option_a: q.option_a,
    option_b: q.option_b,
    option_c: q.option_c,
    option_d: q.option_d,
    correct_option: (q.correct_option || "A").toUpperCase() as "A" | "B" | "C" | "D",
    marks: q.marks || 1,
  };
}

function mapPipelineToCoding(q: any): CodingDraft {
  return {
    title: q.title,
    description: q.description,
    difficulty: q.difficulty,
    starter_code: q.starter_code || "",
    test_cases: Array.isArray(q.test_cases) ? q.test_cases : [],
    marks: q.marks || 10,
  };
}

function pickSkills(text: string) {
  const known = ["javascript", "typescript", "python", "java", "c++", "sql", "react", "node", "express", "postgres", "mongodb", "aws", "docker", "git", "html", "css", "dsa", "machine learning"];
  const words = normalizeWords(text).join(" ");
  return known.filter((skill) => words.includes(skill));
}

function fallbackMcqs(topic: string, difficulty: string, count: number): McqQuestion[] {
  const topicKey = topic.toLowerCase().trim();
  const lookupDifficulty = difficulty === "very_hard" ? "hard" : difficulty;
  const poolKeys = Object.keys(realFallbackMcqs);
  
  if (topicKey === "general dsa" || topicKey === "general" || topicKey === "technical" || !topicKey) {
    return Array.from({ length: count }).map((_, index) => {
      const key = poolKeys[index % poolKeys.length];
      const diffPool = realFallbackMcqs[key][lookupDifficulty] || realFallbackMcqs[key]["easy"] || realFallbackMcqs[key]["medium"] || realFallbackMcqs[key]["hard"];
      const q = diffPool[Math.floor(index / poolKeys.length) % diffPool.length];
      return { ...q, question_text: `${q.question_text} (${key.toUpperCase()})` };
    });
  }

  if (realFallbackMcqs[topicKey] && realFallbackMcqs[topicKey][lookupDifficulty]) {
    const pool = realFallbackMcqs[topicKey][lookupDifficulty];
    return Array.from({ length: count }).map((_, index) => {
      const q = pool[index % pool.length];
      return { ...q };
    });
  }

  const defaultMcqs: McqQuestion[] = [
    {
      question_text: "Which of the following is correct regarding memory allocation for variables in a functional programming context?",
      option_a: "Variables are mutable by default and allocated on the heap.",
      option_b: "Variables are immutable by default, allowing safe concurrency.",
      option_c: "Memory is managed manually using malloc/free.",
      option_d: "Dynamic variables bypass standard stack compilation.",
      correct_option: "B",
      marks: 1,
    },
    {
      question_text: "What is the main advantage of dynamic programming over simple recursion?",
      option_a: "It consumes less memory space in all cases.",
      option_b: "It avoids redundant computations by storing results of subproblems.",
      option_c: "It operates in constant time complexity.",
      option_d: "It replaces compilation routines.",
      correct_option: "B",
      marks: 1,
    },
    {
      question_text: "When analyzing space complexity of algorithms, which growth rate represents the most efficient space usage?",
      option_a: "O(2^n)",
      option_b: "O(1)",
      option_c: "O(n log n)",
      option_d: "O(n^2)",
      correct_option: "B",
      marks: 1,
    }
  ];

  return Array.from({ length: count }).map((_, index) => {
    const q = defaultMcqs[index % defaultMcqs.length];
    return {
      ...q,
      question_text: q.question_text + " (Topic: " + topic + ")"
    };
  });
}

function fallbackCoding(topic: string, difficulty: string, index = 0): CodingDraft {
  const lookupDifficulty = difficulty === "very_hard" ? "hard" : difficulty;
  const marks = difficulty === "very_hard" ? 25 : difficulty === "hard" ? 20 : difficulty === "easy" ? 10 : 15;
  const topicKey = topic.toLowerCase().trim();

  if (topicKey === "general dsa" || topicKey === "general" || topicKey === "technical" || !topicKey) {
    const fallbackTopics = ["arrays", "strings", "linked lists", "stacks", "queues", "sorting", "binary trees", "graphs", "recursion", "dynamic programming"];
    const selectedTopic = fallbackTopics[index % fallbackTopics.length];
    
    return {
      title: `${selectedTopic.replace(/\b\w/g, (char) => char.toUpperCase())} Challenge ${Math.floor(index / fallbackTopics.length) + 1}`,
      description: `Write a program to solve a coding task on ${selectedTopic}. Read input from standard input and print the corresponding output.`,
      difficulty,
      starter_code: "n = int(input())\narr = list(map(int, input().split()))\n# write your code here",
      test_cases: [
        { input: "5\n1 2 3 4 5", expected_output: "15" },
        { input: "3\n10 -2 4", expected_output: "12" }
      ],
      marks
    };
  }

  if (realFallbackCoding[topicKey] && realFallbackCoding[topicKey][lookupDifficulty]) {
    const pool = realFallbackCoding[topicKey][lookupDifficulty];
    const picked = pool[index % pool.length];
    return { ...picked, difficulty, marks };
  }

  return {
    title: `${topic.replace(/\b\w/g, (char) => char.toUpperCase())} Challenge ${index + 1}`,
    description: `Write a program to solve a coding task on ${topic}. Read input from standard input and print the corresponding output.`,
    difficulty,
    starter_code: "n = int(input())\narr = list(map(int, input().split()))\n# write your code here",
    test_cases: [
      { input: "5\n1 2 3 4 5", expected_output: "15" },
      { input: "3\n10 -2 4", expected_output: "12" },
    ],
    marks,
  };
}

function _cleanMcqs(value: unknown, topic: string, difficulty: string, count: number) {
  const candidate = value as { questions?: McqQuestion[] };
  const questions = Array.isArray(candidate.questions) ? candidate.questions : [];
  const cleaned = questions.slice(0, count).map((question, index) => ({
    question_text: String(question.question_text || `${topic} question ${index + 1}`),
    option_a: String(question.option_a || "Option A"),
    option_b: String(question.option_b || "Option B"),
    option_c: String(question.option_c || "Option C"),
    option_d: String(question.option_d || "Option D"),
    correct_option: ["A", "B", "C", "D"].includes(String(question.correct_option).toUpperCase())
      ? String(question.correct_option).toUpperCase() as "A" | "B" | "C" | "D"
      : "A",
    marks: Number(question.marks || 1),
  }));

  return cleaned.length ? cleaned : fallbackMcqs(topic, difficulty, count);
}

function cleanCoding(value: unknown, topic: string, difficulty: string) {
  const candidate = (value as { question?: Partial<CodingDraft> }).question || {};
  const fallback = fallbackCoding(topic, difficulty, 0);
  const testCases = Array.isArray(candidate.test_cases) && candidate.test_cases.length
    ? candidate.test_cases.map((testCase) => ({
        input: String(testCase.input ?? ""),
        expected_output: String(testCase.expected_output ?? ""),
      }))
    : fallback.test_cases;

  return {
    title: String(candidate.title || fallback.title),
    description: String(candidate.description || fallback.description),
    difficulty: ["easy", "medium", "hard"].includes(String(candidate.difficulty)) ? String(candidate.difficulty) : difficulty,
    starter_code: String(candidate.starter_code || fallback.starter_code),
    test_cases: testCases,
    marks: Number(candidate.marks || fallback.marks),
  };
}

function _cleanCodingList(value: unknown, topic: string, difficulty: string, count: number): CodingDraft[] {
  const candidate = value as { questions?: Array<Partial<CodingDraft>> };
  const questions = Array.isArray(candidate.questions) ? candidate.questions : [];
  const cleaned = questions.slice(0, count).map((q) => cleanCoding({ question: q }, topic, difficulty));
  
  if (cleaned.length) return cleaned;
  return Array.from({ length: count }).map((_, idx) => fallbackCoding(topic, difficulty, idx));
}

router.post("/resume-parse", async (req: AuthRequest, res) => {
  const resumeText = String(req.body.resume_text || "");
  const jobSkills = Array.isArray(req.body.job_skills) ? req.body.job_skills.map(String) : [];
  const skills = pickSkills(resumeText);
  const matched = jobSkills.filter((skill: string) => skills.includes(skill.toLowerCase()));
  const score = jobSkills.length ? Math.round((matched.length / jobSkills.length) * 100) : Math.min(95, skills.length * 12);

  res.json({
    skills,
    matchedSkills: matched,
    skillMatchScore: score,
    summary: skills.length
      ? `Profile shows strength in ${skills.slice(0, 5).join(", ")} with a ${score}% role-fit signal.`
      : "Resume text was processed, but no common technical skills were detected.",
    improvements: [
      "Add project outcomes with measurable impact.",
      "Mention tools, frameworks, and deployment details explicitly.",
      "Keep resume bullets action-oriented and role-specific.",
    ],
  });
});

router.post("/generate-mcq", async (req: AuthRequest, res) => {
  const topic = String(req.body.topic || "technical").toLowerCase();
  const difficulty = normalizeDifficulty(String(req.body.difficulty || "medium"));
  const count = Math.min(50, Math.max(1, Number(req.body.count || 5)));

  // ─── IntelliHire Exam Pipeline ───
  // Zero-API, zero-cost, local question bank with intelligent selection
  // and deterministic variation. This replaces cloud LLM generation for exams.
  try {
    const bankStatus = await getBankStats();
    if (bankStatus.healthy && bankStatus.totalMcq >= count) {
      const result = await generateExam({
        topic,
        difficulty,
        count,
        questionType: "mcq",
        balanceSubtopics: true,
        variationDepth: 1,
      });
      const questions = result.questions.map(mapPipelineToMcq);
      res.json({
        questions,
        source: "pipeline",
        metadata: result.metadata,
      });
      return;
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, "[ExamPipeline] MCQ generation failed, falling back to static bank");
  }

  // Fallback: static in-memory bank (no API call)
  res.json({ questions: fallbackMcqs(topic, difficulty, count), source: "fallback" });
});

router.post("/generate-coding", async (req: AuthRequest, res) => {
  const topic = String(req.body.topic || "arrays").toLowerCase();
  const difficulty = normalizeDifficulty(String(req.body.difficulty || "medium"));
  const count = Math.min(5, Math.max(1, Number(req.body.count || 1)));

  // ─── IntelliHire Exam Pipeline ───
  try {
    const bankStatus = await getBankStats();
    if (bankStatus.healthy && bankStatus.totalCoding >= count) {
      const result = await generateExam({
        topic,
        difficulty,
        count,
        questionType: "coding",
        variationDepth: 1,
      });
      const questions = result.codingQuestions.map(mapPipelineToCoding);
      res.json({
        questions,
        question: questions[0] || fallbackCoding(topic, difficulty, 0),
        source: "pipeline",
        metadata: result.metadata,
      });
      return;
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, "[ExamPipeline] Coding generation failed, falling back to static bank");
  }

  // Fallback: static in-memory bank (no API call)
  const questions = Array.from({ length: count }).map((_, idx) => fallbackCoding(topic, difficulty, idx));
  res.json({ questions, question: questions[0], source: "fallback" });
});

router.post("/improvement-report", async (req: AuthRequest, res) => {
  try {
    const { attempt_id } = req.body;
    if (!attempt_id) {
      res.status(400).json({ error: "attempt_id required" });
      return;
    }

    const { data: attempt } = await db
      .from("attempts")
      .select("id, candidate_id, score, exams:exam_id(title, total_marks, pass_marks)")
      .eq("id", attempt_id)
      .single();

    if (!attempt || attempt.candidate_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const exam = Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams;
    const percentage = exam?.total_marks ? Math.round(((attempt.score || 0) / exam.total_marks) * 100) : 0;
    const strengths = percentage >= 70 ? ["Good accuracy under timed conditions", "Strong completion discipline"] : ["Completed the assessment flow"];
    const improvements = percentage >= 70
      ? ["Practice higher-difficulty coding edge cases", "Review time allocation by section"]
      : ["Revise core DSA patterns", "Practice MCQs with negative marking", "Run sample tests before submission"];
    const content = `You scored ${percentage}% in ${exam?.title || "the assessment"}. Focus next on ${improvements.slice(0, 2).join(" and ")}.`;

    const { data } = await db
      .from("ai_feedback_reports")
      .insert({
        candidate_id: req.user!.id,
        attempt_id,
        content,
        strengths,
        improvements,
      })
      .select()
      .single();

    res.json({ report: data, percentage });
  } catch (err) {
    logger.error({ err }, "Improvement report error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/profile-stats", async (req: AuthRequest, res) => {
  try {
    const role = req.user!.role;
    const userId = req.user!.id;

    if (role === "candidate") {
      const [{ count: attemptsCount }, { data: attempts }, { count: assignmentsCount }, { data: profile }] = await Promise.all([
        db.from("attempts").select("id", { count: "exact", head: true }).eq("candidate_id", userId).eq("status", "completed"),
        db.from("attempts").select("score, exams:exam_id(total_marks)").eq("candidate_id", userId).eq("status", "completed"),
        db.from("exam_assignments").select("id", { count: "exact", head: true }).eq("candidate_id", userId),
        db.from("candidate_profiles").select("cgpa, branch").eq("user_id", userId).maybeSingle(),
      ]);

      const totalAttempts = attemptsCount || 0;
      let avgScore = 0;
      if (attempts && attempts.length > 0) {
        let totalPct = 0;
        let validExams = 0;
        attempts.forEach((a: any) => {
          const exam = Array.isArray(a.exams) ? a.exams[0] : a.exams;
          const totalMarks = exam?.total_marks;
          if (totalMarks) {
            totalPct += ((a.score || 0) / totalMarks) * 100;
            validExams++;
          }
        });
        if (validExams > 0) {
          avgScore = Math.round(totalPct / validExams);
        }
      }

      res.json({
        title: "STUDENT STUDY DASHBOARD",
        stats: [
          { label: "CGPA", value: profile?.cgpa ? `${profile.cgpa} / 10` : "N/A" },
          { label: "Branch", value: profile?.branch || "N/A" },
          { label: "Exams Taken", value: `${totalAttempts} of ${assignmentsCount || 0}` },
          { label: "Avg. Accuracy", value: `${avgScore}%` },
        ]
      });
      return;
    }

    if (role === "tpo") {
      const { data: user } = await db.from("users").select("college_id").eq("id", userId).single();
      const collegeId = user?.college_id;

      if (!collegeId) {
        res.json({ title: "TPO COLLEGE DASHBOARD", stats: [{ label: "Status", value: "Not Linked" }] });
        return;
      }

      const [{ count: studentsCount }, { count: verifiedCount }, { count: drivesCount }, { data: collegeJobs }] = await Promise.all([
        db.from("candidate_profiles").select("id", { count: "exact", head: true }).eq("college_id", collegeId),
        db.from("candidate_profiles").select("id", { count: "exact", head: true }).eq("college_id", collegeId).eq("documents_verified", true),
        db.from("jobs").select("id", { count: "exact", head: true }).eq("college_id", collegeId),
        db.from("jobs").select("id").eq("college_id", collegeId),
      ]);

      let placedCount = 0;
      const jobIds = collegeJobs?.map((j: any) => j.id) || [];
      if (jobIds.length > 0) {
        const { count } = await db
          .from("candidate_status")
          .select("id", { count: "exact", head: true })
          .in("job_id", jobIds)
          .eq("status", "offered");
        placedCount = count || 0;
      }

      res.json({
        title: "TPO COLLEGE DASHBOARD",
        stats: [
          { label: "Total Students", value: String(studentsCount || 0) },
          { label: "Verified Profiles", value: String(verifiedCount || 0) },
          { label: "Placement Drives", value: String(drivesCount || 0) },
          { label: "Placed Candidates", value: String(placedCount || 0) },
        ]
      });
      return;
    }

    if (role === "recruiter") {
      const [{ count: examsCount }, { count: drivesCount }, { count: assignmentsCount }, { data: recruiterExams }] = await Promise.all([
        db.from("exams").select("id", { count: "exact", head: true }).eq("created_by", userId),
        db.from("jobs").select("id", { count: "exact", head: true }).eq("created_by", userId),
        db.from("exam_assignments").select("id", { count: "exact", head: true }).eq("assigned_by", userId),
        db.from("exams").select("id").eq("created_by", userId),
      ]);

      let gradedInterviewsCount = 0;
      const examIds = recruiterExams?.map((e: any) => e.id) || [];
      if (examIds.length > 0) {
        const { count } = await db
          .from("ai_interviews")
          .select("id", { count: "exact", head: true })
          .in("exam_id", examIds)
          .eq("status", "completed");
        gradedInterviewsCount = count || 0;
      }

      res.json({
        title: "RECRUITER HIRING DASHBOARD",
        stats: [
          { label: "Exams Created", value: String(examsCount || 0) },
          { label: "Active Jobs", value: String(drivesCount || 0) },
          { label: "Candidates Assigned", value: String(assignmentsCount || 0) },
          { label: "Interviews Graded", value: String(gradedInterviewsCount || 0) },
        ]
      });
      return;
    }

    if (role === "admin") {
      const [{ count: collegesCount }, { count: tposCount }, { count: recruitersCount }, { count: candidatesCount }] = await Promise.all([
        db.from("colleges").select("id", { count: "exact", head: true }),
        db.from("users").select("id", { count: "exact", head: true }).eq("role", "tpo"),
        db.from("users").select("id", { count: "exact", head: true }).eq("role", "recruiter"),
        db.from("users").select("id", { count: "exact", head: true }).eq("role", "candidate"),
      ]);

      res.json({
        title: "ADMIN SYSTEM DASHBOARD",
        stats: [
          { label: "Colleges", value: String(collegesCount || 0) },
          { label: "TPOs Onboarded", value: String(tposCount || 0) },
          { label: "Recruiters", value: String(recruitersCount || 0) },
          { label: "Candidates", value: String(candidatesCount || 0) },
        ]
      });
      return;
    }

    res.json({ title: "SYSTEM DASHBOARD", stats: [] });
  } catch (err) {
    logger.error({ err }, "Profile stats error");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

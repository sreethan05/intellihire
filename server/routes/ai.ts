import { Router } from "express";
import { supabase } from "../lib/supabase";
import { generateAiJson, hasAiKey } from "../lib/ai";
import { authMiddleware, type AuthRequest } from "../middleware/auth";

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

const topicTemplates: Record<string, string[]> = {
  aptitude: ["percentages", "time and work", "profit and loss", "probability", "number series"],
  technical: ["data structures", "databases", "operating systems", "networks", "oops"],
};

function normalizeWords(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function pickSkills(text: string) {
  const known = ["javascript", "typescript", "python", "java", "c++", "sql", "react", "node", "express", "postgres", "mongodb", "aws", "docker", "git", "html", "css", "dsa", "machine learning"];
  const words = normalizeWords(text).join(" ");
  return known.filter((skill) => words.includes(skill));
}

const realFallbackMcqs: Record<string, Record<string, McqQuestion[]>> = {
  python: {
    easy: [
      {
        question_text: "What is the output of print(type(5)) in Python?",
        option_a: "<class 'int'>",
        option_b: "<class 'float'>",
        option_c: "<class 'str'>",
        option_d: "<class 'number'>",
        correct_option: "A",
        marks: 1
      },
      {
        question_text: "Which of the following is a mutable data type in Python?",
        option_a: "tuple",
        option_b: "list",
        option_c: "string",
        option_d: "int",
        correct_option: "B",
        marks: 1
      },
      {
        question_text: "How do you insert an element at the end of a list in Python?",
        option_a: "list.add(element)",
        option_b: "list.insert(element)",
        option_c: "list.append(element)",
        option_d: "list.push(element)",
        correct_option: "C",
        marks: 1
      },
      {
        question_text: "Which keyword is used to define a function in Python?",
        option_a: "function",
        option_b: "def",
        option_c: "func",
        option_d: "define",
        correct_option: "B",
        marks: 1
      },
      {
        question_text: "What is the correct syntax to output 'Hello World' in Python?",
        option_a: "echo('Hello World')",
        option_b: "printf('Hello World')",
        option_c: "print('Hello World')",
        option_d: "console.log('Hello World')",
        correct_option: "C",
        marks: 1
      }
    ],
    medium: [
      {
        question_text: "What is the output of print([x for x in range(5) if x % 2 == 0])?",
        option_a: "[0, 2, 4]",
        option_b: "[1, 3]",
        option_c: "[0, 1, 2, 3, 4]",
        option_d: "[2, 4]",
        correct_option: "A",
        marks: 1
      },
      {
        question_text: "How do you handle exceptions in Python?",
        option_a: "try/catch",
        option_b: "try/except",
        option_c: "throw/catch",
        option_d: "raise/except",
        correct_option: "B",
        marks: 1
      }
    ],
    hard: [
      {
        question_text: "What is the purpose of '__slots__' in Python classes?",
        option_a: "To define private methods",
        option_b: "To optimize memory by preventing dynamic dictionary creation for instances",
        option_c: "To enable multiple inheritance",
        option_d: "To declare abstract properties",
        correct_option: "B",
        marks: 1
      }
    ]
  },
  javascript: {
    easy: [
      {
        question_text: "Which of the following is correct to declare a constant in JavaScript?",
        option_a: "const",
        option_b: "let",
        option_c: "var",
        option_d: "constant",
        correct_option: "A",
        marks: 1
      },
      {
        question_text: "What is the output of console.log(typeof NaN)?",
        option_a: "'number'",
        option_b: "'NaN'",
        option_c: "'undefined'",
        option_d: "'object'",
        correct_option: "A",
        marks: 1
      }
    ],
    medium: [
      {
        question_text: "What is the output of console.log(0.1 + 0.2 === 0.3)?",
        option_a: "true",
        option_b: "false",
        option_c: "undefined",
        option_d: "TypeError",
        correct_option: "B",
        marks: 1
      }
    ],
    hard: [
      {
        question_text: "What is a closure in JavaScript?",
        option_a: "A callback function",
        option_b: "A function that has access to its outer scope even after the outer function has returned",
        option_c: "A method to close browser tabs",
        option_d: "A way of declaring private modules",
        correct_option: "B",
        marks: 1
      }
    ]
  },
  sql: {
    easy: [
      {
        question_text: "Which SQL clause is used to filter records?",
        option_a: "WHERE",
        option_b: "FILTER",
        option_c: "HAVING",
        option_d: "GROUP BY",
        correct_option: "A",
        marks: 1
      },
      {
        question_text: "Which statement is used to retrieve data from a table?",
        option_a: "GET",
        option_b: "SELECT",
        option_c: "FETCH",
        option_d: "EXTRACT",
        correct_option: "B",
        marks: 1
      }
    ],
    medium: [
      {
        question_text: "What is the difference between WHERE and HAVING clauses?",
        option_a: "WHERE is used before grouping; HAVING is used after grouping to filter groups",
        option_b: "There is no difference",
        option_c: "HAVING is for rows; WHERE is for columns",
        option_d: "WHERE is only for SELECT statements",
        correct_option: "A",
        marks: 1
      }
    ],
    hard: [
      {
        question_text: "Which type of index is used to physically order the data in a SQL table?",
        option_a: "Clustered Index",
        option_b: "Non-clustered Index",
        option_c: "Unique Index",
        option_d: "Composite Index",
        correct_option: "A",
        marks: 1
      }
    ]
  }
};

const realFallbackCoding: Record<string, Record<string, CodingDraft[]>> = {
  python: {
    easy: [
      {
        title: "Even Numbers Sum",
        description: "Given a number N, read N space-separated integers. Compute and print the sum of all even numbers in the list.",
        difficulty: "easy",
        starter_code: "n = int(input())\narr = list(map(int, input().split()))\n# Write your code here",
        test_cases: [
          { input: "5\n1 2 3 4 5", expected_output: "6" },
          { input: "3\n11 13 15", expected_output: "0" }
        ],
        marks: 10
      }
    ],
    medium: [
      {
        title: "Find Duplicate Elements",
        description: "Given N elements, print all duplicate elements in sorted ascending order. If there are no duplicates, print -1.",
        difficulty: "medium",
        starter_code: "n = int(input())\narr = list(map(int, input().split()))\n# Write your code here",
        test_cases: [
          { input: "6\n4 3 2 7 8 2", expected_output: "2" },
          { input: "4\n1 2 3 4", expected_output: "-1" }
        ],
        marks: 15
      }
    ],
    hard: [
      {
        title: "Maximum Path Sum",
        description: "Given an array representation of a binary tree, find the maximum path sum from any node to any node.",
        difficulty: "hard",
        starter_code: "# Write your code here",
        test_cases: [
          { input: "1\n2\n3", expected_output: "6" }
        ],
        marks: 20
      }
    ]
  }
};

function fallbackMcqs(topic: string, difficulty: string, count: number): McqQuestion[] {
  const topicKey = topic.toLowerCase().trim();
  const poolKeys = Object.keys(realFallbackMcqs);
  
  if (topicKey === "general dsa" || topicKey === "general" || topicKey === "technical" || !topicKey) {
    return Array.from({ length: count }).map((_, index) => {
      const key = poolKeys[index % poolKeys.length];
      const diffPool = realFallbackMcqs[key][difficulty] || realFallbackMcqs[key]["easy"] || realFallbackMcqs[key]["medium"] || realFallbackMcqs[key]["hard"];
      const q = diffPool[Math.floor(index / poolKeys.length) % diffPool.length];
      return { ...q, question_text: `${q.question_text} (${key.toUpperCase()})` };
    });
  }

  if (realFallbackMcqs[topicKey] && realFallbackMcqs[topicKey][difficulty]) {
    const pool = realFallbackMcqs[topicKey][difficulty];
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
  const marks = difficulty === "hard" ? 20 : difficulty === "easy" ? 10 : 15;
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

  if (realFallbackCoding[topicKey] && realFallbackCoding[topicKey][difficulty]) {
    const pool = realFallbackCoding[topicKey][difficulty];
    const picked = pool[index % pool.length];
    return { ...picked };
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

function cleanMcqs(value: unknown, topic: string, difficulty: string, count: number) {
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

function cleanCodingList(value: unknown, topic: string, difficulty: string, count: number): CodingDraft[] {
  const candidate = value as { questions?: Array<Partial<CodingDraft>> };
  const questions = Array.isArray(candidate.questions) ? candidate.questions : [];
  const cleaned = questions.slice(0, count).map((q, idx) => cleanCoding({ question: q }, topic, difficulty));
  
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
  const difficulty = String(req.body.difficulty || "medium").toLowerCase();
  const count = Math.min(50, Math.max(1, Number(req.body.count || 5)));

  if (!hasAiKey()) {
    res.json({ questions: fallbackMcqs(topic, difficulty, count), source: "fallback" });
    return;
  }

  try {
    const generated = await generateAiJson<{ questions: McqQuestion[] }>(`
Return only valid JSON. Create ${count} ${difficulty} campus hiring MCQ questions about ${topic}.
Schema:
{
  "questions": [
    {
      "question_text": "string",
      "option_a": "string",
      "option_b": "string",
      "option_c": "string",
      "option_d": "string",
      "correct_option": "A",
      "marks": 1
    }
  ]
}
Rules:
- correct_option must be A, B, C, or D.
- Keep explanations out of the JSON.
- Questions should be usable in a college recruitment assessment.
- Do NOT include metadata words like "easy level", "medium difficulty", "hard level" or "campus assessment concept" in the question text or options.
`);
    res.json({ questions: cleanMcqs(generated, topic, difficulty, count), source: "ai" });
  } catch (err) {
    console.error("AI MCQ generation error:", err);
    res.json({ questions: fallbackMcqs(topic, difficulty, count), source: "fallback" });
  }
});

router.post("/generate-coding", async (req: AuthRequest, res) => {
  const topic = String(req.body.topic || "arrays").toLowerCase();
  const difficulty = String(req.body.difficulty || "medium").toLowerCase();
  const count = Math.min(5, Math.max(1, Number(req.body.count || 1)));

  if (!hasAiKey()) {
    const questions = Array.from({ length: count }).map((_, idx) => fallbackCoding(topic, difficulty, idx));
    res.json({ questions, question: questions[0], source: "fallback" });
    return;
  }

  try {
    const generated = await generateAiJson<{ questions: CodingDraft[] }>(`
Return only valid JSON. Create ${count} ${difficulty} coding problems for a campus hiring exam about ${topic}.
Schema:
{
  "questions": [
    {
      "title": "string",
      "description": "string",
      "difficulty": "${difficulty}",
      "starter_code": "Python starter code string",
      "test_cases": [
        { "input": "string", "expected_output": "string" }
      ],
      "marks": 10
    }
  ]
}
Rules:
- Include at least 2 visible test cases per question.
- The problems must use stdin/stdout.
- Do not include markdown.
- Do NOT include metadata words like "easy level", "medium difficulty", "hard level" or "campus assessment concept" in the title or description.
`);
    const cleanedQuestions = cleanCodingList(generated, topic, difficulty, count);
    res.json({
      questions: cleanedQuestions,
      question: cleanedQuestions[0] || fallbackCoding(topic, difficulty, 0),
      source: "ai"
    });
  } catch (err) {
    console.error("AI coding generation error:", err);
    const questions = Array.from({ length: count }).map((_, idx) => fallbackCoding(topic, difficulty, idx));
    res.json({ questions, question: questions[0], source: "fallback" });
  }
});

router.post("/improvement-report", async (req: AuthRequest, res) => {
  try {
    const { attempt_id } = req.body;
    if (!attempt_id) {
      res.status(400).json({ error: "attempt_id required" });
      return;
    }

    const { data: attempt } = await supabase
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

    const { data } = await supabase
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
    console.error("Improvement report error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/profile-stats", async (req: AuthRequest, res) => {
  try {
    const role = req.user!.role;
    const userId = req.user!.id;

    if (role === "candidate") {
      const [{ count: attemptsCount }, { data: attempts }, { count: assignmentsCount }, { data: profile }] = await Promise.all([
        supabase.from("attempts").select("id", { count: "exact", head: true }).eq("candidate_id", userId).eq("status", "completed"),
        supabase.from("attempts").select("score, exams:exam_id(total_marks)").eq("candidate_id", userId).eq("status", "completed"),
        supabase.from("exam_assignments").select("id", { count: "exact", head: true }).eq("candidate_id", userId),
        supabase.from("candidate_profiles").select("cgpa, branch").eq("user_id", userId).maybeSingle(),
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
      const { data: user } = await supabase.from("users").select("college_id").eq("id", userId).single();
      const collegeId = user?.college_id;

      if (!collegeId) {
        res.json({ title: "TPO COLLEGE DASHBOARD", stats: [{ label: "Status", value: "Not Linked" }] });
        return;
      }

      const [{ count: studentsCount }, { count: verifiedCount }, { count: drivesCount }, { data: collegeJobs }] = await Promise.all([
        supabase.from("candidate_profiles").select("id", { count: "exact", head: true }).eq("college_id", collegeId),
        supabase.from("candidate_profiles").select("id", { count: "exact", head: true }).eq("college_id", collegeId).eq("documents_verified", true),
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("college_id", collegeId),
        supabase.from("jobs").select("id").eq("college_id", collegeId),
      ]);

      let placedCount = 0;
      const jobIds = collegeJobs?.map((j: any) => j.id) || [];
      if (jobIds.length > 0) {
        const { count } = await supabase
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
        supabase.from("exams").select("id", { count: "exact", head: true }).eq("created_by", userId),
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("created_by", userId),
        supabase.from("exam_assignments").select("id", { count: "exact", head: true }).eq("assigned_by", userId),
        supabase.from("exams").select("id").eq("created_by", userId),
      ]);

      let gradedInterviewsCount = 0;
      const examIds = recruiterExams?.map((e: any) => e.id) || [];
      if (examIds.length > 0) {
        const { count } = await supabase
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
        supabase.from("colleges").select("id", { count: "exact", head: true }),
        supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "tpo"),
        supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "recruiter"),
        supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "candidate"),
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
    console.error("Profile stats error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

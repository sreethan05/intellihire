import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, storageRoot } from "../lib/postgres.js";
import { authMiddleware, roleMiddleware, type AuthRequest } from "../middleware/auth.js";
import { getPasswordValidationError } from "../lib/validation.js";
import path from "path";
import multer from "multer";
import fs from "fs/promises";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

// Ensure resumes folder exists
const resumesDir = path.resolve(storageRoot, "resumes");
fs.mkdir(resumesDir, { recursive: true }).catch((err) => 
  console.error("Failed to create resumes storage folder:", err)
);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, resumesDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, "_");
    cb(null, `${base}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF format resumes are supported") as any, false);
    }
  }
});
 
const router = Router();
 
router.use(authMiddleware);
router.use(roleMiddleware(["candidate"]));

const formatDate = (date?: string | null) => date ? new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

const monthsBack = (count: number) => {
  const now = new Date();
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("en-US", { month: "short" }),
    };
  });
};

router.get("/profile", async (req: AuthRequest, res) => {
  try {
    const [{ data: user }, { data: profile }] = await Promise.all([
      db
        .from("users")
        .select("id, name, email, roll_number, college_id, profile_complete, must_change_password")
        .eq("id", req.user!.id)
        .single(),
      db
        .from("candidate_profiles")
        .select("*, college:college_id(id, name, code)")
        .eq("user_id", req.user!.id)
        .maybeSingle(),
    ]);

    res.json({ user, profile });
  } catch (err) {
    console.error("Candidate profile error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/onboarding", async (req: AuthRequest, res) => {
  try {
    const { password, phone, skills, domain_preference, marksheet_url, resume_url } = req.body;
    if (!password || !phone || !Array.isArray(skills) || skills.length === 0 || !domain_preference) {
      res.status(400).json({ error: "Password, phone, skills, and domain preference are required" });
      return;
    }
    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    const password_hash = await bcrypt.hash(password, 10);
    const [{ error: userError }, { data: profile, error: profileError }] = await Promise.all([
      db
        .from("users")
        .update({ password_hash, must_change_password: false, profile_complete: true })
        .eq("id", req.user!.id),
      db
        .from("candidate_profiles")
        .update({
          phone,
          skills,
          domain_preference,
          marksheet_url: marksheet_url || null,
          resume_url: resume_url || null,
          profile_complete: true,
        })
        .eq("user_id", req.user!.id)
        .select()
        .single(),
    ]);

    if (userError || profileError) {
      res.status(400).json({ error: userError?.message || profileError?.message });
      return;
    }

    res.json({ message: "Onboarding complete", profile });
  } catch (err) {
    console.error("Candidate onboarding error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
 
router.get("/dashboard", async (req: AuthRequest, res) => {
  try {
    const candidateId = req.user!.id;
 
    const { data: assignments, error } = await db
      .from("exam_assignments")
      .select("*, exam:exam_id(id, title, description, duration, total_marks, pass_marks, available_from, available_until, status, shuffle_questions, negative_marking, created_at)")
      .eq("candidate_id", candidateId);
 
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
 
    const examIds = (assignments || []).map((assignment: { exam_id: string }) => assignment.exam_id);
    const { data: attempts } = examIds.length
      ? await db
          .from("attempts")
          .select("id, exam_id, status, score, started_at, submitted_at")
          .eq("candidate_id", candidateId)
          .order("started_at", { ascending: false })
          .in("exam_id", examIds)
      : { data: [] as Array<{ id: string; exam_id: string; status: string; score: number | null; started_at: string; submitted_at: string | null }> };
 
    const enriched = (assignments || []).map((assignment: {
      id: string;
      exam_id: string;
      candidate_id: string;
      assigned_by: string;
      assigned_at: string;
      exam: {
        id: string;
        title: string;
        description: string | null;
        duration: number;
        total_marks: number;
        pass_marks: number;
        available_from?: string | null;
        available_until?: string | null;
      };
    }) => ({
      ...assignment,
      attempts: (attempts || []).filter((attempt) => attempt.exam_id === assignment.exam_id),
    }));

    const latestAttempts = enriched
      .map((assignment) => assignment.attempts?.[0])
      .filter(Boolean);

    const completedAttempts = enriched.filter((assignment) => assignment.attempts?.[0]?.status === "completed");
    const inProgressAttempts = enriched.filter((assignment) => assignment.attempts?.[0]?.status === "in_progress");
    const pendingAssignments = enriched.filter((assignment) => !assignment.attempts?.[0]);

    const performance = completedAttempts.map((assignment) => {
      const latestAttempt = assignment.attempts![0];
      const score = latestAttempt.score ?? 0;
      const totalMarks = assignment.exam.total_marks;
      const passMarks = assignment.exam.pass_marks;

      return {
        examId: assignment.exam_id,
        title: assignment.exam.title,
        score,
        totalMarks,
        passMarks,
        percentage: totalMarks ? Number(((score / totalMarks) * 100).toFixed(1)) : 0,
        submittedAt: latestAttempt.submitted_at,
        status: score >= passMarks ? "pass" : "fail",
      };
    });

    const averageScore = performance.length
      ? Number((performance.reduce((sum, item) => sum + item.score, 0) / performance.length).toFixed(1))
      : 0;

    const bestScore = performance.length
      ? Math.max(...performance.map((item) => item.score))
      : 0;

    const passCount = performance.filter((item) => item.status === "pass").length;

    const completionRate = enriched.length
      ? Number(((completedAttempts.length / enriched.length) * 100).toFixed(1))
      : 0;

    const averagePercentage = performance.length
      ? Number((performance.reduce((sum, item) => sum + item.percentage, 0) / performance.length).toFixed(1))
      : 0;

    const scoreBands = [
      { label: "90-100", min: 90, max: 101 },
      { label: "75-89", min: 75, max: 90 },
      { label: "60-74", min: 60, max: 75 },
      { label: "Below 60", min: 0, max: 60 },
    ].map((band) => ({
      label: band.label,
      exams: performance.filter((item) => item.percentage >= band.min && item.percentage < band.max).length,
    }));

    const examInsights = performance
      .slice()
      .sort((left, right) => right.percentage - left.percentage)
      .map((item) => ({
        label: item.title,
        score: item.percentage,
        status: item.status,
      }));

    const now = Date.now();
    const upcomingExams = pendingAssignments
      .map((assignment) => {
        const availableFrom = assignment.exam.available_from || assignment.assigned_at;
        const opensAt = new Date(availableFrom).getTime();
        const daysLeft = Math.max(0, Math.ceil((opensAt - now) / 86400000));
        const meta = opensAt > now ? `${daysLeft || 1} Day${daysLeft === 1 ? "" : "s"} Left` : "Open Now";

        return {
          id: assignment.id,
          examId: assignment.exam_id,
          title: assignment.exam.title,
          subtitle: `${formatDate(availableFrom)} - ${assignment.exam.duration} min`,
          meta,
          tone: opensAt > now ? "violet" : "green",
          date: availableFrom,
        };
      })
      .sort((left, right) => new Date(left.date || "").getTime() - new Date(right.date || "").getTime())
      .slice(0, 5);

    const recentResults = performance
      .slice()
      .sort((left, right) => new Date(right.submittedAt || "").getTime() - new Date(left.submittedAt || "").getTime())
      .slice(0, 5)
      .map((item) => ({
        id: item.examId,
        examId: item.examId,
        title: item.title,
        subtitle: formatDate(item.submittedAt),
        meta: `${item.percentage}%`,
        tone: item.status === "pass" ? "green" : "rose",
        score: item.score,
        percentage: item.percentage,
        status: item.status,
        date: item.submittedAt,
      }));

    const trendMonths = monthsBack(6);
    const performanceTrend = trendMonths.map((month) => {
      const monthItems = performance.filter((item) => item.submittedAt?.startsWith(month.key));
      return {
        month: month.label,
        score: monthItems.length
          ? Number((monthItems.reduce((sum, item) => sum + item.percentage, 0) / monthItems.length).toFixed(1))
          : 0,
      };
    });

    const notifications = [
      ...recentResults.slice(0, 3).map((item) => ({
        id: `result-${item.examId}`,
        title: `Your result for ${item.title} has been published.`,
        subtitle: item.subtitle,
        tone: item.status === "pass" ? "green" : "rose",
        date: item.date,
      })),
      ...upcomingExams.slice(0, 3).map((item) => ({
        id: `exam-${item.examId}`,
        title: `New exam scheduled: ${item.title}.`,
        subtitle: item.subtitle,
        tone: "blue",
        date: item.date,
      })),
    ]
      .sort((left, right) => new Date(right.date || "").getTime() - new Date(left.date || "").getTime())
      .slice(0, 4);

    const { data: leaderboardAttempts } = examIds.length
      ? await db
          .from("attempts")
          .select("candidate_id, score, status, submitted_at, users:candidate_id(id, name, email), exams:exam_id(total_marks)")
          .eq("status", "completed")
          .in("exam_id", examIds)
      : { data: [] as any[] };

    const leaderboardMap = new Map<string, { candidateId: string; name: string; email: string; attempts: number; totalPercentage: number }>();
    (leaderboardAttempts || []).forEach((attempt: any) => {
      const candidate = Array.isArray(attempt.users) ? attempt.users[0] : attempt.users;
      const exam = Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams;
      const candidateKey = attempt.candidate_id;
      const current = leaderboardMap.get(candidateKey) || {
        candidateId: candidateKey,
        name: candidate?.name || "Candidate",
        email: candidate?.email || "",
        attempts: 0,
        totalPercentage: 0,
      };
      const totalMarks = exam?.total_marks || 0;
      current.attempts += 1;
      current.totalPercentage += totalMarks ? ((attempt.score || 0) / totalMarks) * 100 : 0;
      leaderboardMap.set(candidateKey, current);
    });

    const leaderboard = Array.from(leaderboardMap.values())
      .map((item) => ({
        candidateId: item.candidateId,
        name: item.name,
        email: item.email,
        attempts: item.attempts,
        completedAttempts: item.attempts,
        averageScore: Number((item.totalPercentage / Math.max(1, item.attempts)).toFixed(1)),
        averagePercentage: Number((item.totalPercentage / Math.max(1, item.attempts)).toFixed(1)),
      }))
      .sort((left, right) => right.averagePercentage - left.averagePercentage);

    const candidateRankIndex = leaderboard.findIndex((item) => item.candidateId === candidateId);
 
    res.json({
      assignments: enriched,
      stats: {
        assigned: enriched.length,
        completed: completedAttempts.length,
        inProgress: inProgressAttempts.length,
        pending: pendingAssignments.length,
        averageScore,
        bestScore,
        passCount,
        completionRate,
        averagePercentage,
        rank: candidateRankIndex >= 0 ? candidateRankIndex + 1 : leaderboard.length || 0,
        totalRanked: leaderboard.length,
      },
      performance,
      latestAttempts,
      upcomingExams,
      recentResults,
      performanceTrend,
      scoreBands,
      examInsights,
      notifications,
      leaderboard: leaderboard.slice(0, 10),
    });
  } catch (err) {
    console.error("Candidate dashboard error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
 
router.get("/exams", async (req: AuthRequest, res) => {
  try {
    const { data, error } = await db
      .from("exam_assignments")
      .select("*, exam:exam_id(*)")
      .eq("candidate_id", req.user!.id);
 
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
 
    res.json({ exams: data || [] });
  } catch (err) {
    console.error("Candidate exams error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
 
router.get("/exam/:examId", async (req: AuthRequest, res) => {
  try {
    const { examId } = req.params;
    const candidateId = req.user!.id;
 
    const { data: assignment, error: assignErr } = await db
      .from("exam_assignments")
      .select("*")
      .eq("exam_id", examId)
      .eq("candidate_id", candidateId)
      .single();
 
    if (assignErr || !assignment) {
      res.status(403).json({ error: "Exam not assigned" });
      return;
    }
 
    const { data: exam, error: examErr } = await db
      .from("exams")
      .select("*")
      .eq("id", examId)
      .single();
 
    if (examErr || !exam) {
      res.status(404).json({ error: "Exam not found" });
      return;
    }
 
    const { data: mcqQuestions } = await db
      .from("exam_questions")
      .select("*, questions:question_id(*)")
      .eq("exam_id", examId);
 
    const { data: codingQuestions } = await db
      .from("exam_coding_questions")
      .select("*, coding_questions:coding_question_id(*)")
      .eq("exam_id", examId);
 
    res.json({
      exam,
      mcqQuestions: mcqQuestions?.map((q: any) => ({
        id: q.id,
        question_id: q.question_id,
        marks: q.marks,
        question: q.questions,
      })) || [],
      codingQuestions: codingQuestions?.map((q: any) => ({
        id: q.id,
        coding_question_id: q.coding_question_id,
        marks: q.marks,
        question: q.coding_questions,
      })) || [],
    });
  } catch (err) {
    console.error("Fetch exam error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- ATS Parseability Helper ---
function checkAtsParseability(text: string, meta: { numPages?: number } = {}) {
  const issues: { severity: "high" | "medium" | "low"; msg: string }[] = [];
  const lines = text.split("\n");
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);

  // 1. Low text yield
  if (meta.numPages && meta.numPages > 0) {
    const charsPerPage = text.length / meta.numPages;
    if (charsPerPage < 400) {
      issues.push({
        severity: "high",
        msg: "Very little extractable text per page — resume may be scanned, image-based, or rely on graphics that ATS can't read.",
      });
    }
  }

  // 2. Fragmented lines (multi-column warning)
  const shortFragmentLines = nonEmptyLines.filter((l) => l.trim().length <= 3);
  if (nonEmptyLines.length > 0 && shortFragmentLines.length / nonEmptyLines.length > 0.25) {
    issues.push({
      severity: "medium",
      msg: "Many short/fragmented lines detected — often indicates a complex multi-column or table layout which ATS reads out of order. Prefer a clean, single-column layout.",
    });
  }

  // 3. Special characters ratio
  // eslint-disable-next-line no-control-regex
  const nonAsciiRatio = (text.match(/[^\x00-\x7F]/g) || []).length / Math.max(1, text.length);
  if (nonAsciiRatio > 0.03) {
    issues.push({
      severity: "low",
      msg: "Noticeable amount of special/non-standard characters detected — icons/glyphs used for section headers may not parse properly.",
    });
  }

  // 4. Missing headings
  const hasAnyHeaderLike = /\b(experience|education|skills|projects|summary)\b/i.test(text);
  if (!hasAnyHeaderLike) {
    issues.push({
      severity: "high",
      msg: "No standard section headers detected. Ensure you use standard headers like Experience, Education, Skills, and Projects.",
    });
  }

  // 5. Heavy tab usage
  const tabCount = (text.match(/\t/g) || []).length;
  if (tabCount > 20) {
    issues.push({
      severity: "low",
      msg: "Heavy tab key usage detected — often a symptom of table formatting that may scramble on parsing.",
    });
  }

  const score = Math.max(0, 100 - issues.reduce((acc, i) => {
    return acc + (i.severity === "high" ? 30 : i.severity === "medium" ? 15 : 5);
  }, 0));

  return { score, issues };
}

// --- Education Extractor ---
const DEGREE_RE = /\b(b\.?tech|m\.?tech|b\.?e|m\.?e|b\.?sc|m\.?sc|bca|mca|mba|ph\.?d|bachelor'?s?|master'?s?|diploma)\b/i;
const CGPA_RE = /\b(cgpa|gpa)\s*[:-]?\s*(\d\.\d{1,2})\s*(\/\s*(\d+(\.\d+)?))?/i;
const YEAR_RANGE_RE = /\b((19|20)\d{2})\s?(-|–|to)\s?((19|20)\d{2}|present|current)\b/gi;
const YEAR_ONLY_RE = /\b(19|20)\d{2}\b/g;

interface EducationEntry {
  raw: string;
  degree: string | null;
  cgpa: string | null;
  cgpaScale: string | null;
  years: string | null;
}

function extractEducation(text: string): EducationEntry[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const entries: EducationEntry[] = [];

  lines.forEach((line) => {
    if (DEGREE_RE.test(line)) {
      const cgpaMatch = line.match(CGPA_RE);
      const yearMatch = line.match(YEAR_RANGE_RE) || line.match(YEAR_ONLY_RE);
      entries.push({
        raw: line,
        degree: (line.match(DEGREE_RE) || [null])[0],
        cgpa: cgpaMatch ? cgpaMatch[2] : null,
        cgpaScale: cgpaMatch && cgpaMatch[4] ? cgpaMatch[4] : null,
        years: yearMatch ? yearMatch[0] : null,
      });
    }
  });

  return entries;
}

// --- Employment Timeline Extractor ---
interface TimelineRange {
  raw: string;
  startYear: number;
  endYear: number;
}
interface TimelineGap {
  from: number;
  to: number;
  years: number;
}

function extractTimeline(text: string) {
  const ranges: TimelineRange[] = [];
  let match;
  const re = new RegExp(YEAR_RANGE_RE);
  while ((match = re.exec(text)) !== null) {
    const startYear = parseInt(match[1], 10);
    const endRaw = match[4].toLowerCase();
    const endYear = /present|current/.test(endRaw) ? new Date().getFullYear() : parseInt(endRaw, 10);
    ranges.push({ raw: match[0], startYear, endYear });
  }

  ranges.sort((a, b) => a.startYear - b.startYear);

  const gaps: TimelineGap[] = [];
  for (let i = 1; i < ranges.length; i++) {
    const prevEnd = ranges[i - 1].endYear;
    const currStart = ranges[i].startYear;
    if (currStart - prevEnd >= 1) {
      gaps.push({ from: prevEnd, to: currStart, years: currStart - prevEnd });
    }
  }

  return { ranges, gaps };
}

// --- Passive Voice Detector ---
const PASSIVE_RE = /\b(was|were|been|being|is|are)\s+\w+ed\b/gi;
function detectPassiveVoice(text: string) {
  const matches = text.match(PASSIVE_RE) || [];
  return { count: matches.length, examples: matches.slice(0, 5) };
}

// --- Verb Repetition Detector ---
function detectVerbRepetition(text: string, actionVerbsList: string[]) {
  const lower = text.toLowerCase();
  const counts: Record<string, number> = {};
  for (const verb of actionVerbsList) {
    const re = new RegExp(`\\b${verb}\\b`, "gi");
    const matches = lower.match(re);
    if (matches && matches.length > 0) counts[verb] = matches.length;
  }
  const overused = Object.entries(counts)
    .filter(([, count]) => count >= 4)
    .map(([verb, count]) => ({ verb, count }));
  return overused;
}

router.post("/resume/upload", upload.single("resume"), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Please upload a resume file" });
      return;
    }

    const filePath = req.file.path;
    const fileBuffer = await fs.readFile(filePath);
    
    // Parse PDF
    const parsedPdf = await pdfParse(fileBuffer);
    const parsedText = parsedPdf.text || "";

    if (!parsedText.trim()) {
      res.status(400).json({ error: "Could not extract text from the PDF file. Please ensure it is not scanned or empty." });
      return;
    }

    // Query existing profile to check domain preference
    const { data: candidateProfile } = await db
      .from("candidate_profiles")
      .select("domain_preference")
      .eq("user_id", req.user!.id)
      .single();

    // --- Highly Accurate Local Segmenting Resume Parser ---
    const lowerText = parsedText.toLowerCase();

    // Synonym database mapping for dead-accurate matching
    const SYNONYM_MAP: Record<string, string[]> = {
      "JavaScript": ["javascript", "js", "es6", "ecmascript"],
      "TypeScript": ["typescript", "ts"],
      "Python": ["python", "py"],
      "Java": ["java", "jdk", "jre"],
      "C++": ["c\\+\\+", "cpp"],
      "C#": ["c#", "csharp", "dotnet", "\\.net"],
      "Go": ["go", "golang"],
      "Rust": ["rust", "rustlang"],
      "Ruby": ["ruby", "rails", "ror"],
      "PHP": ["php"],
      "Swift": ["swift"],
      "Kotlin": ["kotlin"],
      "SQL": ["sql", "mysql", "postgresql", "sqlite", "oracle", "mariadb", "db2"],
      "NoSQL": ["nosql", "mongodb", "redis", "cassandra", "dynamodb", "couchdb"],
      "React": ["react", "reactjs", "react.js"],
      "Angular": ["angular", "angularjs", "angular.js"],
      "Vue": ["vue", "vuejs", "vue.js"],
      "Next.js": ["next.js", "nextjs", "next js"],
      "Node.js": ["node.js", "nodejs", "node js"],
      "Express": ["express", "expressjs", "express.js"],
      "Django": ["django"],
      "Flask": ["flask"],
      "Spring Boot": ["spring boot", "springboot", "spring-boot", "spring framework"],
      "Laravel": ["laravel"],
      "HTML": ["html", "html5"],
      "CSS": ["css", "css3", "sass", "scss", "less"],
      "Tailwind CSS": ["tailwind", "tailwindcss"],
      "Bootstrap": ["bootstrap"],
      "MongoDB": ["mongodb", "mongo"],
      "PostgreSQL": ["postgresql", "postgres"],
      "MySQL": ["mysql"],
      "Redis": ["redis"],
      "AWS": ["aws", "amazon web services", "ec2", "s3", "lambda", "rds"],
      "Azure": ["azure"],
      "GCP": ["gcp", "google cloud", "google cloud platform"],
      "Docker": ["docker", "dockerfile", "containerization"],
      "Kubernetes": ["kubernetes", "k8s"],
      "Jenkins": ["jenkins"],
      "Git": ["git", "github", "gitlab", "bitbucket", "version control"],
      "CI/CD": ["ci/cd", "cicd", "continuous integration", "continuous deployment"],
      "Machine Learning": ["machine learning", "ml", "supervised learning", "unsupervised learning"],
      "Deep Learning": ["deep learning", "dl", "neural networks", "cnn", "rnn"],
      "Data Science": ["data science", "pandas", "numpy", "scikit-learn", "sklearn", "tensorflow", "pytorch", "keras"],
      "DSA": ["dsa", "data structures", "algorithms", "problem solving", "competitive coding"],
      "System Design": ["system design", "microservices", "load balancing", "scalability"],
      "REST API": ["rest api", "restful", "apis", "graphql", "soap"]
    };

    // Identify where headers begin to segment sections
    const headerPatterns = {
      experience: /(experience|employment|work history|professional background|internships|work experience)/gi,
      projects: /(projects|personal projects|academic projects|key projects|featured projects)/gi,
      education: /(education|academic background|university|college|degrees|academic qualification)/gi,
      skills: /(skills|technical skills|languages|technologies|proficiencies|expertise)/gi
    };

    // Find starting indices of sections
    const sections: Record<string, number> = {
      experience: -1,
      projects: -1,
      education: -1,
      skills: -1
    };

    for (const key of Object.keys(headerPatterns)) {
      const pattern = headerPatterns[key as keyof typeof headerPatterns];
      pattern.lastIndex = 0;
      const m = pattern.exec(lowerText);
      if (m) {
        sections[key] = m.index;
      }
    }

    // Segment text
    const getSegment = (startKey: string) => {
      const startIdx = sections[startKey];
      if (startIdx === -1) return "";
      
      // Find the next closest section header index
      let endIdx = lowerText.length;
      for (const key of Object.keys(sections)) {
        const idx = sections[key];
        if (idx > startIdx && idx < endIdx) {
          endIdx = idx;
        }
      }
      return lowerText.substring(startIdx, endIdx);
    };

    const experienceSegment = getSegment("experience");
    const projectsSegment = getSegment("projects");

    // Match skills accurately inside segments
    const extractedSkills: string[] = [];
    const appliedSkills: string[] = [];
    
    for (const [skillName, synonyms] of Object.entries(SYNONYM_MAP)) {
      let isMatched = false;
      let isApplied = false;

      for (const synonym of synonyms) {
        // eslint-disable-next-line no-useless-escape
        const escapedSynonym = synonym.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const hasSpecial = /[^a-zA-Z0-9]/.test(synonym);
        const regex = hasSpecial ? new RegExp(escapedSynonym, 'i') : new RegExp(`\\b${escapedSynonym}\\b`, 'i');

        if (regex.test(lowerText)) {
          isMatched = true;
          
          if ((experienceSegment && regex.test(experienceSegment)) || 
              (projectsSegment && regex.test(projectsSegment))) {
            isApplied = true;
            break;
          }
        }
      }

      if (isMatched) {
        extractedSkills.push(skillName);
        if (isApplied) {
          appliedSkills.push(skillName);
        }
      }
    }

    // --- PARAMETER ANALYSIS PIPELINE ---
    
    // 1. Contact Info Parameters
    const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(lowerText);
    const hasPhone = /\b(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b/.test(lowerText);
    const hasGitHub = /github\.com\/[a-zA-Z0-9_-]+/i.test(lowerText);
    const hasLinkedIn = /linkedin\.com\/in\/[a-zA-Z0-9_-]+/i.test(lowerText);

    let contactScore = 0;
    if (hasEmail) contactScore += 30;
    if (hasPhone) contactScore += 30;
    if (hasGitHub) contactScore += 20;
    if (hasLinkedIn) contactScore += 20;

    let contactFeedback = "";
    if (contactScore === 100) {
      contactFeedback = "Excellent. Email, phone, GitHub, and LinkedIn links are complete.";
    } else if (contactScore >= 60) {
      contactFeedback = "Good. Consider adding GitHub and LinkedIn profiles for technical recruiters.";
    } else {
      contactFeedback = "Poor. Crucial contact details (email/phone) appear to be missing.";
    }

    // 2. Section Structure Parameters
    let structureScore = 0;
    const structureDetails: string[] = [];
    if (sections.experience !== -1) { structureScore += 30; } else { structureDetails.push("Experience"); }
    if (sections.projects !== -1) { structureScore += 30; } else { structureDetails.push("Projects"); }
    if (sections.education !== -1) { structureScore += 20; } else { structureDetails.push("Education"); }
    if (sections.skills !== -1) { structureScore += 20; } else { structureDetails.push("Skills"); }

    const structureFeedback = structureScore === 100 
      ? "Excellent. All standard resume headings (Experience, Projects, Education, Skills) are present."
      : `Fair. Missing core headings: ${structureDetails.join(", ")}.`;

    // 3. Content Density Parameters (Word Count)
    const words = lowerText.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    let densityScore = 0;
    let densityFeedback = "";
    if (wordCount >= 300 && wordCount <= 750) {
      densityScore = 100;
      densityFeedback = `Excellent length (${wordCount} words). Fit for standard 1-page student resume layout.`;
    } else if (wordCount > 750 && wordCount <= 1200) {
      densityScore = 80;
      densityFeedback = `Good length (${wordCount} words), but review if some project summaries can be simplified.`;
    } else if (wordCount < 300) {
      densityScore = 50;
      densityFeedback = `Too short (${wordCount} words). Expand on technical challenges, technologies, or class labs.`;
    } else {
      densityScore = 40;
      densityFeedback = `Too lengthy (${wordCount} words). Condense descriptions to keep within a single page focus.`;
    }

    // 4. Action Verbs Parameters (Resume Writing Style)
    const actionVerbsList = [
      "designed", "developed", "implemented", "managed", "built", "optimized", "created", "led", "architected",
      "analyzed", "deployed", "spearheaded", "engineered", "streamlined", "formulated", "coordinated",
      "executed", "accelerated", "enhanced", "reduced"
    ];
    let verbCount = 0;
    for (const verb of actionVerbsList) {
      const reg = new RegExp(`\\b${verb}\\b`, 'gi');
      const matches = lowerText.match(reg);
      if (matches) verbCount += matches.length;
    }
    let verbScore = 0;
    let verbFeedback = "";
    if (verbCount >= 8) {
      verbScore = 100;
      verbFeedback = `Excellent. Used ${verbCount} strong action verbs, denoting an active, project-focused narrative.`;
    } else if (verbCount >= 4) {
      verbScore = 75;
      verbFeedback = `Good. Used ${verbCount} action verbs. Try replacing passive phrases like 'responsible for' with action terms.`;
    } else {
      verbScore = 40;
      verbFeedback = `Poor. Only ${verbCount} action verbs found. Use action-focused descriptions (e.g. 'Optimized query latency' vs 'Worked on query').`;
    }

    // 5. Quantifiable Impact Metrics (Numbers & metrics)
    const numbersList = lowerText.match(/\b(?:\d{1,3}%|\d+\s*(?:users|requests|percent|seconds|ms|times|GB|MB|pages|students|endpoints))\b/gi) || [];
    const impactCount = numbersList.length;
    let impactScore = 0;
    let impactFeedback = "";
    if (impactCount >= 3) {
      impactScore = 100;
      impactFeedback = `Excellent. Detected ${impactCount} instances of quantified results, proving measurable project impacts.`;
    } else if (impactCount >= 1) {
      impactScore = 65;
      impactFeedback = `Fair. Detected ${impactCount} numerical results. Try adding explicit statistics to other projects.`;
    } else {
      impactScore = 30;
      impactFeedback = "Poor. Zero quantified metrics. Add numbers (e.g. speed increase, request volumes, team sizes).";
    }

    // 6. Skills Depth (Match Strength)
    let skillScore = 0;
    for (const skill of extractedSkills) {
      if (appliedSkills.includes(skill)) {
        skillScore += 5; 
      } else {
        skillScore += 2;
      }
    }
    const skillScoreNormalized = Math.min(100, Math.round((Math.min(25, skillScore) / 25) * 100));
    let skillFeedback = "";
    if (skillScoreNormalized >= 80) {
      skillFeedback = `Excellent depth. Extracted ${extractedSkills.length} skills with strong application inside project work.`;
    } else if (skillScoreNormalized >= 50) {
      skillFeedback = `Good. Extracted ${extractedSkills.length} skills. Ensure key skills are discussed in experience descriptions.`;
    } else {
      skillFeedback = `Poor. Extracted only ${extractedSkills.length} skills. Add a technical profile block to your document.`;
    }

    // 7. Education Detail Depth (GPA, degrees, college details)
    let educationScore = 40; 
    let educationFeedback = "Poor. Education section not detected.";
    if (sections.education !== -1) {
      const eduSegment = getSegment("education");
      const hasGPA = /\b\d+(?:\.\d+)?\s*(?:%|cgpa|gpa)\b/i.test(eduSegment);
      const hasDegree = /\b(b\.?tech|b\.?e|b\.?s|m\.?tech|m\.?s|b\.?sc|mca|mba|bachelor|master|gpa)\b/i.test(eduSegment);
      if (hasGPA && hasDegree) {
        educationScore = 100;
        educationFeedback = "Excellent. Degree program and CGPA/GPA parameters are clearly recorded.";
      } else if (hasDegree || hasGPA) {
        educationScore = 75;
        educationFeedback = "Good. Details present, but ensure both degree program and GPA details are visible.";
      } else {
        educationScore = 50;
        educationFeedback = "Fair. Section present but lacks explicitly parsed GPA or program details.";
      }
    }

    // 8. Projects Richness & Technology Usage
    let projectScore = 0;
    let projectFeedback = "Poor. Projects section not detected.";
    if (sections.projects !== -1) {
      const projSegment = getSegment("projects");
      const skillsInProjects = extractedSkills.filter(s => {
        // eslint-disable-next-line no-useless-escape
        const escaped = s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const hasSpecial = /[^a-zA-Z0-9]/.test(s);
        const regex = hasSpecial ? new RegExp(escaped, 'i') : new RegExp(`\\b${escaped}\\b`, 'i');
        return regex.test(projSegment);
      });
      if (skillsInProjects.length >= 4) {
        projectScore = 100;
        projectFeedback = `Excellent. Matched ${skillsInProjects.length} technologies in project descriptions, showing hands-on application.`;
      } else if (skillsInProjects.length >= 2) {
        projectScore = 75;
        projectFeedback = `Good. Matched ${skillsInProjects.length} tech skills. Connect more project details to specific tools.`;
      } else {
        projectScore = 50;
        projectFeedback = "Fair. Projects section lacks explicit technical keyword matches.";
      }
    }

    // 9. Certifications & Achievements
    const certPatterns = /\b(certified|certification|award|scholarship|hackathon|rank|winner|medal|dean's list|cisco|aws|cloud practitioner|accomplishment)\b/gi;
    const certMatches = lowerText.match(certPatterns) || [];
    let certScore = 0;
    let certFeedback = "";
    if (certMatches.length >= 2) {
      certScore = 100;
      certFeedback = `Excellent. Verified ${certMatches.length} certification or honor descriptors.`;
    } else if (certMatches.length === 1) {
      certScore = 70;
      certFeedback = "Good. Detected 1 achievement marker. Try adding standard technical certifications.";
    } else {
      certScore = 40;
      certFeedback = "Poor. Zero certification references found. Add key course achievements or badges.";
    }

    // 10. Professional Presentation (Buzzword Avoidance)
    const buzzwords = /\b(team player|hard worker|hardworking|self-motivated|go-getter|detail-oriented|critical thinker|enthusiastic|think outside the box)\b/gi;
    const buzzwordMatches = lowerText.match(buzzwords) || [];
    let buzzwordScore = 0;
    let buzzwordFeedback = "";
    if (buzzwordMatches.length === 0) {
      buzzwordScore = 100;
      buzzwordFeedback = "Excellent. Avoided generic fluff buzzwords, keeping descriptions professional.";
    } else if (buzzwordMatches.length <= 2) {
      buzzwordScore = 75;
      buzzwordFeedback = `Good. Used ${buzzwordMatches.length} buzzwords. Replace clichés with active project facts.`;
    } else {
      buzzwordScore = 40;
      buzzwordFeedback = `Poor. Detected ${buzzwordMatches.length} fluff buzzwords. Focus on skills instead of clichés.`;
    }

    // 11. Timeline Continuity
    const yearMatches = lowerText.match(/\b(201\d|202\d|2030)\b/g) || [];
    const uniqueYears = new Set(yearMatches);
    if (lowerText.includes("present")) uniqueYears.add("present");
    let timelineScore = 0;
    let timelineFeedback = "";
    if (uniqueYears.size >= 3) {
      timelineScore = 100;
      timelineFeedback = `Excellent. Chronological flow is clear with ${uniqueYears.size} date markers.`;
    } else if (uniqueYears.size >= 1) {
      timelineScore = 70;
      timelineFeedback = "Good. Timeline details present. Make sure all jobs and projects show dates.";
    } else {
      timelineScore = 30;
      timelineFeedback = "Poor. Missing timeline years. Always specify years for projects and education.";
    }

    // 12. Readability & Sentence Length Flow (New Parameter)
    const sentences = parsedText.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.split(/\s+/).length > 2);
    const avgSentenceLength = sentences.length > 0 ? Math.round(wordCount / sentences.length) : 0;
    let readabilityScore = 50;
    let readabilityFeedback = "";
    if (avgSentenceLength >= 10 && avgSentenceLength <= 22) {
      readabilityScore = 100;
      readabilityFeedback = `Excellent. Average bullet/sentence length is ${avgSentenceLength} words, within ideal readability bounds.`;
    } else if (avgSentenceLength > 22 && avgSentenceLength <= 30) {
      readabilityScore = 75;
      readabilityFeedback = `Good. Sentences average ${avgSentenceLength} words. Shorten long bullets to enhance readability.`;
    } else {
      readabilityScore = 50;
      readabilityFeedback = `Fair. Sentence flow averages ${avgSentenceLength} words. Keep sentences concise.`;
    }

    // 13. Domain-Specific Keywords Match (New Parameter)
    const domainPreference = (candidateProfile?.domain_preference || "").toLowerCase();
    const domainKeywordsDict: Record<string, string[]> = {
      frontend: ["css", "html", "dom", "ui", "ux", "responsive", "browser", "viewport", "tailwind", "flexbox", "grid", "frontend"],
      backend: ["database", "server", "api", "latency", "request", "security", "encryption", "scaling", "cache", "middleware", "backend"],
      data: ["model", "analytics", "dataset", "prediction", "statistical", "regression", "matrix", "features", "classification", "data scientist"],
      ai: ["model", "analytics", "dataset", "prediction", "statistical", "regression", "matrix", "features", "classification", "data scientist"]
    };
    
    // Choose appropriate keywords based on domain preference
    let matchingDomain = "backend";
    if (domainPreference.includes("front")) matchingDomain = "frontend";
    else if (domainPreference.includes("data")) matchingDomain = "data";
    else if (domainPreference.includes("ai")) matchingDomain = "ai";
    
    const targetKeywords = domainKeywordsDict[matchingDomain] || domainKeywordsDict.backend;
    const matchedDomainKeywords = targetKeywords.filter(k => lowerText.includes(k));
    let domainScore = 40;
    let domainFeedback = "";
    if (matchedDomainKeywords.length >= 3) {
      domainScore = 100;
      domainFeedback = `Excellent. Matched ${matchedDomainKeywords.length} terms aligning with your preference (${matchingDomain}).`;
    } else if (matchedDomainKeywords.length >= 1) {
      domainScore = 70;
      domainFeedback = `Good. Found ${matchedDomainKeywords.length} keywords. Add more terms specific to ${matchingDomain} engineering.`;
    } else {
      domainScore = 40;
      domainFeedback = `Poor. Zero keywords found for domain preference (${matchingDomain}).`;
    }

    // 14. Document Bullet List Consistency (New Parameter)
    const bulletMatches = parsedText.match(/^[ \t]*[•*-]/gm) || [];
    const bulletCount = bulletMatches.length;
    let formattingScore = 40;
    let formattingFeedback = "";
    if (bulletCount >= 8) {
      formattingScore = 100;
      formattingFeedback = `Excellent. Detected ${bulletCount} bulleted items, indicating good visual structure.`;
    } else if (bulletCount >= 4) {
      formattingScore = 75;
      formattingFeedback = `Good. Detected ${bulletCount} bullets. Use bullet points for all project achievements.`;
    } else {
      formattingScore = 40;
      formattingFeedback = `Poor. Only ${bulletCount} bullets detected. Avoid large paragraphs; use lists instead.`;
    }

    // 15. Hyperlink Completeness (New Parameter)
    const linkMatches = lowerText.match(/(?:github\.com|linkedin\.com|http|https|\.github\.io|\.vercel\.app|\.app)/gi) || [];
    const linkCount = new Set(linkMatches).size;
    let linkScore = 30;
    let linkFeedback = "";
    if (linkCount >= 3) {
      linkScore = 100;
      linkFeedback = `Excellent. Detected ${linkCount} working repository or profile link structures.`;
    } else if (linkCount >= 1) {
      linkScore = 70;
      linkFeedback = `Good. Detected ${linkCount} link structure. Add direct hyperlinks to all portfolio projects.`;
    } else {
      linkScore = 30;
      linkFeedback = "Poor. Zero active hyperlinks found. Add links to live code repos or portfolios.";
    }
    
    // 16. Email Professionalism (New Parameter)
    const emailMatch = lowerText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) || [];
    const emailAddress = emailMatch[0] || "";
    let emailScore = 100;
    let emailFeedback = "Excellent. Email address is standard and professional.";
    const unprofessionalKeywords = ["cool", "killer", "sexy", "princess", "sweet", "cute", "hacker", "boss", "king", "queen", "baby", "love"];
    if (unprofessionalKeywords.some(k => emailAddress.includes(k))) {
      emailScore = 40;
      emailFeedback = "Poor. Email username contains unprofessional slang. Use a clean, name-based email.";
    }

    // 17. First-Person Pronouns Avoidance (New Parameter)
    const pronounMatches = lowerText.match(/\b(i|me|my|myself|we|our|us)\b/g) || [];
    let pronounScore = 100;
    let pronounFeedback = "";
    if (pronounMatches.length === 0) {
      pronounScore = 100;
      pronounFeedback = "Excellent. Bullet descriptions use third-person action verbs without personal pronouns.";
    } else if (pronounMatches.length <= 2) {
      pronounScore = 70;
      pronounFeedback = `Good. Only ${pronounMatches.length} personal pronouns found. Try rephrasing into standard action bullets.`;
    } else {
      pronounScore = 30;
      pronounFeedback = `Poor. Detected ${pronounMatches.length} personal pronouns (e.g. 'I', 'my'). Avoid pronouns in resumes.`;
    }

    // 18. GitHub Profile Detail (New Parameter)
    let githubQualityScore = 50;
    let githubQualityFeedback = "Poor. GitHub link is missing.";
    if (hasGitHub) {
      githubQualityScore = 100;
      githubQualityFeedback = "Excellent. Direct link to project repositories (GitHub) is present.";
    }

    // 19. LinkedIn Profile Detail (New Parameter)
    let linkedinQualityScore = 50;
    let linkedinQualityFeedback = "Poor. LinkedIn link is missing.";
    if (hasLinkedIn) {
      linkedinQualityScore = 100;
      linkedinQualityFeedback = "Excellent. Direct link to professional profile (LinkedIn) is present.";
    }

    // 20. Tech Skill Balance (Languages vs Frameworks) (New Parameter)
    const coreLanguages = ["python", "javascript", "typescript", "java", "c\\+\\+", "cpp", "c#", "csharp", "golang", "go", "ruby", "php"];
    const techFrameworks = ["react", "angular", "vue", "next.js", "nodejs", "node.js", "express", "django", "flask", "spring boot", "laravel"];
    const hasCoreLang = coreLanguages.some(l => {
      const regex = new RegExp(`\\b${l}\\b`, 'i');
      return regex.test(lowerText);
    });
    const hasFramework = techFrameworks.some(f => {
      const regex = new RegExp(`\\b${f}\\b`, 'i');
      return regex.test(lowerText);
    });
    let balanceScore = 50;
    let balanceFeedback = "";
    if (hasCoreLang && hasFramework) {
      balanceScore = 100;
      balanceFeedback = "Excellent. Well-balanced skill list featuring both core languages and framework tools.";
    } else if (hasCoreLang || hasFramework) {
      balanceScore = 70;
      balanceFeedback = "Good. Balanced partially. Add both core programming languages and respective web frameworks.";
    } else {
      balanceScore = 40;
      balanceFeedback = "Poor. No recognizable languages or frameworks found.";
    }

    // 21. OS / Tools Mention (New Parameter)
    const toolsPatterns = /\b(linux|unix|ubuntu|vscode|git|postman|jira|bash|shell|docker|git)\b/gi;
    const toolsMatches = lowerText.match(toolsPatterns) || [];
    let toolsScore = 40;
    let toolsFeedback = "";
    if (toolsMatches.length >= 2) {
      toolsScore = 100;
      toolsFeedback = `Excellent. Listed standard developer tools and environments: ${[...new Set(toolsMatches)].slice(0, 3).join(", ")}.`;
    } else if (toolsMatches.length === 1) {
      toolsScore = 70;
      toolsFeedback = "Good. Mentioned 1 tooling system. Add other systems like Linux, VS Code, or Postman.";
    } else {
      toolsScore = 40;
      toolsFeedback = "Poor. No operating systems or development workspace tools listed.";
    }

    // 22. Database Specificity (New Parameter)
    const dbPatterns = /\b(sql|mysql|postgresql|sqlite|nosql|mongodb|redis|schema|index|query|queries|database|databases)\b/gi;
    const dbMatches = lowerText.match(dbPatterns) || [];
    let dbScore = 40;
    let dbFeedback = "";
    if (dbMatches.length >= 2) {
      dbScore = 100;
      dbFeedback = "Excellent. Detailed familiarity with database querying, storage, or indexing.";
    } else if (dbMatches.length === 1) {
      dbScore = 70;
      dbFeedback = "Good. Found minimal database keywords. Mention specific databases (e.g. PostgreSQL, Redis).";
    } else {
      dbScore = 40;
      dbFeedback = "Poor. Database details are missing. Add SQL, MySQL, MongoDB, or query terms.";
    }

    // 23. Cloud/DevOps Exposure (New Parameter)
    const devOpsPatterns = /\b(aws|gcp|azure|docker|kubernetes|ci\/cd|jenkins|deployment|cloud|vercel|netlify|heroku)\b/gi;
    const devOpsMatches = lowerText.match(devOpsPatterns) || [];
    let devOpsScore = 40;
    let devOpsFeedback = "";
    if (devOpsMatches.length >= 2) {
      devOpsScore = 100;
      devOpsFeedback = "Excellent. Strong exposure to cloud deployments, container tools, or CI/CD pipelines.";
    } else if (devOpsMatches.length === 1) {
      devOpsScore = 70;
      devOpsFeedback = "Good. Showed minimal deployment exposure. Add Docker or cloud service platforms.";
    } else {
      devOpsScore = 40;
      devOpsFeedback = "Poor. Lacks DevOps or cloud configuration terms. Include Docker, Vercel, AWS, etc.";
    }

    // 24. Project API Integrations (New Parameter)
    const apiPatterns = /\b(api|apis|rest|restful|endpoint|endpoints|json|axios|fetch|graphql|webhook|webhooks|integration|integrations)\b/gi;
    const apiMatches = lowerText.match(apiPatterns) || [];
    let apiScore = 40;
    let apiFeedback = "";
    if (apiMatches.length >= 2) {
      apiScore = 100;
      apiFeedback = "Excellent. Demonstrates experience integration building/consuming web API endpoints.";
    } else if (apiMatches.length === 1) {
      apiScore = 70;
      apiFeedback = "Good. Minimal API references. Detail backend routing or REST integrations.";
    } else {
      apiScore = 40;
      apiFeedback = "Poor. No API references found. Mention if projects consume REST or GraphQL services.";
    }

    // 25. DSA Exposure (New Parameter)
    const dsaPatterns = /\b(dsa|data structures|algorithms|leetcode|complexity|big o|problem solving|recursion|sorting|searching|graph|tree|trees)\b/gi;
    const dsaMatches = lowerText.match(dsaPatterns) || [];
    let dsaScore = 40;
    let dsaFeedback = "";
    if (dsaMatches.length >= 2) {
      dsaScore = 100;
      dsaFeedback = "Excellent. Direct references to algorithm designs or data structure principles.";
    } else if (dsaMatches.length === 1) {
      dsaScore = 70;
      dsaFeedback = "Good. Add more explicit terms like time complexity or algorithm names.";
    } else {
      dsaScore = 40;
      dsaFeedback = "Poor. Algorithm optimization parameters or complexity keywords are absent.";
    }

    // Compute Overall Composite ATS Score (Weighted Average)
    const atsScoreComputed = Math.round(
      (contactScore * 0.08) +          // 8%
      (structureScore * 0.08) +        // 8%
      (densityScore * 0.04) +          // 4%
      (verbScore * 0.08) +             // 8%
      (impactScore * 0.08) +           // 8%
      (skillScoreNormalized * 0.15) +  // 15%
      (educationScore * 0.04) +        // 4%
      (projectScore * 0.08) +          // 8%
      (certScore * 0.04) +             // 4%
      (buzzwordScore * 0.04) +         // 4%
      (timelineScore * 0.04) +         // 4%
      (readabilityScore * 0.02) +      // 2%
      (domainScore * 0.02) +           // 2%
      (formattingScore * 0.02) +       // 2%
      (linkScore * 0.02) +             // 2%
      (emailScore * 0.01) +            // 1%
      (pronounScore * 0.01) +          // 1%
      (githubQualityScore * 0.01) +    // 1%
      (linkedinQualityScore * 0.01) +  // 1%
      (balanceScore * 0.02) +          // 2%
      (toolsScore * 0.01) +            // 1%
      (dbScore * 0.01) +               // 1%
      (devOpsScore * 0.01) +           // 1%
      (apiScore * 0.01) +              // 1%
      (dsaScore * 0.01)                // 1%
    );

    // Map Overall Resume Quality Tier
    let tier: "Excellent" | "Good" | "Fair" | "Poor" = "Poor";
    if (atsScoreComputed >= 85) tier = "Excellent";
    else if (atsScoreComputed >= 70) tier = "Good";
    else if (atsScoreComputed >= 50) tier = "Fair";

    // Map suggested job roles
    const suggestedRoles: string[] = [];
    const skillsLower = extractedSkills.map(s => s.toLowerCase());

    const webSkills = ["javascript", "typescript", "react", "html", "css", "angular", "vue", "next.js", "tailwind css"];
    const backendSkills = ["node.js", "express", "django", "flask", "spring boot", "sql", "postgresql", "mysql", "mongodb"];
    const dsSkills = ["python", "machine learning", "deep learning", "data science"];
    const cloudSkills = ["aws", "azure", "gcp", "docker", "kubernetes", "jenkins", "ci/cd"];

    if (webSkills.some(s => skillsLower.includes(s)) && backendSkills.some(s => skillsLower.includes(s))) {
      suggestedRoles.push("Full Stack Developer");
    } else if (webSkills.some(s => skillsLower.includes(s))) {
      suggestedRoles.push("Frontend Developer");
    } else if (backendSkills.some(s => skillsLower.includes(s))) {
      suggestedRoles.push("Backend Developer");
    }

    if (dsSkills.some(s => skillsLower.includes(s))) {
      suggestedRoles.push("Data Scientist / ML Engineer");
    }
    if (cloudSkills.some(s => skillsLower.includes(s))) {
      suggestedRoles.push("DevOps / Cloud Engineer");
    }
    if (suggestedRoles.length === 0) {
      suggestedRoles.push("Software Engineer");
    }

    // Map gaps
    const gaps: string[] = [];
    if (!skillsLower.includes("sql") && !skillsLower.includes("postgresql") && !skillsLower.includes("mongodb")) {
      gaps.push("Database systems & SQL experience");
    }
    if (!skillsLower.includes("git")) {
      gaps.push("Version control systems (Git/GitHub)");
    }
    if (!skillsLower.includes("docker") && !skillsLower.includes("kubernetes")) {
      gaps.push("Containerization & cloud deployment (Docker)");
    }
    if (!skillsLower.includes("dsa")) {
      gaps.push("Data structures and algorithms practice");
    }
    if (gaps.length === 0) {
      gaps.push("No major gaps. Expand active development portfolio.");
    }

    const atsResult = checkAtsParseability(parsedText, { numPages: parsedPdf.numpages });
    const educationEntries = extractEducation(parsedText);
    const timelineResult = extractTimeline(parsedText);
    const passiveVoiceResult = detectPassiveVoice(parsedText);
    const verbRepetitionResult = detectVerbRepetition(parsedText, actionVerbsList);

    // Generate summary text
    let summary = "";
    if (atsScoreComputed >= 85) {
      summary = `Excellent candidate profile showing comprehensive skills mapping: ${extractedSkills.slice(0, 4).join(", ")}. Document is highly structured with measurable results.`;
    } else if (atsScoreComputed >= 70) {
      summary = `Good profile. Core skills matched: ${extractedSkills.slice(0, 4).join(", ")}. Can improve by adding more numerical metrics and expanding contact details.`;
    } else if (atsScoreComputed >= 50) {
      summary = `Fair profile. Matched skills: ${extractedSkills.slice(0, 4).join(", ")}. Needs stronger action verb usage and clear headings.`;
    } else {
      summary = `Poor profile. Resubmit with detailed sections covering personal projects, education details, and key technical capabilities.`;
    }

    const parsedResult = {
      skills: extractedSkills.length > 0 ? extractedSkills : ["Software Engineering"],
      atsAnalysis: {
        atsScore: atsScoreComputed,
        tier,
        summary,
        gaps,
        suggestedRoles,
        atsParseability: atsResult,
        education: educationEntries,
        timeline: timelineResult,
        passiveVoice: passiveVoiceResult,
        verbRepetition: verbRepetitionResult,
        breakdown: {
          contactInfo: { score: contactScore, feedback: contactFeedback },
          sectionStructure: { score: structureScore, feedback: structureFeedback },
          contentDensity: { score: densityScore, feedback: densityFeedback },
          actionVerbs: { score: verbScore, feedback: verbFeedback },
          impactMetrics: { score: impactScore, feedback: impactFeedback },
          skillsDepth: { score: skillScoreNormalized, feedback: skillFeedback },
          educationDepth: { score: educationScore, feedback: educationFeedback },
          projectQuality: { score: projectScore, feedback: projectFeedback },
          certifications: { score: certScore, feedback: certFeedback },
          buzzwordScore: { score: buzzwordScore, feedback: buzzwordFeedback },
          timelineScore: { score: timelineScore, feedback: timelineFeedback },
          readabilityScore: { score: readabilityScore, feedback: readabilityFeedback },
          domainKeywords: { score: domainScore, feedback: domainFeedback },
          formattingConsistency: { score: formattingScore, feedback: formattingFeedback },
          linkCompleteness: { score: linkScore, feedback: linkFeedback },
          emailProfessionalism: { score: emailScore, feedback: emailFeedback },
          firstPersonPronouns: { score: pronounScore, feedback: pronounFeedback },
          githubQuality: { score: githubQualityScore, feedback: githubQualityFeedback },
          linkedinQuality: { score: linkedinQualityScore, feedback: linkedinQualityFeedback },
          techBalance: { score: balanceScore, feedback: balanceFeedback },
          toolsOS: { score: toolsScore, feedback: toolsFeedback },
          databaseSpecificity: { score: dbScore, feedback: dbFeedback },
          cloudDevOps: { score: devOpsScore, feedback: devOpsFeedback },
          apiComplexity: { score: apiScore, feedback: apiFeedback },
          dsaExposure: { score: dsaScore, feedback: dsaFeedback }
        }
      }
    };

    // Generate local public URL for the resume
    const resume_url = `/uploads/resumes/${req.file.filename}`;

    // Save to Postgres candidate_profiles
    const { data: profile, error } = await db
      .from("candidate_profiles")
      .update({
        resume_url,
        skills: parsedResult.skills,
        resume_ats_analysis: parsedResult.atsAnalysis
      })
      .eq("user_id", req.user!.id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ message: "Resume parsed successfully", profile });
  } catch (err: any) {
    console.error("Resume upload error:", err);
    res.status(500).json({ error: err.message || "Server error during upload" });
  }
});

router.delete("/resume", async (req: AuthRequest, res) => {
  try {
    const { data: profile, error } = await db
      .from("candidate_profiles")
      .update({
        resume_url: null,
        resume_ats_analysis: null
      })
      .eq("user_id", req.user!.id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ message: "Resume deleted successfully", profile });
  } catch (err: any) {
    console.error("Resume delete error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "tpo" | "recruiter" | "candidate";
  roll_number?: string | null;
  college_id?: string | null;
  profile_complete?: boolean;
  must_change_password?: boolean;
}

export interface College {
  id: string;
  name: string;
  code: string;
  location?: string | null;
  created_at: string;
}

export interface CandidateProfile {
  id: string;
  user_id: string;
  college_id: string;
  roll_number: string;
  branch: string;
  cgpa: number;
  graduation_year: number;
  phone?: string | null;
  skills?: string[] | null;
  domain_preference?: string | null;
  marksheet_url?: string | null;
  resume_url?: string | null;
  documents_verified?: boolean;
  profile_complete?: boolean;
}

export interface JobDrive {
  id: string;
  title: string;
  company_name: string;
  company_description?: string | null;
  college_id: string;
  min_cgpa: number;
  allowed_branches: string[];
  required_skills: string[];
  salary_min?: number | null;
  salary_max?: number | null;
  drive_date?: string | null;
  exam_id?: string | null;
  interview_pass_score?: number | null;
  status: string;
  created_by: string;
  created_at: string;
  college?: College;
}

export interface Exam {
  id: string;
  title: string;
  description: string | null;
  duration: number;
  total_marks: number;
  pass_marks: number;
  available_from?: string | null;
  available_until?: string | null;
  status?: "draft" | "published" | "closed" | string;
  shuffle_questions?: boolean;
  negative_marking?: number;
  created_by: string;
  created_at: string;
}

export interface Question {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  marks: number;
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  question_id: string;
  marks: number;
  question: Question;
}

export interface CodingQuestion {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  starter_code: string;
  test_cases: TestCase[];
  marks: number;
}

export interface TestCase {
  input: string;
  expected_output: string;
}

export interface ExamCodingQuestion {
  id: string;
  exam_id: string;
  coding_question_id: string;
  marks: number;
  question: CodingQuestion;
}

export interface ExamAssignment {
  id: string;
  exam_id: string;
  candidate_id: string;
  assigned_by: string;
  assigned_at: string;
  exam: Exam;
  attempts?: Attempt[];
}

export interface Attempt {
  id: string;
  exam_id: string;
  candidate_id: string;
  recruiter_id: string;
  status: string;
  score: number | null;
  started_at: string;
  submitted_at: string | null;
  exam?: Exam;
  exams?: { title: string; total_marks?: number; pass_marks?: number };
  users?: { name: string; email: string };
}

export interface InterviewStageResult {
  intro_score: number;
  speaking_score: number;
  pronunciation_score: number;
  technical_score: number;
  selected: boolean;
}

export interface Answer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_option: string;
  is_correct: boolean;
  marks_obtained: number;
}

export interface CodingSubmission {
  id: string;
  attempt_id: string;
  coding_question_id: string;
  code: string;
  language: string;
  score: number;
  status: string;
}

export interface DashboardStats {
  recruiters?: number;
  tpos?: number;
  colleges?: number;
  drives?: number;
  registered?: number;
  offers?: number;
  profileComplete?: number;
  documentsVerified?: number;
  candidates?: number;
  exams?: number;
  attempts?: number;
  assignments?: number;
  completedAttempts?: number;
  inProgressAttempts?: number;
  pendingAssignments?: number;
  averageScore?: number;
  passRate?: number;
  completionRate?: number;
  bestScore?: number;
  passCount?: number;
  assigned?: number;
  completed?: number;
  inProgress?: number;
  pending?: number;
  rank?: number;
  totalRanked?: number;
  averagePercentage?: number;
}

export interface DashboardListItem {
  id: string;
  title: string;
  subtitle: string;
  meta?: string;
  tone?: "blue" | "violet" | "green" | "amber" | "rose" | "cyan";
  status?: string;
  score?: number;
  percentage?: number;
  date?: string | null;
  examId?: string;
  candidateId?: string;
  candidateName?: string;
  candidateEmail?: string;
}

export interface DashboardTrendPoint {
  [key: string]: string | number | undefined;
  month: string;
  score?: number;
  created?: number;
  conducted?: number;
}

export interface LeaderboardItem {
  candidateId: string;
  name: string;
  email?: string;
  attempts: number;
  completedAttempts: number;
  averageScore: number;
  averagePercentage?: number;
  rank?: number;
}

export interface DashboardMetric {
  label: string;
  value: number;
}

export interface AdminRecruiterSnapshot {
  id: string;
  name: string;
  email: string;
  created_at?: string;
  candidateCount: number;
  examCount: number;
  attemptCount: number;
  completedCount: number;
}

export interface RecruiterExamPerformance {
  examId: string;
  title: string;
  assignedCount: number;
  attemptCount: number;
  completedCount: number;
  averageScore: number;
  passRate: number;
}

export interface RecruiterCandidatePerformance {
  candidateId: string;
  name: string;
  email: string;
  attempts: number;
  completedAttempts: number;
  averageScore: number;
}

export interface CandidatePerformanceItem {
  examId: string;
  title: string;
  score: number;
  totalMarks: number;
  passMarks: number;
  percentage: number;
  submittedAt: string | null;
  status: "pass" | "fail";
}

// ─── Analytics Types ───

export interface TopicMasteryItem {
  topic: string;
  total: number;
  correct: number;
  accuracy: number;
  avgMarks: number;
}

export interface CodingLanguageStat {
  language: string;
  submissions: number;
  successCount: number;
  successRate: number;
  avgScore: number;
}

export interface CodingDifficultyStat {
  difficulty: string;
  submissions: number;
  avgScore: number;
  avgAttemptsBeforeSuccess: number;
}

export interface CodingTopicStat {
  topic: string;
  submissions: number;
  avgScore: number;
}

export interface CodingAnalytics {
  languages: CodingLanguageStat[];
  difficulties: CodingDifficultyStat[];
  topics: CodingTopicStat[];
}

export interface InterviewDimensionScores {
  relevance: number;
  communication: number;
  intro: number;
  speaking: number;
  pronunciation: number;
  technical: number;
}

export interface InterviewAnalyticsItem {
  id: string;
  jobTitle: string;
  company: string;
  totalScore: number;
  dimensions: InterviewDimensionScores;
  submittedAt: string;
  selected: boolean;
}

export interface InterviewAnalytics {
  interviews: InterviewAnalyticsItem[];
  averageDimensions: InterviewDimensionScores;
  bestDimension: string;
  focusDimension: string;
}

export interface JobPipelineItem {
  jobId: string;
  jobTitle: string;
  company: string;
  status: string;
  stage: number;
  updatedAt: string;
  nextAction: string;
}

export interface JobPipelineAnalytics {
  pipeline: JobPipelineItem[];
  statusCounts: Record<string, number>;
}

export interface StreakAnalytics {
  currentStreak: number;
  longestStreak: number;
  totalActiveDays: number;
  weeklyActivity: Array<{ week: string; days: number[] }>;
}

export interface ReadinessScore {
  score: number;
  components: {
    exam: number;
    coding: number;
    interview: number;
    consistency: number;
    breadth: number;
  };
  zone: "ready" | "approaching" | "needs_work";
}

export interface ProctoringTypeSummary {
  type: string;
  count: number;
  severity: string;
}

export interface ProctoringExamSummary {
  examId: string;
  title: string;
  violations: number;
  lastIncident: string;
}

export interface ProctoringSummary {
  totalViolations: number;
  byType: ProctoringTypeSummary[];
  byExam: ProctoringExamSummary[];
  insights: string;
}

export interface PeerTopicComparison {
  topic: string;
  percentile: number;
  peerAverage: number;
  myAverage: number;
}

export interface PeerComparison {
  overallPercentile: number;
  topicPercentiles: PeerTopicComparison[];
  rank: number;
  totalPeers: number;
}

export interface CandidateDrillDownExam {
  examId: string;
  title: string;
  score: number;
  totalMarks: number;
  percentage: number;
  status: string;
  submittedAt: string;
}

export interface CandidateDrillDownCoding {
  submissionId: string;
  title: string;
  language: string;
  score: number;
  difficulty: string;
}

export interface CandidateDrillDownProctoring {
  totalViolations: number;
  byType: Array<{ type: string; count: number }>;
  severity: string;
}

export interface CandidateDrillDownInterview {
  interviewId: string;
  jobTitle: string;
  score: number;
  selected: boolean;
  dimensions: InterviewDimensionScores;
}

export interface CandidateDrillDownPipeline {
  jobId: string;
  jobTitle: string;
  company: string;
  status: string;
  updatedAt: string;
}

export interface CandidateDrillDown {
  candidate: {
    id: string;
    name: string;
    email: string;
    roll_number?: string;
    branch: string;
    cgpa: number;
    skills: string[];
    documents_verified: boolean;
  };
  exams: CandidateDrillDownExam[];
  coding: CandidateDrillDownCoding[];
  proctoring: CandidateDrillDownProctoring;
  interviews: CandidateDrillDownInterview[];
  pipeline: CandidateDrillDownPipeline[];
}

export interface TopicPerformanceItem {
  topic: string;
  totalQuestions: number;
  avgAccuracy: number;
  mostMissedConcept: string;
}

export interface ExamTopicPerformance {
  examId: string;
  title: string;
  topics: TopicPerformanceItem[];
  focusAreas: string[];
}

export interface ProctoringTypeAnalytic {
  type: string;
  count: number;
  severity: string;
}

export interface ProctoringCandidateAnalytic {
  candidateId: string;
  name: string;
  violations: number;
  severity: string;
}

export interface ProctoringExamAnalytic {
  examId: string;
  title: string;
  violations: number;
  candidatesFlagged: number;
}

export interface ProctoringTimeOfDay {
  hour: string;
  violations: number;
}

export interface RecruiterProctoringAnalytics {
  totalViolations: number;
  byType: ProctoringTypeAnalytic[];
  byCandidate: ProctoringCandidateAnalytic[];
  byExam: ProctoringExamAnalytic[];
  timeOfDay: ProctoringTimeOfDay[];
}

export interface PlagiarismExamAnalytic {
  examId: string;
  title: string;
  flags: number;
  avgSimilarity: number;
}

export interface PlagiarismPair {
  attemptA: string;
  candidateA: string;
  attemptB: string;
  candidateB: string;
  similarity: number;
  questionTitle: string;
}

export interface RecruiterPlagiarismAnalytics {
  totalFlags: number;
  avgSimilarity: number;
  byExam: PlagiarismExamAnalytic[];
  topPairs: PlagiarismPair[];
}

export interface InterviewFunnelStage {
  stage: string;
  count: number;
  dropOff: number;
}

export interface ScoreDistributionItem {
  range: string;
  count: number;
}

export interface InterviewTopCandidate {
  candidateId: string;
  name: string;
  score: number;
  dimensions: Partial<InterviewDimensionScores>;
}

export interface RecruiterInterviewFunnel {
  funnel: InterviewFunnelStage[];
  scoreDistribution: ScoreDistributionItem[];
  topCandidates: InterviewTopCandidate[];
}

export interface TimeScatterPoint {
  timeMinutes: number;
  score: number;
  examTitle: string;
  candidateName: string;
}

export interface TimeStats {
  avgTimeMinutes: number;
  medianTimeMinutes: number;
  fastFinishersAvgScore: number;
  slowFinishersAvgScore: number;
}

export interface TimeByExam {
  examId: string;
  title: string;
  avgTime: number;
  medianScore: number;
}

export interface RecruiterTimeToComplete {
  scatterData: TimeScatterPoint[];
  stats: TimeStats;
  byExam: TimeByExam[];
}

export interface CodingLanguageDistribution {
  language: string;
  submissions: number;
  successRate: number;
  avgScore: number;
}

export interface CodingLanguageTrend {
  month: string;
  python: number;
  java: number;
  cpp: number;
  javascript: number;
}

export interface RecruiterCodingLanguages {
  distribution: CodingLanguageDistribution[];
  trend: CodingLanguageTrend[];
}

export interface PredictiveShortlistCandidate {
  candidateId: string;
  name: string;
  email: string;
  branch: string;
  cgpa: number;
  predictedScore: number;
  components: {
    exam: number;
    coding: number;
    interview: number;
    cgpa: number;
    proctoring: number;
  };
  zone: string;
  rank: number;
}

export interface RecruiterPredictiveShortlist {
  candidates: PredictiveShortlistCandidate[];
  totalCandidates: number;
  greenZone: number;
  yellowZone: number;
  redZone: number;
}

export interface TpoPlacementBranch {
  branch: string;
  totalStudents: number;
  placed: number;
  placementRate: number;
  avgSalary: number;
  avgCgpa: number;
}

export interface TpoPlacementYear {
  year: number;
  totalStudents: number;
  placed: number;
  placementRate: number;
}

export interface TpoPlacementCompany {
  company: string;
  offers: number;
  avgSalary: number;
}

export interface TpoPlacementStats {
  byBranch: TpoPlacementBranch[];
  byYear: TpoPlacementYear[];
  topCompanies: TpoPlacementCompany[];
}

export interface TpoReadinessStudent {
  candidateId: string;
  name: string;
  roll_number?: string;
  branch: string;
  cgpa: number;
  readinessScore: number;
  zone: string;
}

export interface TpoReadinessHeatmap {
  students: TpoReadinessStudent[];
  zoneCounts: Record<string, number>;
}

export interface TpoCompanyPerformance {
  company: string;
  drives: number;
  registered: number;
  examTaken: number;
  passed: number;
  shortlisted: number;
  offered: number;
  conversionRate: number;
}

export interface TpoUploadItem {
  id: string;
  fileName: string;
  rowsTotal: number;
  rowsCreated: number;
  rowsFailed: number;
  successRate: number;
  createdAt: string;
}

export interface TpoUploadTrend {
  month: string;
  uploads: number;
  successRate: number;
}

export interface TpoUploadTracking {
  uploads: TpoUploadItem[];
  trend: TpoUploadTrend[];
}

export interface AdminGrowthWeek {
  week: string;
  newUsers: number;
  examsCreated: number;
  attemptsCompleted: number;
  drivesCreated: number;
  interviewsCompleted: number;
}

export interface AdminGrowthMonth {
  month: string;
  newUsers: number;
  examsCreated: number;
  attemptsCompleted: number;
  drivesCreated: number;
  interviewsCompleted: number;
}

export interface AdminPlatformGrowth {
  weekly: AdminGrowthWeek[];
  monthly: AdminGrowthMonth[];
  totals: {
    totalUsers: number;
    totalCandidates: number;
    totalExams: number;
    totalAttempts: number;
    totalDrives: number;
    totalInterviews: number;
  };
}

export interface ApiHealthStatus {
  status: string;
  responseTimeMs: number;
}

export interface AdminSystemHealth {
  grading: {
    pendingJobs: number;
    avgGradingTimeMs: number;
    last24hCompleted: number;
    failed24h: number;
  };
  apis: {
    judge0: ApiHealthStatus;
    groq: ApiHealthStatus;
  };
  errorRate: {
    last24h: number;
    last7d: number;
  };
  dbConnections: {
    active: number;
    idle: number;
    max: number;
  };
}

export interface RealTimeSubmission {
  attemptId: string;
  candidateName: string;
  examTitle: string;
  submittedAt: string;
  score: number;
}

export interface RealTimeProctoringEvent {
  eventId: string;
  candidateName: string;
  eventType: string;
  severity: string;
  capturedAt: string;
}

export interface RealTimeMonitoringPoint {
  hour: string;
  activeCandidates: number;
}

export interface AdminRealTimeActivity {
  liveAttempts: number;
  recentSubmissions: RealTimeSubmission[];
  recentProctoringEvents: RealTimeProctoringEvent[];
  activeMonitoring: RealTimeMonitoringPoint[];
  suspiciousActivity: {
    totalFlags: number;
    tabSwitches: number;
    faceMissing: number;
    cameraOffline: number;
  };
}

import bcrypt from "bcryptjs";
import { candidateRepository as candidateRepo } from "../repositories/candidateRepository.js";
import {
  createTopicScores,
  feedMcqAnswer,
  feedCodingSubmission,
  feedCommunicationScore,
  generateInsights,
} from "../lib/insights.js";
import { formatDate, monthsBack } from "../lib/dateUtils.js";
import { getPasswordValidationError } from "../lib/validation.js";
import { PASSWORD_SALT_ROUNDS } from "../lib/constants.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { cache } from "../lib/cache.js";

export async function buildPublicPortfolio(slug: string) {
  const cacheKey = `portfolio:${slug}`;
  const cached = await cache.get<any>(cacheKey);
  if (cached) {
    return cached;
  }

  const profile = await candidateRepo.findPublicPortfolio(slug);
  if (!profile) {
    throw new NotFoundError("Portfolio not found");
  }

  const userId = profile.user_id;

  const [mcqAnswers, interviews, codingSubs, applications] = await Promise.all([
    candidateRepo.getCandidateAnswers(userId),
    candidateRepo.getCompletedInterviews(userId),
    candidateRepo.getCodingSubmissions(userId),
    candidateRepo.getCandidateApplications(userId),
  ]);

  const topicScores = createTopicScores();

  if (interviews) {
    for (const iv of interviews) {
      feedCommunicationScore(topicScores, iv.communication_score || 0);
    }
  }

  if (mcqAnswers) {
    for (const ans of mcqAnswers) {
      feedMcqAnswer(topicScores, ans.is_correct, ans.question?.topic);
    }
  }

  if (codingSubs) {
    for (const sub of codingSubs) {
      const maxMarks = sub.coding_questions?.marks || 10;
      feedCodingSubmission(topicScores, sub.score, maxMarks);
    }
  }

  const { radarData, strengths, weaknesses } = generateInsights(topicScores, "Profile");

  const result = {
    profile,
    applications: applications || [],
    radarData,
    strengths,
    weaknesses,
  };

  await cache.set(cacheKey, result, 300);
  return result;
}

export async function getProfile(userId: string) {
  const [user, profile] = await Promise.all([
    candidateRepo.getUserById(userId),
    candidateRepo.getProfileByUserId(userId),
  ]);

  return { user, profile };
}

export async function updateProfile(userId: string, body: any) {
  const {
    phone,
    skills,
    domain_preference,
    github_url,
    linkedin_url,
    portfolio_url,
    bio,
    photo_url,
    projects,
    semester_grades,
  } = body;

  const profileData = {
    phone: phone || null,
    skills: Array.isArray(skills) ? skills : [],
    domain_preference: domain_preference || null,
    github_url: github_url || null,
    linkedin_url: linkedin_url || null,
    portfolio_url: portfolio_url || null,
    bio: bio || null,
    photo_url: photo_url || null,
    projects: Array.isArray(projects) ? projects : [],
    semester_grades: Array.isArray(semester_grades) ? semester_grades : [],
  };

  const updated = await candidateRepo.updateProfile(userId, profileData);
  if (updated) {
    await cache.invalidatePattern("portfolio:*");
  }
  return updated;
}

export async function completeOnboarding(userId: string, body: any) {
  const { password, phone, skills, domain_preference, marksheet_url, resume_url } = body;

  if (!password || !phone || !Array.isArray(skills) || skills.length === 0 || !domain_preference) {
    throw new ValidationError("Password, phone, skills, and domain preference are required");
  }

  const passwordError = getPasswordValidationError(password);
  if (passwordError) {
    throw new ValidationError(passwordError);
  }

  const password_hash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

  const [, profile] = await Promise.all([
    candidateRepo.updateUser(userId, {
      password_hash,
      must_change_password: false,
      profile_complete: true,
    }),
    candidateRepo.updateProfile(userId, {
      phone,
      skills,
      domain_preference,
      marksheet_url: marksheet_url || null,
      resume_url: resume_url || null,
      profile_complete: true,
    }),
  ]);

  if (profile) {
    await cache.invalidatePattern("portfolio:*");
  }

  return profile;
}

export async function getDashboardData(candidateId: string) {
  const assignments = await candidateRepo.getExamAssignments(candidateId);
  const examIds = (assignments || []).map((assignment: any) => assignment.exam_id);

  const attempts = examIds.length
    ? await candidateRepo.getAttemptsByExamIds(candidateId, examIds)
    : [];

  const enriched = (assignments || []).map((assignment: any) => ({
    ...assignment,
    attempts: (attempts || []).filter((attempt: any) => attempt.exam_id === assignment.exam_id),
  }));

  const latestAttempts = enriched
    .map((assignment: any) => assignment.attempts?.[0])
    .filter(Boolean);

  const completedAttempts = enriched.filter((assignment: any) => assignment.attempts?.[0]?.status === "completed");
  const inProgressAttempts = enriched.filter((assignment: any) => assignment.attempts?.[0]?.status === "in_progress");
  const pendingAssignments = enriched.filter((assignment: any) => !assignment.attempts?.[0]);

  const performance = completedAttempts.map((assignment: any) => {
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
    .map((assignment: any) => {
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

  const leaderboardAttempts = examIds.length
    ? await candidateRepo.getLeaderboardAttempts(examIds)
    : [];

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

  return {
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
  };
}

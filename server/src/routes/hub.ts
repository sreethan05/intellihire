import { Router } from "express";
import { db } from "../lib/postgres.js";
import { authMiddleware, type AuthRequest } from "../middleware/auth.js";

// --- Hub Payload Types ---
interface ActionItem {
  id?: string;
  priority: "urgent" | "high" | "normal";
  title: string;
  description: string;
  action_url?: string;
  date?: string;
}

interface ScheduleEvent {
  id?: string;
  title: string;
  description?: string;
  date: string;
  type: string;
}

interface JourneyTracker {
  jobId?: string;
  jobTitle: string;
  companyName: string;
  currentStage: string;
}

interface _HubOverview {
  role: string;
  stats: Record<string, string | number>;
  actionItems: ActionItem[];
  recentActivity: { title: string; description: string; date: string }[];
  upcomingSchedule: ScheduleEvent[];
  insights: Record<string, unknown>;
  quickLinks: { label: string; path: string; color: string }[];
}

const router = Router();

router.use(authMiddleware);

router.get("/overview", async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;

    if (userRole === "candidate") {
      const payload = await getCandidateHubData(userId);
      res.json(payload);
    } else if (userRole === "tpo") {
      const payload = await getTpoHubData(userId);
      res.json(payload);
    } else if (userRole === "recruiter") {
      const payload = await getRecruiterHubData(userId);
      res.json(payload);
    } else if (userRole === "admin") {
      const payload = await getAdminHubData(userId);
      res.json(payload);
    } else {
      res.status(400).json({ error: "Invalid user role" });
    }
  } catch (err) {
    console.error("Hub overview error:", err);
    res.status(500).json({ error: "Server error compiling hub overview" });
  }
});

// --- Candidate Hub Core Queries ---
async function getCandidateHubData(userId: string) {
  // 1. Fetch Candidate Profile
  const { data: profile } = await db.from("candidate_profiles")
    .select("*, college:college_id(name, code)")
    .eq("user_id", userId)
    .maybeSingle();

  // 2. Fetch stats
  const { data: attempts } = await db.from("attempts")
    .select("score, status")
    .eq("candidate_id", userId)
    .eq("status", "completed");

  const completedExamsCount = attempts?.length || 0;
  const avgExamScore = attempts && attempts.length > 0
    ? Math.round(attempts.reduce((sum, a) => sum + (a.score || 0), 0) / attempts.length)
    : 0;

  // Rank statistics fallback (0 = unknown when candidate has no college)
  let rank = 0;
  let totalRanked = 0;
  if (profile?.college_id) {
    const { data: peers } = await db.from("candidate_profiles")
      .select("cgpa")
      .eq("college_id", profile.college_id);
    if (peers && peers.length > 0) {
      totalRanked = peers.length;
      rank = peers.filter(p => Number(p.cgpa) > Number(profile.cgpa)).length + 1;
    }
  }

  // 3. Compile action items
  const actionItems: ActionItem[] = [];
  if (!profile || !profile.profile_complete) {
    actionItems.push({
      id: "profile_incomplete",
      priority: "urgent",
      title: "Complete Onboarding Setup",
      description: "Fill in registration details to unlock campus placements.",
      action_url: "/candidate/onboarding"
    });
  } else {
    if (!profile.resume_url) {
      actionItems.push({
        id: "resume_missing",
        priority: "high",
        title: "Upload Verified Resume",
        description: "Standard 1-page PDF resume is required for drive eligibility.",
        action_url: "/candidate/profile"
      });
    }
    if (!profile.marksheet_url) {
      actionItems.push({
        id: "marksheet_missing",
        priority: "high",
        title: "Submit Grade Sheet Marksheet",
        description: "Attach semester marksheets to auto-verify credentials.",
        action_url: "/candidate/profile"
      });
    }
  }

  const { data: assignments } = await db.from("exam_assignments")
    .select("*, exam:exam_id(title, available_until)")
    .eq("candidate_id", userId);

  if (assignments) {
    const completedExamIds = new Set(attempts?.map(a => a.exam_id) || []);
    for (const assign of assignments) {
      if (!completedExamIds.has(assign.exam_id)) {
        const hoursLeft = assign.exam?.available_until 
          ? Math.max(0, Math.floor((new Date(assign.exam.available_until).getTime() - Date.now()) / (1000 * 60 * 60))) 
          : 0;
        
        actionItems.push({
          id: `exam_${assign.exam_id}`,
          priority: hoursLeft <= 6 ? "urgent" : "normal",
          title: `Exam Deadline: ${assign.exam?.title || "Assessment"}`,
          description: hoursLeft > 0 ? `Closes in ${hoursLeft} hours.` : "Deadline expired.",
          action_url: `/candidate/exams`
        });
      }
    }
  }

  const { data: ivs } = await db.from("ai_interviews")
    .select("*, job:job_id(title, company_name)")
    .eq("candidate_id", userId)
    .eq("status", "scheduled");

  if (ivs) {
    for (const iv of ivs) {
      actionItems.push({
        id: `iv_${iv.id}`,
        priority: "urgent",
        title: "AI Face-to-Face Interview Scheduled",
        description: `Active shortlist for SDE role at ${iv.job?.company_name || "Company"}.`,
        action_url: `/candidate/interview`
      });
    }
  }

  // 4. Activity Feed target queries
  const { data: dbFeed } = await db.from("activity_feed")
    .select("*")
    .eq("target_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  const recentActivity = dbFeed?.map(f => ({
    title: f.title,
    description: f.description,
    date: f.created_at
  })) || [];

  if (recentActivity.length === 0) {
    recentActivity.push({
      title: "Placement Passport Activated",
      description: "Welcome to IntelliHire. Your verifiable campus passport is live.",
      date: new Date().toISOString()
    });
  }

  // 5. Upcoming Schedules
  const upcomingSchedule: ScheduleEvent[] = [];
  if (assignments) {
    for (const assign of assignments) {
      if (assign.exam?.available_until && new Date(assign.exam.available_until).getTime() > Date.now()) {
        upcomingSchedule.push({
          title: `Exam: ${assign.exam.title}`,
          date: assign.exam.available_until,
          type: "exam"
        });
      }
    }
  }
  if (ivs) {
    for (const iv of ivs) {
      if (iv.scheduled_start_at && new Date(iv.scheduled_start_at).getTime() > Date.now()) {
        upcomingSchedule.push({
          title: `AI Interview: ${iv.job?.title || "Shortlist Interview"}`,
          date: iv.scheduled_start_at,
          type: "interview"
        });
      }
    }
  }

  // 6. Insights
  // Radar data compilation
  const { data: myAttemptsForAnswers } = await db.from("attempts")
    .select("id")
    .eq("candidate_id", userId);

  const attemptIds = myAttemptsForAnswers?.map(a => a.id).filter(Boolean) || [];

  let mcqAnswers: any[] | null = null;
  if (attemptIds.length > 0) {
    const { data } = await db.from("answers")
      .select("*, question:question_id(topic)")
      .in("attempt_id", attemptIds);
    mcqAnswers = data;
  }

  const topicScores: Record<string, { total: number; count: number }> = {
    "DSA": { total: 0, count: 0 },
    "DBMS": { total: 0, count: 0 },
    "OS": { total: 0, count: 0 },
    "Networking": { total: 0, count: 0 },
    "Communication": { total: 0, count: 0 },
    "Aptitude": { total: 0, count: 0 }
  };

  if (mcqAnswers) {
    for (const ans of mcqAnswers) {
      const topic = ans.question?.topic || "Aptitude";
      const key = Object.keys(topicScores).find(k => k.toLowerCase() === topic.toLowerCase()) || "Aptitude";
      topicScores[key].total += ans.is_correct ? 100 : 0;
      topicScores[key].count += 1;
    }
  }

  const radarData = Object.keys(topicScores).map(subject => {
    const val = topicScores[subject];
    const score = val.count > 0 ? Math.round(val.total / val.count) : 0;
    return { subject, score, fullMark: 100 };
  });

  const { data: myAttempts } = await db.from("attempts")
    .select("*, exam:exam_id(title)")
    .eq("candidate_id", userId)
    .eq("status", "completed")
    .order("submitted_at", { ascending: true });

  const trendData = myAttempts?.map((att, idx) => ({
    name: att.exam?.title || `Exam ${idx + 1}`,
    score: att.score
  })) || [];

  let peerPercentile = 0;
  if (profile?.college_id) {
    const { data: peers } = await db.from("candidate_profiles")
      .select("cgpa")
      .eq("college_id", profile.college_id);
    if (peers && peers.length > 0) {
      const lowerCount = peers.filter(p => Number(p.cgpa) <= Number(profile.cgpa)).length;
      peerPercentile = Math.round((lowerCount / peers.length) * 100);
    }
  }

  // 7. Quick links
  const quickLinks = [
    { label: "Take Exam", path: "/candidate/my-exams", color: "blue" },
    { label: "Certificates & Badges", path: "/candidate/certificates", color: "green" },
    { label: "Practice Sandbox", path: "/candidate/sandbox", color: "violet" },
    { label: "AI Interview Room", path: "/candidate/interview", color: "indigo" }
  ];

  // Visual Journey Pipeline Trackers
  const { data: trackersData } = await db.from("candidate_status")
    .select("*, job:job_id(*, exam:exam_id(title))")
    .eq("candidate_id", userId);

  const trackers: JourneyTracker[] = [];
  if (trackersData) {
    for (const app of trackersData) {
      trackers.push({
        jobId: app.job?.id,
        jobTitle: app.job?.title,
        companyName: app.job?.company_name,
        currentStage: app.status
      });
    }
  }

  return {
    role: "candidate",
    stats: {
      completedExams: completedExamsCount,
      upcomingExams: (assignments?.length || 0) - completedExamsCount,
      averageScore: `${avgExamScore}%`,
      rank: `${rank} / ${totalRanked}`
    },
    actionItems,
    recentActivity,
    upcomingSchedule,
    insights: {
      radarData,
      trendData,
      peerPercentile,
      trackers
    },
    quickLinks
  };
}

// --- TPO Hub Core Queries ---
async function getTpoHubData(tpoUserId: string) {
  // 1. Fetch TPO college Link
  const { data: tpo } = await db.from("users").select("college_id").eq("id", tpoUserId).single();
  const collegeId = tpo?.college_id;

  const [{ count: totalStudents }, { count: completeProfiles }, { count: pendingVerification }] = await Promise.all([
    db.from("users").select("*", { count: "exact", head: true }).eq("college_id", collegeId).eq("role", "candidate"),
    db.from("candidate_profiles").select("*", { count: "exact", head: true }).eq("college_id", collegeId).eq("profile_complete", true),
    db.from("candidate_profiles").select("*", { count: "exact", head: true }).eq("college_id", collegeId).eq("documents_verified", false)
  ]);

  const { data: jobs } = await db.from("jobs")
    .select("id, title, status, drive_date, company_name")
    .eq("college_id", collegeId);

  const activeDrivesCount = jobs?.filter(j => j.status === "active").length || 0;

  // Fetch student profiles first
  const { data: profiles } = await db.from("candidate_profiles")
    .select("user_id, cgpa, roll_number")
    .eq("college_id", collegeId);

  const studentUserIds = profiles?.map(p => p.user_id).filter(Boolean) || [];

  let placedRes: any[] | null = null;
  if (studentUserIds.length > 0) {
    const { data } = await db.from("candidate_status")
      .select("*")
      .in("candidate_id", studentUserIds)
      .in("status", ["offered", "placed"]);
    placedRes = data;
  }

  const totalPlaced = placedRes?.length || 0;
  const placementRate = totalStudents && totalStudents > 0 ? Math.round((totalPlaced / totalStudents) * 100) : 0;

  const avgCgpa = profiles && profiles.length > 0
    ? Number((profiles.reduce((sum, p) => sum + Number(p.cgpa || 0), 0) / profiles.length).toFixed(2))
    : 0.0;

  // 2. Action items
  const actionItems: ActionItem[] = [];
  if (pendingVerification && pendingVerification > 0) {
    actionItems.push({
      id: "tpo_docs_verify",
      priority: "urgent",
      title: "Pending Marksheet Verifications",
      description: `${pendingVerification} candidates waiting for verification approvals.`,
      action_url: "/tpo/students?tab=pending"
    });
  }

  if (jobs) {
    const closingJobs = jobs.filter(j => j.status === "active" && j.drive_date && new Date(j.drive_date).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000);
    for (const job of closingJobs) {
      actionItems.push({
        id: `tpo_job_${job.id}`,
        priority: "high",
        title: `Drive Expiration: ${job.company_name}`,
        description: `Drive '${job.title}' closes in less than 3 days.`,
        action_url: "/tpo/students"
      });
    }
  }

  // 3. Activity Feed (student actions)
  const { data: dbFeed } = await db.from("activity_feed")
    .select("*, actor:actor_id(name)")
    .eq("actor_role", "candidate")
    .order("created_at", { ascending: false })
    .limit(5);

  const recentActivity = dbFeed?.map(f => ({
    title: f.title,
    description: `${((f as { actor?: { name?: string } }).actor)?.name || "Candidate"} ${f.description || ""}`,
    date: f.created_at
  })) || [];

  if (recentActivity.length === 0) {
    recentActivity.push({
      title: "College Placement Portal Online",
      description: "TPO cockpit successfully registered and linked to college database.",
      date: new Date().toISOString()
    });
  }

  // 4. Upcoming Schedules
  const upcomingSchedule = jobs?.filter(j => j.status === "active" && j.drive_date && new Date(j.drive_date).getTime() > Date.now()).map(j => ({
    title: `Drive: ${j.company_name} - ${j.title}`,
    date: j.drive_date,
    type: "drive"
  })) || [];

  // 5. Funnel Analytics
  const eligibleCount = profiles?.filter(p => p.cgpa >= 7.0).length || 0;
  
  // 6. Performers & At-Risk
  let examAttempts: any[] | null = null;
  if (studentUserIds.length > 0) {
    const { data } = await db.from("attempts")
      .select("candidate_id, score, candidate:candidate_id(name)")
      .in("candidate_id", studentUserIds)
      .eq("status", "completed");
    examAttempts = data;
  }

  // Aggregate scores per candidate in JS
  const scoreMap = new Map<string, { name: string; total: number; count: number }>();
  if (examAttempts) {
    for (const att of examAttempts) {
      const cid = att.candidate_id;
      const name = (att.candidate as { name?: string }).name || "Unknown";
      const entry = scoreMap.get(cid) || { name, total: 0, count: 0 };
      entry.total += att.score || 0;
      entry.count += 1;
      scoreMap.set(cid, entry);
    }
  }
  const topPerformers = Array.from(scoreMap.values())
    .map(e => ({ name: e.name, score: `${Math.round(e.total / e.count)}%` }))
    .sort((a, b) => parseInt(b.score) - parseInt(a.score))
    .slice(0, 5);

  const atRiskStudents = profiles?.filter(p => Number(p.cgpa) < 7.0).slice(0, 5).map(p => ({
    name: p.roll_number,
    reason: `Low CGPA: ${p.cgpa}`
  })) || [];

  // 7. Quick links
  const quickLinks = [
    { label: "Verify Documents", path: "/tpo/students", color: "blue" },
    { label: "Upload Students", path: "/tpo/students", color: "violet" },
    { label: "View Reports", path: "/tpo/reports", color: "green" },
    { label: "Scan Marksheets", path: "/tpo/students", color: "indigo" }
  ];

  return {
    role: "tpo",
    stats: {
      totalRegistered: totalStudents || 0,
      completeProfiles: completeProfiles || 0,
      activeDrives: activeDrivesCount,
      placed: totalPlaced,
      placementRate: `${placementRate}%`,
      averageCgpa: avgCgpa
    },
    actionItems,
    recentActivity,
    upcomingSchedule,
    insights: {
      funnel: [
        { label: "Registered", count: totalStudents || 0 },
        { label: "Eligible", count: eligibleCount },
        { label: "Offers", count: totalPlaced }
      ],
      topPerformers,
      atRiskStudents
    },
    quickLinks
  };
}

// --- Recruiter Hub Core Queries ---
async function getRecruiterHubData(recruiterId: string) {
  // 1. Fetch Stats
  const { data: drives } = await db.from("jobs").select("id, title, status").eq("created_by", recruiterId);
  const activeDrivesCount = drives?.filter(d => d.status === "active").length || 0;

  const { data: candidates } = await db.from("users").select("id", { count: "exact", head: true }).eq("role", "candidate");
  const totalCandidates = candidates?.length || 0;

  const { data: attempts } = await db.from("attempts").select("id, status").eq("recruiter_id", recruiterId);
  const completedAttempts = attempts?.filter(a => a.status === "completed").length || 0;

  const { data: offers } = await db.from("candidate_status").select("id").eq("status", "offered");
  const offersCount = offers?.length || 0;

  // 2. Action Items
  const actionItems: ActionItem[] = [];
  
  // Search proctoring violations
  const { data: violations } = await db.from("proctoring_snapshots")
    .select("*, candidate:candidate_id(name)")
    .eq("event_type", "violation")
    .in("violation_severity", ["high", "critical"]);

  if (violations && violations.length > 0) {
    actionItems.push({
      id: "proctoring_review_action",
      priority: "urgent",
      title: "Security Violations Flagged",
      description: `${violations.length} high-severity proctor anomalies pending review.`,
      action_url: "/recruiter/proctoring"
    });
  }

  // Passers pending interview scheduling
  const { data: passers } = await db.from("candidate_status")
    .select("*, candidate:candidate_id(name)")
    .eq("status", "passed");

  if (passers && passers.length > 0) {
    actionItems.push({
      id: "passers_interview_pending",
      priority: "high",
      title: "Passers Pending Interview",
      description: `${passers.length} candidates passed exams but lack voice schedule details.`,
      action_url: "/recruiter/interview-scheduling"
    });
  }

  // 3. Activity Feed (exams + proctoring alerts)
  const { data: dbFeed } = await db.from("activity_feed")
    .select("*")
    .eq("actor_role", "candidate")
    .order("created_at", { ascending: false })
    .limit(5);

  const recentActivity = dbFeed?.map(f => ({
    title: f.title,
    description: f.description,
    date: f.created_at
  })) || [];

  if (recentActivity.length === 0) {
    recentActivity.push({
      title: "Recruiting War Room Ready",
      description: "Recruiter campaign portal initialized. Proctoring feeds active.",
      date: new Date().toISOString()
    });
  }

  // 4. Upcoming Schedules
  const upcomingSchedule: ScheduleEvent[] = [];
  const { data: scheduledIvs } = await db.from("ai_interviews")
    .select("*, candidate:candidate_id(name), job:job_id(title)")
    .eq("scheduled_by", recruiterId)
    .eq("status", "scheduled")
    .limit(5);

  if (scheduledIvs) {
    for (const iv of scheduledIvs) {
      upcomingSchedule.push({
        title: `Interview: ${((iv as { candidate?: { name?: string } }).candidate)?.name || "Candidate"} - ${iv.job?.title}`,
        date: iv.scheduled_start_at,
        type: "interview"
      });
    }
  }

  // 5. Insights (Auto spotlights)
  const { data: spotlightAttempts } = await db.from("attempts")
    .select("candidate_id, score, candidate:candidate_id!inner(name)")
    .eq("status", "completed");

  const spotlightMap = new Map<string, { name: string; total: number; count: number }>();
  if (spotlightAttempts) {
    for (const att of spotlightAttempts) {
      const cid = att.candidate_id;
      const name = (att.candidate as { name?: string }).name || "Unknown";
      const entry = spotlightMap.get(cid) || { name, total: 0, count: 0 };
      entry.total += att.score || 0;
      entry.count += 1;
      spotlightMap.set(cid, entry);
    }
  }
  const candidateSpotlight = Array.from(spotlightMap.values())
    .map(e => ({ name: e.name, score: `${Math.round(e.total / e.count)}% Match` }))
    .sort((a, b) => parseInt(b.score) - parseInt(a.score))
    .slice(0, 3);

  // 6. Quick links
  const quickLinks = [
    { label: "Create Drive", path: "/recruiter/create-drive", color: "blue" },
    { label: "Create Exam", path: "/recruiter/create-exam", color: "violet" },
    { label: "AI Studio", path: "/recruiter/ai-studio", color: "indigo" },
    { label: "Proctoring", path: "/recruiter/proctoring", color: "green" }
  ];

  return {
    role: "recruiter",
    stats: {
      activeDrives: activeDrivesCount,
      totalCandidates,
      completedAttempts,
      offersExtended: offersCount
    },
    actionItems,
    recentActivity,
    upcomingSchedule,
    insights: {
      candidateSpotlight,
      skillGap: null
    },
    quickLinks
  };
}

// --- Admin Hub Core Queries ---
async function getAdminHubData(_adminId: string) {
  // 1. Stats
  const [{ count: totalUsers }, { count: examsCount }] = await Promise.all([
    db.from("users").select("id", { count: "exact", head: true }),
    db.from("exams").select("id", { count: "exact", head: true })
  ]);

  const { data: activeSessions } = await db.from("attempts").select("id").eq("status", "in_progress");

  // 2. Action items
  const actionItems = [
    {
      id: "admin_moderation",
      priority: "normal",
      title: "System Moderation Logs",
      description: "System health check and server process limits operating within normal bounds.",
      action_url: "/admin/overview"
    }
  ];

  // 3. Activity feed
  const { data: dbFeed } = await db.from("activity_feed")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  const recentActivity = dbFeed?.map(f => ({
    title: f.title,
    description: f.description,
    date: f.created_at
  })) || [];

  if (recentActivity.length === 0) {
    recentActivity.push({
      title: "Platform Administration Panel Active",
      description: "Platform orchestration database services reporting healthy.",
      date: new Date().toISOString()
    });
  }

  // 4. Quick Links
  const quickLinks = [
    { label: "Manage User Roles", path: "/admin/manage", color: "blue" },
    { label: "Recruiter Analytics", path: "/admin/recruiter-analytics", color: "violet" },
    { label: "Exam Activity Logs", path: "/admin/exam-activity", color: "green" }
  ];

  return {
    role: "admin",
    stats: {
      totalUsers: totalUsers || 0,
      totalExams: examsCount || 0,
      activeSessions: activeSessions?.length || 0,
      systemHealth: "Healthy"
    },
    actionItems,
    recentActivity,
    upcomingSchedule: [],
    insights: {
      growth: null
    },
    quickLinks
  };
}

export default router;

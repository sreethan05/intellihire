import { useEffect, useState } from "react";
import { Award, BarChart3, Bell, CalendarDays, CheckCircle, Lock, Trophy, Video } from "lucide-react";
import { Link } from "react-router-dom";
import { candidateApi, interviewApi } from "@/lib/api";
import { MetricCard } from "@/components/dashboard/DashboardKit";
import type { DashboardStats } from "@/types";

export default function CandidateDashboard() {
  const [stats, setStats] = useState<DashboardStats>({});
  const [pendingInterview, setPendingInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      candidateApi.getDashboard(),
      interviewApi.pending(),
    ])
      .then(([dashRes, pendingRes]) => {
        setStats(dashRes.data.stats || {});
        setPendingInterview(pendingRes.data.interview || null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="grid grid-cols-1 gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-24 animate-pulse rounded-lg bg-slate-200" />)}</div>;
  }

  const hasQualifiedExam = (stats.passCount || 0) > 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-slate-950">Overview</h2>
        <p className="mt-1 text-sm text-slate-500">Your exam schedule, qualification status, and interview readiness.</p>
      </div>

      {/* Pending Interview Banner */}
      {pendingInterview && (
        <Link
          to="/candidate/interview"
          className="flex items-center gap-4 rounded-lg border border-blue-300 bg-blue-600 px-5 py-4 text-white shadow-lg transition hover:bg-blue-700"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Bell className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="font-bold">AI Interview Ready — You've Been Shortlisted! 🎉</div>
            <div className="mt-0.5 text-sm text-blue-100">
              {pendingInterview.job?.company_name
                ? `${pendingInterview.job.title} at ${pendingInterview.job.company_name}`
                : pendingInterview.exam?.title
                ? `Based on: ${pendingInterview.exam.title}`
                : "Your AI interview is waiting. Click to begin."}
            </div>
          </div>
          <div className="shrink-0 rounded-md bg-white px-4 py-2 text-sm font-bold text-blue-700">
            Start Interview →
          </div>
        </Link>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Upcoming Exams" value={stats.pending || 0} icon={CalendarDays} tone="violet" />
        <MetricCard title="Completed Exams" value={stats.completed || 0} icon={CheckCircle} tone="green" />
        <MetricCard title="Average Score" value={`${stats.averagePercentage || 0}%`} icon={BarChart3} tone="blue" />
        <MetricCard title="Rank" value={`${stats.rank || 0} / ${stats.totalRanked || 0}`} icon={Trophy} tone="amber" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/candidate/interview" className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:bg-blue-50">
          <div>
            <div className="font-bold text-slate-950">
              {pendingInterview ? "AI Interview Pending" : hasQualifiedExam ? "Attempt AI Interview" : "AI Interview Locked"}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {pendingInterview
                ? "You have been shortlisted. Your AI interview is ready."
                : hasQualifiedExam
                ? "Start the on-spot face-to-face AI interview unlocked by your exam result."
                : "Pass an assigned exam to unlock the on-spot face-to-face AI interview."}
            </div>
          </div>
          {pendingInterview || hasQualifiedExam
            ? <Video className="h-5 w-5 text-blue-600" />
            : <Lock className="h-5 w-5 text-amber-600" />}
        </Link>
        <Link to="/candidate/certificates" className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:bg-blue-50">
          <div>
            <div className="font-bold text-slate-950">Certificates &amp; Badges</div>
            <div className="mt-1 text-sm text-slate-500">View earned placement credentials.</div>
          </div>
          <Award className="h-5 w-5 text-blue-600" />
        </Link>
      </div>
    </div>
  );
}

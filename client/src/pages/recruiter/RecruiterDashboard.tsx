import { useEffect, useState } from "react";
import {
  Bot,
  Briefcase,
  ShieldAlert,
  Target,
  UserCheck,
  Users,
  Landmark,
  Award,
} from "lucide-react";
import { Link } from "react-router-dom";
import { recruiterApi } from "@/lib/api";
import { useCollege } from "@/context/CollegeContext";
import { MetricCard } from "@/components/dashboard/DashboardKit";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function RecruiterDashboard() {
  const { selectedCollegeId, setSelectedCollegeId, collegesSummary } = useCollege();
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    recruiterApi.getDashboard(selectedCollegeId)
      .then(({ data }) => setStats(data || {}))
      .catch((e) => console.error("Failed to load dashboard data", e))
      .finally(() => setLoading(false));
  }, [selectedCollegeId]);

  const activeCollege = collegesSummary.find((c) => c.id === selectedCollegeId);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="h-80 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-80 animate-pulse rounded-lg bg-slate-200" />
        </div>
      </div>
    );
  }

  const dashboardStats = stats.stats || {};
  const funnelData = stats.funnel || [];
  const driveAnalytics = stats.driveAnalytics || [];
  const candidatePerformance = stats.candidatePerformance || [];

  return (
    <div className="space-y-6">
      {/* Dynamic Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {selectedCollegeId ? (
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <Landmark className="h-5 w-5 text-violet-600 animate-pulse" />
                {activeCollege?.name} Drive Console
              </h1>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Campus recruitment metrics filtered for {activeCollege?.name} ({activeCollege?.code}).
              </p>
            </div>
          ) : (
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <Landmark className="h-5 w-5 text-violet-600 animate-pulse" />
                All Campuses Drive Console
              </h1>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Aggregated campus placement outcomes, totals, and hiring trends across all locations.
              </p>
            </div>
          )}
        </div>

        {selectedCollegeId && (
          <button
            onClick={() => setSelectedCollegeId(null)}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-100 px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
          >
            Clear Campus Filter
          </button>
        )}
      </div>

      {/* Aggregated Overview Grid cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Candidates" value={dashboardStats.candidates || 0} icon={Users} tone="blue" />
        <MetricCard title="Job Drives" value={dashboardStats.drives || 0} icon={Briefcase} tone="cyan" />
        <MetricCard title="Assignments" value={dashboardStats.assignments || 0} icon={Target} tone="amber" />
        <MetricCard title="Offers" value={dashboardStats.offers || 0} icon={UserCheck} tone="green" />
      </div>

      {/* Quick Links Section */}
      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/recruiter/ai-studio" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:bg-violet-50/20">
          <div>
            <div className="font-bold text-slate-900">AI Studio</div>
            <div className="mt-1 text-xs text-slate-500">Generate MCQs, coding drafts, and custom AI templates.</div>
          </div>
          <Bot className="h-5 w-5 text-violet-600" />
        </Link>
        <Link to="/recruiter/proctoring" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:bg-violet-50/20">
          <div>
            <div className="font-bold text-slate-900">Proctoring Review</div>
            <div className="mt-1 text-xs text-slate-500">Inspect camera snap warnings and examine session logs.</div>
          </div>
          <ShieldAlert className="h-5 w-5 text-violet-600" />
        </Link>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Funnel chart card */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-800 mb-4">Hiring Funnel</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} margin={{ left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="value" name="Candidates Count" fill="#4f46e5" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Drive analytics card */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm flex flex-col justify-between bg-white">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 mb-4">Drives Engagement</h3>
            <div className="space-y-4">
              {driveAnalytics.map((drive: any) => (
                <div key={drive.driveId} className="border border-slate-100 rounded-xl p-3.5 bg-slate-50/50">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-800">{drive.company} - {drive.label}</span>
                    <span className="text-slate-500">{drive.completed} / {drive.assigned} Attempts</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-violet-600 rounded-full"
                      style={{ width: `${drive.assigned ? (drive.completed / drive.assigned) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
              {driveAnalytics.length === 0 && (
                <div className="text-xs text-slate-400 text-center py-6">No drive stats available.</div>
              )}
            </div>
          </div>
        </div>

        {/* Best Performers List */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm md:col-span-2 bg-white">
          <h3 className="text-sm font-extrabold text-slate-800 mb-4 flex items-center gap-1.5">
            <Award className="h-4.5 w-4.5 text-yellow-500" />
            Top Candidate Performers
          </h3>
          <div className="overflow-hidden rounded-xl border border-slate-100">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 uppercase font-black tracking-wider">
                  <th className="p-3">Candidate</th>
                  <th className="p-3">Attempts Count</th>
                  <th className="p-3">Avg score %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidatePerformance.map((candidate: any) => (
                  <tr key={candidate.candidateId} className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold text-slate-800">
                      <div>{candidate.name}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{candidate.email}</div>
                    </td>
                    <td className="p-3 text-slate-600 font-semibold">{candidate.completedAttempts} attempts</td>
                    <td className="p-3 font-black text-violet-600">{candidate.averageScore}%</td>
                  </tr>
                ))}
                {candidatePerformance.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-slate-400">No candidate metrics found yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

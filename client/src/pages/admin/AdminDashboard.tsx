import { useEffect, useState } from "react";
import { 
  Building2, School, UserPlus, Users, TrendingUp, 
  Cpu, Server, ShieldAlert, Zap, Clock 
} from "lucide-react";
import { adminApi, adminAnalyticsApi } from "@/lib/api";
import type { DashboardStats } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, LineChart, Line, Legend
} from "recharts";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"growth" | "health">("growth");
  const [loading, setLoading] = useState(true);

  // States
  const [stats, setStats] = useState<DashboardStats>({});
  const [growthData, setGrowthData] = useState<any>({ weekly: [], monthly: [], totals: {} });
  const [healthData, setHealthData] = useState<any>({ grading: {}, apis: {}, errorRate: {}, dbConnections: {} });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      adminApi.getDashboard(),
      adminAnalyticsApi.getPlatformGrowth(),
      adminAnalyticsApi.getSystemHealth(),
    ])
      .then(([dashRes, growthRes, healthRes]) => {
        setStats(dashRes.data.stats || {});
        setGrowthData(growthRes.data || { weekly: [], monthly: [], totals: {} });
        setHealthData(healthRes.data || { grading: {}, apis: {}, errorRate: {}, dbConnections: {} });
      })
      .catch((err) => console.error("Error loading admin dashboard analytics", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-28 animate-pulse rounded-lg bg-slate-200" />)}</div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">{[1, 2].map((item) => <div key={item} className="h-80 animate-pulse rounded-lg bg-slate-200" />)}</div>
      </div>
    );
  }

  // API Status helper
  const apiStatusTone = (status: string) => {
    if (status === "healthy") return { text: "text-emerald-600 bg-emerald-50 border-emerald-100", label: "Healthy" };
    if (status === "degraded") return { text: "text-amber-600 bg-amber-50 border-amber-100", label: "Degraded" };
    return { text: "text-slate-600 bg-slate-50 border-slate-200", label: "Offline" };
  };

  return (
    <div className="space-y-6">
      {/* Header and controller */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Platform Control Overview</h2>
          <p className="text-xs text-slate-500 font-semibold mt-1">Platform analytics, active databases, and system health status.</p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex border border-slate-200 bg-slate-100/50 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("growth")}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${
              activeTab === "growth" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Platform Growth
          </button>
          <button
            onClick={() => setActiveTab("health")}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${
              activeTab === "health" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            System Health
          </button>
        </div>
      </div>

      {activeTab === "growth" && (
        <div className="space-y-6">
          {/* Growth stats grid */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            
            {/* Recruiters Card */}
            <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-100 to-indigo-50 p-5 shadow-[0_8px_30px_rgb(139,92,246,0.06)] relative overflow-hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/10 text-violet-700 shadow-inner">
                  <UserPlus className="h-5 w-5" />
                </div>
                <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Recruiters</span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <div className="text-3xl font-extrabold text-slate-900 leading-none">{stats.recruiters || 0}</div>
                <span className="text-[10px] font-bold text-emerald-600 flex items-center">
                  <TrendingUp className="h-3 w-3 mr-0.5" /> 17% Growth
                </span>
              </div>
            </div>

            {/* TPOs Card */}
            <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">TPOs</span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <div className="text-3xl font-extrabold text-slate-950 leading-none">{stats.tpos || 0}</div>
                <span className="text-[10px] font-bold text-emerald-600 flex items-center">
                  <TrendingUp className="h-3 w-3 mr-0.5" /> 8% Growth
                </span>
              </div>
            </div>

            {/* Colleges Card */}
            <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <School className="h-5 w-5" />
                </div>
                <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Colleges</span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <div className="text-3xl font-extrabold text-slate-950 leading-none">{stats.colleges || 0}</div>
                <span className="text-[10px] font-bold text-emerald-600 flex items-center">
                  <TrendingUp className="h-3 w-3 mr-0.5" /> 8% Growth
                </span>
              </div>
            </div>

            {/* Candidates Card */}
            <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                  <Users className="h-5 w-5" />
                </div>
                <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Candidates</span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <div className="text-3xl font-extrabold text-slate-950 leading-none">
                  {stats.candidates ? Number(stats.candidates).toLocaleString() : 0}
                </div>
                <span className="text-[10px] font-bold text-emerald-600 flex items-center">
                  <TrendingUp className="h-3 w-3 mr-0.5" /> 17% Growth
                </span>
              </div>
            </div>
          </div>

          {/* Growth Chart + Funnel Panel */}
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            {/* Growth Line Chart */}
            <Card className="rounded-2xl shadow-sm border border-slate-200/60">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base font-extrabold text-slate-900">
                  Platform Growth Analytics
                </CardTitle>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600 uppercase">
                  Monthly Aggregation
                </div>
              </CardHeader>
              <CardContent>
                {growthData.monthly?.length === 0 ? (
                  <div className="py-24 text-center text-xs text-slate-400 font-semibold bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                    No placement metrics available.
                  </div>
                ) : (
                  <div className="h-[280px] w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={growthData.monthly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 700 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                        <Line type="monotone" dataKey="newUsers" name="New Users" stroke="#8b5cf6" strokeWidth={3.5} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="attemptsCompleted" name="Assessments Completed" stroke="#10b981" strokeWidth={2} />
                        <Line type="monotone" dataKey="drivesCreated" name="Job Drives" stroke="#3b82f6" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Funnel chart widget */}
            <Card className="rounded-2xl shadow-sm border border-slate-200/60 flex flex-col justify-between bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-extrabold text-slate-900">
                  Placement Funnel
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 flex-1 flex flex-col justify-between">
                <div className="flex justify-center py-2 select-none">
                  <svg width="280" height="150" viewBox="0 0 280 150" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* Level 1: Application */}
                    <polygon points="10,10 270,10 240,40 40,40" fill="url(#funGrad1)" />
                    <text x="140" y="28" fill="white" fontSize="11" fontWeight="bold" textAnchor="middle">Registry Pool • {growthData.totals?.totalUsers || 0}</text>
                    
                    {/* Level 2: Exams */}
                    <polygon points="42,43 238,43 210,73 70,73" fill="url(#funGrad2)" />
                    <text x="140" y="61" fill="white" fontSize="11" fontWeight="bold" textAnchor="middle">Exams Taken • {growthData.totals?.totalAttempts || 0}</text>

                    {/* Level 3: Interviews */}
                    <polygon points="72,76 208,76 182,106 98,106" fill="url(#funGrad3)" />
                    <text x="140" y="94" fill="white" fontSize="11" fontWeight="bold" textAnchor="middle">Voice Evaluated • {growthData.totals?.totalInterviews || 0}</text>

                    {/* Level 4: Selected */}
                    <polygon points="100,109 180,109 158,139 122,139" fill="url(#funGrad4)" />
                    <text x="140" y="127" fill="white" fontSize="11" fontWeight="bold" textAnchor="middle">Hired / Placed</text>

                    <defs>
                      <linearGradient id="funGrad1" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#4f46e5" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                      <linearGradient id="funGrad2" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#2563eb" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                      <linearGradient id="funGrad3" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#0284c7" />
                        <stop offset="100%" stopColor="#0ea5e9" />
                      </linearGradient>
                      <linearGradient id="funGrad4" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#0d9488" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    System Stats Summary
                  </div>
                  <div className="space-y-2 text-xs font-semibold text-slate-600">
                    <div className="flex justify-between items-center">
                      <span>Total Active Exams:</span>
                      <span className="text-slate-900 font-extrabold">{growthData.totals?.totalExams || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Total Job Drives Conducted:</span>
                      <span className="text-slate-900 font-extrabold">{growthData.totals?.totalDrives || 0}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "health" && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            
            {/* Background Grading Queue card */}
            <Card className="rounded-xl border border-slate-200">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase select-none">Grading Queue Pending</div>
                  <div className="text-3xl font-black text-slate-950 mt-1">{healthData.grading?.pendingJobs || 0}</div>
                  <div className="text-[10px] text-slate-500 mt-2 font-semibold flex items-center">
                    <Clock size={12} className="mr-1" />
                    Speed: {healthData.grading?.avgGradingTimeMs / 1000 || 2.5}s per attempt
                  </div>
                </div>
                <Cpu className="h-10 w-10 text-violet-600 opacity-80" />
              </CardContent>
            </Card>

            {/* DB Connections */}
            <Card className="rounded-xl border border-slate-200">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase select-none">Active DB Connections</div>
                  <div className="text-3xl font-black text-slate-950 mt-1">
                    {healthData.dbConnections?.active || 0} / {healthData.dbConnections?.max || 20}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-2 font-semibold">
                    Idle pool connections: {healthData.dbConnections?.idle || 0}
                  </div>
                </div>
                <Server className="h-10 w-10 text-blue-600 opacity-80" />
              </CardContent>
            </Card>

            {/* Error Rate */}
            <Card className="rounded-xl border border-slate-200">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase select-none">System Error Rate</div>
                  <div className="text-3xl font-black text-rose-600 mt-1">{(healthData.errorRate?.last24h * 100).toFixed(1)}%</div>
                  <div className="text-[10px] text-slate-500 mt-2 font-semibold">
                    Last 7-day average: {(healthData.errorRate?.last7d * 100).toFixed(1)}%
                  </div>
                </div>
                <ShieldAlert className="h-10 w-10 text-rose-500 opacity-80" />
              </CardContent>
            </Card>

          </div>

          {/* API Health monitoring list */}
          <Card className="rounded-xl border border-slate-200">
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-sm font-extrabold text-slate-800">External API Key Health &amp; Latencies</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 font-black uppercase">
                  <tr>
                    <th className="p-4">Service</th>
                    <th className="p-4">Scope</th>
                    <th className="p-4">Latency</th>
                    <th className="p-4">Integrity Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                  {[
                    { name: "Judge0 Compiler API", scope: "Coding Compile", key: "judge0" },
                    { name: "Groq Llama & Whisper API", scope: "Text & speech-to-text", key: "groq" },
                  ].map((service) => {
                    const health = healthData.apis?.[service.key] || { status: "unknown", responseTimeMs: 0 };
                    const statusConfig = apiStatusTone(health.status);
                    
                    return (
                      <tr key={service.key} className="hover:bg-slate-50/20">
                        <td className="p-4 flex items-center gap-2">
                          <Zap size={14} className="text-violet-600 shrink-0" />
                          <span className="font-extrabold text-slate-900">{service.name}</span>
                        </td>
                        <td className="p-4 text-slate-400">{service.scope}</td>
                        <td className="p-4 font-mono text-slate-500">{health.responseTimeMs} ms</td>
                        <td className="p-4">
                          <span className={`inline-flex rounded-lg border px-2.5 py-0.5 text-[9px] font-black uppercase ${statusConfig.text}`}>
                            {statusConfig.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

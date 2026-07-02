import { useEffect, useState } from "react";
import { 
  Briefcase, FileCheck, GraduationCap, 
  Percent, TrendingUp, AlertTriangle, ArrowRight, Loader2, Award 
} from "lucide-react";
import { tpoApi } from "@/lib/api";
import { MetricCard } from "@/components/dashboard/DashboardKit";
import { Link } from "react-router-dom";

export default function TpoDashboard() {
  const [stats, setStats] = useState<any>({});
  const [summary, setSummary] = useState<any>(null);
  const [college, setCollege] = useState<{ name?: string; code?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      tpoApi.getDashboard(),
      tpoApi.getDashboardSummary()
    ])
      .then(([dashRes, summaryRes]) => {
        setStats(dashRes.data.stats || {});
        setCollege(dashRes.data.college || null);
        setSummary(summaryRes.data.summary || null);
      })
      .catch(err => console.error("TPO dashboard fetch error:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-2 text-sm text-slate-500 font-medium">Loading TPO Command Center...</p>
        </div>
      </div>
    );
  }

  // Define Funnel Steps
  const registeredCount = stats.students || 0;
  const completeCount = stats.profileComplete || 0;
  const verifiedCount = registeredCount - (stats.pendingVerification || 0);
  const placedCount = stats.placed || 0;

  const funnelSteps = [
    { label: "Registered Candidates", count: registeredCount, pct: 100, color: "bg-slate-200" },
    { label: "Profiles Complete", count: completeCount, pct: registeredCount ? Math.round((completeCount / registeredCount) * 100) : 0, color: "bg-blue-200" },
    { label: "Verified & Ready", count: verifiedCount, pct: registeredCount ? Math.round((verifiedCount / registeredCount) * 100) : 0, color: "bg-indigo-200" },
    { label: "Placed / Offered", count: placedCount, pct: registeredCount ? Math.round((placedCount / registeredCount) * 100) : 0, color: "bg-green-200" }
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Title Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900">TPO Command Center</h1>
        <p className="text-sm text-slate-500">
          Managing {college?.name || "College"}{college?.code ? ` (${college.code})` : ""} - Placement verification, student analytics, and drive pipeline monitoring.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Students" value={stats.students} icon={GraduationCap} tone="blue" />
        <MetricCard title="Verify Docs" value={stats.pendingVerification} icon={FileCheck} tone="amber" />
        <MetricCard title="Active Drives" value={stats.activeDrives} icon={Briefcase} tone="violet" />
        <MetricCard title="Placed" value={stats.placed} icon={Award} tone="green" />
      </div>

      {/* TPO Action Items & Funnel Analytics */}
      <div className="grid gap-6 lg:grid-cols-3">
        
        {/* TPO Actions List */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-slate-950 flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Pending Admin Tasks
            </h2>
            
            <div className="space-y-3">
              {summary?.actionItems && summary.actionItems.length > 0 ? (
                summary.actionItems.map((item: any, idx: number) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center rounded-lg border border-slate-100 p-3 bg-slate-50/50 hover:bg-slate-50 transition">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{item.title}</h4>
                      <p className="text-xs text-slate-500 mt-1">{item.description}</p>
                    </div>
                    {item.action_url && (
                      <Link
                        to={item.action_url}
                        className="rounded-lg bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-xs font-bold text-white shadow flex items-center gap-1 shrink-0 self-end sm:self-auto"
                      >
                        Action <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm">
                  No pending student profile tasks or urgent verification alerts!
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-6 border-t border-slate-100 pt-4 flex gap-4 justify-between items-center text-xs text-slate-400 font-bold uppercase tracking-wider">
            <span>Verified Student Base: {verifiedCount} / {registeredCount}</span>
            <Link to="/tpo/students" className="text-blue-600 hover:text-blue-700 underline font-bold">Manage Directory &rarr;</Link>
          </div>
        </div>

        {/* Funnel Widget */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-extrabold text-slate-950 flex items-center gap-2 border-b border-slate-100 pb-2">
            <Percent className="h-4 w-4 text-blue-600" /> Placement Funnel
          </h2>
          
          <div className="space-y-4">
            {funnelSteps.map((step, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-slate-700">{step.label}</span>
                  <span className="text-slate-900">{step.count} ({step.pct}%)</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full ${step.color} rounded-full`} style={{ width: `${step.pct}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Secondary Metrics Card Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Overall Placement Rate</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{summary?.placementRate || 0}%</div>
            <p className="text-xs text-slate-500 mt-1">Shortlisted and accepted offers compared to total registered student base.</p>
          </div>
          <TrendingUp className="h-8 w-8 text-green-500 shrink-0" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Average College CGPA</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{stats.averageCgpa || 0}</div>
            <p className="text-xs text-slate-500 mt-1">Average CGPA of all registered student profiles in the system.</p>
          </div>
          <GraduationCap className="h-8 w-8 text-blue-500 shrink-0" />
        </div>
      </div>
    </div>
  );
}

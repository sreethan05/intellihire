import { useEffect, useState } from "react";
import { BarChart3, Briefcase, CheckCircle, FileCheck, GraduationCap, Percent, TrendingUp } from "lucide-react";
import { tpoApi } from "@/lib/api";
import { MetricCard } from "@/components/dashboard/DashboardKit";

type TpoStats = {
  students: number;
  profileComplete: number;
  pendingVerification: number;
  activeDrives: number;
  placed: number;
  placementRate: number;
  averageCgpa: number;
  averageAttemptPercentage: number;
};

const emptyStats: TpoStats = {
  students: 0,
  profileComplete: 0,
  pendingVerification: 0,
  activeDrives: 0,
  placed: 0,
  placementRate: 0,
  averageCgpa: 0,
  averageAttemptPercentage: 0,
};

export default function TpoDashboard() {
  const [stats, setStats] = useState<TpoStats>(emptyStats);
  const [college, setCollege] = useState<{ name?: string; code?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tpoApi.getDashboard()
      .then(({ data }) => {
        setStats(data.stats || emptyStats);
        setCollege(data.college || null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-24 animate-pulse rounded-lg bg-slate-200" />)}</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-slate-950">Overview</h2>
        <p className="mt-1 text-sm text-slate-500">{college?.name || "College"}{college?.code ? ` (${college.code})` : ""} readiness and placement status.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Students" value={stats.students} icon={GraduationCap} tone="blue" />
        <MetricCard title="Profiles Complete" value={stats.profileComplete} icon={CheckCircle} tone="green" />
        <MetricCard title="Verify Docs" value={stats.pendingVerification} icon={FileCheck} tone="amber" />
        <MetricCard title="Active Drives" value={stats.activeDrives} icon={Briefcase} tone="violet" />
        <MetricCard title="Placed" value={stats.placed} icon={BarChart3} tone="green" />
        <MetricCard title="Placement Rate" value={`${stats.placementRate || 0}%`} icon={Percent} tone="green" />
        <MetricCard title="Average CGPA" value={stats.averageCgpa || 0} icon={TrendingUp} tone="blue" />
        <MetricCard title="Exam Average" value={`${stats.averageAttemptPercentage || 0}%`} icon={BarChart3} tone="violet" />
      </div>
    </div>
  );
}

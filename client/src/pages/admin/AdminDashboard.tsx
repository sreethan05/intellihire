import { useEffect, useState } from "react";
import { Building2, School, UserPlus, Users, Activity, TrendingUp } from "lucide-react";
import { adminApi } from "@/lib/api";
import type { DashboardStats } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";


const CHART_DATA = [
  { name: "Jan", value: 15 },
  { name: "Feb", value: 35 },
  { name: "Mar", value: 28 },
  { name: "Apr", value: 48 },
  { name: "May", value: 42 },
  { name: "Jun", value: 65 },
  { name: "Jul", value: 58 },
  { name: "Aug", value: 85 },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getDashboard()
      .then(({ data }) => setStats(data.stats || {}))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <div className="h-80 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-80 animate-pulse rounded-lg bg-slate-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Platform Overview</h2>
          <p className="text-xs text-slate-500 font-semibold mt-1">Platform analytics and administrative control panel.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm cursor-pointer select-none hover:bg-slate-50">
          Admin Control Center ▾
        </div>
      </div>

      {/* Premium Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Recruiters Card (Violet Gradient background to match Screenshot 1) */}
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
        {/* Growth Area Chart (Recharts) */}
        <Card className="rounded-2xl shadow-sm border border-slate-200/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-extrabold text-slate-900">
              Platform Growth Analytics
            </CardTitle>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600 uppercase">
              Month ▾
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={CHART_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="growthColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#8b5cf6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#growthColor)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Placement Funnel & Activity Log */}
        <Card className="rounded-2xl shadow-sm border border-slate-200/60 flex flex-col justify-between">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-extrabold text-slate-900">
              Placement Funnel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 flex-1 flex flex-col justify-between">
            {/* SVG Funnel Visualizer matching Screenshot 1 */}
            <div className="flex justify-center py-2">
              <svg width="280" height="150" viewBox="0 0 280 150" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Level 1: Application */}
                <polygon points="10,10 270,10 240,40 40,40" fill="url(#funnelGrad1)" />
                <text x="140" y="28" fill="white" fontSize="11" fontWeight="bold" textAnchor="middle">Application · 200k</text>
                
                {/* Level 2: Improved */}
                <polygon points="42,43 238,43 210,73 70,73" fill="url(#funnelGrad2)" />
                <text x="140" y="61" fill="white" fontSize="11" fontWeight="bold" textAnchor="middle">Improved · 150k</text>

                {/* Level 3: Offering */}
                <polygon points="72,76 208,76 182,106 98,106" fill="url(#funnelGrad3)" />
                <text x="140" y="94" fill="white" fontSize="11" fontWeight="bold" textAnchor="middle">Offering · 100k</text>

                {/* Level 4: Offer */}
                <polygon points="100,109 180,109 158,139 122,139" fill="url(#funnelGrad4)" />
                <text x="140" y="127" fill="white" fontSize="11" fontWeight="bold" textAnchor="middle">Offer · 203</text>

                <defs>
                  <linearGradient id="funnelGrad1" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                  <linearGradient id="funnelGrad2" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#2563eb" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                  <linearGradient id="funnelGrad3" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#0284c7" />
                    <stop offset="100%" stopColor="#0ea5e9" />
                  </linearGradient>
                  <linearGradient id="funnelGrad4" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#0d9488" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Recent Activity Log */}
            <div className="border-t border-slate-100 pt-4 space-y-3.5">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Recent Activity
              </div>
              <div className="space-y-3">
                {[
                  { title: "Smooth card lift animations", time: "1 hour ago" },
                  { title: "New candidate onboarding completion", time: "2 hours ago" },
                ].map((act, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                      <Activity className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800 leading-tight">{act.title}</div>
                      <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{act.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

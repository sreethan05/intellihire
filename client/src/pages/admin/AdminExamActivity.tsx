import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { adminApi } from "@/lib/api";
import type { Attempt } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from "recharts";

const MONITORING_DATA = [
  { name: "10am", value: 12 },
  { name: "11am", value: 34 },
  { name: "12pm", value: 20 },
  { name: "1pm", value: 45 },
  { name: "2pm", value: 30 },
  { name: "3pm", value: 68 },
  { name: "4pm", value: 50 },
];

export default function AdminExamActivity() {
  const [recentAttempts, setRecentAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getDashboard()
      .then(({ data }) => {
        setRecentAttempts(data.recentAttempts || []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-slate-200" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="h-[400px] animate-pulse rounded-lg bg-slate-200" />
          <div className="h-[400px] animate-pulse rounded-lg bg-slate-200" />
          <div className="h-[400px] animate-pulse rounded-lg bg-slate-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Exam Activity</h1>
        <p className="text-xs text-slate-500 font-semibold mt-1">
          Review live exam events, proctor warning logs, and system metrics.
        </p>
      </div>

      {/* Grid matching Screenshot 3 */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr_1fr]">
        
        {/* Column 1: Live Exam Logs & Recent Submissions */}
        <div className="space-y-6">
          {/* Live Exam Logs */}
          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-extrabold text-slate-900">
                Live Exam Logs
              </CardTitle>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 uppercase">
                All Filters ▾
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative pl-6 border-l border-slate-100 space-y-4">
                {[
                  { text: "System eventing completed", time: "09:00 PM" },
                  { text: "System exams mapper completed", time: "09:30 AM" },
                  { text: "System events failed completed", time: "00:00 AM" },
                  { text: "System ascruiter completed", time: "09:30 AM" },
                ].map((log, idx) => (
                  <div key={idx} className="relative">
                    <span className="absolute -left-[30px] top-1 flex h-2 w-2 rounded-full bg-violet-600 ring-4 ring-white"></span>
                    <div className="flex justify-between items-baseline gap-4">
                      <span className="text-xs font-bold text-slate-700">{log.text}</span>
                      <span className="text-[10px] text-slate-400 font-semibold">{log.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Submissions */}
          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-extrabold text-slate-900">
                Recent Submissions
              </CardTitle>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">All Time</span>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-left text-xs font-semibold text-slate-500">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400">
                    <th className="pb-2 font-bold uppercase">Student</th>
                    <th className="pb-2 font-bold uppercase">Status</th>
                    <th className="pb-2 font-bold uppercase">Exam</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAttempts.slice(0, 3).map((attempt) => (
                    <tr key={attempt.id} className="border-b border-slate-100/50 last:border-0">
                      <td className="py-2.5">
                        <div className="font-bold text-slate-800">{attempt.users?.name || "Candidate"}</div>
                        <div className="text-[10px] text-slate-400">{attempt.users?.email}</div>
                      </td>
                      <td className="py-2.5">
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-100 uppercase">
                          {attempt.status === "completed" ? "Completed" : "Active"}
                        </span>
                      </td>
                      <td className="py-2.5 font-bold text-slate-700">{attempt.exams?.title || "Exam"}</td>
                    </tr>
                  ))}
                  {recentAttempts.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-400">
                        No submissions recorded yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* Column 2: AI Proctor Alerts & Real-time Monitoring */}
        <div className="space-y-6">
          {/* AI Proctor Alerts */}
          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-extrabold text-slate-900">
                AI Proctor Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                "AI Proctor Alert - Face Missing",
                "AI Proctor Alert - Tab Switch",
                "AI Proctor Alert - Voice Flag",
                "AI Proctor Alert - Camera Offline",
              ].map((alert, idx) => (
                <div key={idx} className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50/50 p-2.5 text-rose-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="text-[11px] font-bold">{alert}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Real-time Monitoring Chart */}
          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-extrabold text-slate-900">
                Real-time Monitoring
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[120px] w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={MONITORING_DATA} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="monGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#monGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Column 3: Indicators, Counter, and Animated Timeline */}
        <div className="space-y-6">
          {/* Suspicious Activity Indicators */}
          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-extrabold text-slate-900">
                Suspicious Activity Indicators
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-600 font-bold">Suspicious Activity Indicators</span>
                <span className="text-xs font-extrabold text-slate-900">0</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-600 font-bold">Tab Switch Logs</span>
                <span className="text-xs font-extrabold text-slate-900">0</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-600 font-bold">Webcam Detection Status</span>
                <span className="rounded bg-emerald-50 border border-emerald-100 p-0.5 text-emerald-600">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Exam Attempt Counters */}
          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
            <CardContent className="p-5 flex justify-between items-center">
              <span className="text-sm font-extrabold text-slate-900">Exam Attempt Counters</span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-extrabold text-violet-700">
                3
              </span>
            </CardContent>
          </Card>

          {/* Animated exam timeline */}
          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">All Time</span>
            </CardHeader>
            <CardContent className="space-y-4 pb-5">
              <div className="relative pl-5 border-l border-slate-100 space-y-3.5">
                {[
                  { title: "Animated exam indexed", time: "Start up at 7:33 PM" },
                  { title: "Animated exam received", time: "Start up at 1:00 PM" },
                ].map((evt, idx) => (
                  <div key={idx} className="relative">
                    <span className="absolute -left-[29px] top-1 flex h-1.5 w-1.5 rounded-full bg-violet-600 ring-4 ring-white"></span>
                    <div>
                      <div className="text-xs font-bold text-slate-800 leading-none">{evt.title}</div>
                      <div className="text-[9px] text-slate-400 font-semibold mt-0.5">{evt.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { AlertTriangle, Activity, Users } from "lucide-react";
import { io } from "socket.io-client";
import { adminAnalyticsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, CartesianGrid
} from "recharts";

const WS_URL = import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000";

export default function AdminExamActivity() {
  const [loading, setLoading] = useState(true);
  const [liveLogs, setLiveLogs] = useState<any[]>([]);
  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);
  const [proctorAlerts, setProctorAlerts] = useState<any[]>([]);
  
  // Stats
  const [activeCandidates, setActiveCandidates] = useState(0);
  const [monitoringData, setMonitoringData] = useState<any[]>([]);
  const [suspiciousStats, setSuspiciousStats] = useState<any>({ totalFlags: 0, tabSwitches: 0, faceMissing: 0, cameraOffline: 0 });

  useEffect(() => {
    setLoading(true);
    // Fetch initial real-time activity state
    adminAnalyticsApi.getRealTimeActivity()
      .then(({ data }) => {
        setActiveCandidates(data.liveAttempts || 0);
        
        // Map submissions
        setRecentAttempts(data.recentSubmissions?.map((s: any) => ({
          id: s.attemptId,
          users: { name: s.candidateName },
          exams: { title: s.examTitle },
          status: "completed",
          submitted_at: s.submittedAt,
        })) || []);

        // Map initial alerts
        setProctorAlerts(data.recentProctoringEvents?.map((e: any) => 
          `Proctor Alert: ${e.candidateName} - ${String(e.eventType).replace("_", " ")} flagged (${e.severity} severity)`
        ) || []);

        // Map initial logs
        const initialLogs: any[] = [];
        if (data.recentSubmissions) {
          data.recentSubmissions.forEach((s: any) => {
            initialLogs.push({
              text: `Candidate "${s.candidateName}" submitted exam "${s.examTitle}"`,
              time: new Date(s.submittedAt).toLocaleTimeString(),
            });
          });
        }
        setLiveLogs(initialLogs.slice(0, 10));

        // Map hourly charts
        setMonitoringData(data.activeMonitoring || []);
        setSuspiciousStats(data.suspiciousActivity || { totalFlags: 0, tabSwitches: 0, faceMissing: 0, cameraOffline: 0 });
      })
      .catch((err) => console.error("Error loading real-time dashboard activity stats", err))
      .finally(() => setLoading(false));

    // Connect to WebSocket
    const socket = io(WS_URL, {
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      console.log("[WebSocket Admin] Connected and subscribed to admin feed");
      socket.emit("admin:join");
    });

    // Handle student starting exam
    socket.on("admin:exam_start", (data: any) => {
      setActiveCandidates((prev) => prev + 1);
      
      const newLog = {
        text: `Candidate "${data.candidateName}" started exam "${data.examTitle}"`,
        time: new Date(data.startedAt).toLocaleTimeString(),
      };
      setLiveLogs((prev) => [newLog, ...prev.slice(0, 15)]);
      
      // Increment monitoring chart count for current hour
      const currentHour = new Date().getHours();
      const currentLabel = `${currentHour % 12 || 12}${currentHour < 12 ? "am" : "pm"}`;
      setMonitoringData((prev) => 
        prev.map((item) => 
          item.hour === currentLabel 
            ? { ...item, activeCandidates: item.activeCandidates + 1 }
            : item
        )
      );
    });

    // Handle student submitting exam
    socket.on("admin:exam_submission", (data: any) => {
      setActiveCandidates((prev) => Math.max(0, prev - 1));
      
      const newLog = {
        text: `Candidate "${data.candidateName}" submitted exam "${data.examTitle}" (Score: ${data.score})`,
        time: new Date(data.submittedAt).toLocaleTimeString(),
      };
      setLiveLogs((prev) => [newLog, ...prev.slice(0, 15)]);

      const newSubmission = {
        id: data.attemptId,
        users: { name: data.candidateName },
        exams: { title: data.examTitle },
        status: "completed",
        submitted_at: data.submittedAt,
      };
      setRecentAttempts((prev) => [newSubmission, ...prev.slice(0, 9)]);
    });

    // Handle proctor warning violation
    socket.on("admin:proctor_violation", (data: any) => {
      const alertMsg = `Proctor Alert: ${data.candidateName} - ${data.message} in "${data.examTitle}"`;
      setProctorAlerts((prev) => [alertMsg, ...prev.slice(0, 9)]);

      const newLog = {
        text: `⚠️ WARNING: Candidate "${data.candidateName}" proctoring warning triggered: "${data.message}"`,
        time: new Date(data.timestamp).toLocaleTimeString(),
      };
      setLiveLogs((prev) => [newLog, ...prev.slice(0, 15)]);

      // Update counters
      setSuspiciousStats((prev: any) => {
        const msg = String(data.message).toLowerCase();
        return {
          totalFlags: prev.totalFlags + (data.violationCount || 1),
          tabSwitches: prev.tabSwitches + (msg.includes("tab") ? 1 : 0),
          faceMissing: prev.faceMissing + (msg.includes("face") ? 1 : 0),
          cameraOffline: prev.cameraOffline + (msg.includes("camera") ? 1 : 0),
        };
      });
    });

    return () => {
      socket.disconnect();
    };
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
      {/* Title Header */}
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Real-Time Platform Activity</h1>
        <p className="text-xs text-slate-500 font-semibold mt-1">
          Monitor live candidate connections, proctor warnings, and exam submissions in real-time.
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr_1fr]">
        
        {/* Column 1: Live Exam Logs & Recent Submissions */}
        <div className="space-y-6">
          {/* Live Exam Logs */}
          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-extrabold text-slate-900">
                Live Exam Action Logs
              </CardTitle>
              <span className="rounded-full bg-emerald-50 px-3 py-0.5 text-[9px] font-black text-emerald-700 uppercase animate-pulse border border-emerald-100 flex items-center gap-1">
                <Activity size={10} /> Live Stream
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              {liveLogs.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 font-semibold">Waiting for live activities...</div>
              ) : (
                <div className="relative pl-6 border-l border-slate-100 space-y-4">
                  {liveLogs.map((log, idx) => (
                    <div key={idx} className="relative">
                      <span className={`absolute -left-[30px] top-1 flex h-2 w-2 rounded-full ring-4 ring-white ${
                        log.text.includes("WARNING") ? "bg-rose-500" : "bg-violet-600"
                      }`}></span>
                      <div className="flex justify-between items-baseline gap-4">
                        <span className="text-xs font-bold text-slate-700 leading-normal">{log.text}</span>
                        <span className="text-[10px] text-slate-400 font-semibold shrink-0">{log.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Submissions */}
          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-extrabold text-slate-900">
                Recent Submissions
              </CardTitle>
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
                  {recentAttempts.map((attempt) => (
                    <tr key={attempt.id} className="border-b border-slate-100/50 last:border-0">
                      <td className="py-2.5">
                        <div className="font-extrabold text-slate-800">{attempt.users?.name || "Candidate"}</div>
                        <div className="text-[10px] text-slate-400">{attempt.users?.email}</div>
                      </td>
                      <td className="py-2.5">
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-100 uppercase">
                          {attempt.status}
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
                Real-Time AI Proctor Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {proctorAlerts.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 font-semibold bg-slate-50/20 border border-dashed rounded-lg">
                  No integrity alerts logged.
                </div>
              ) : (
                proctorAlerts.map((alert, idx) => (
                  <div key={idx} className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-rose-700">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="text-xs font-bold leading-normal">{alert}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Real-time Monitoring Chart */}
          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-extrabold text-slate-900">
                Active Hourly Candidate Traffic
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[120px] w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monitoringData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="monGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} />
                    <Area
                      type="monotone"
                      dataKey="activeCandidates"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#monGrad)"
                      name="Active Candidates"
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
                Suspicious Activity Flags
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 font-semibold text-slate-700">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-bold">Total Tab Switches:</span>
                <span className="text-slate-900 font-extrabold">{suspiciousStats.tabSwitches}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-bold">Total Face Missing Alerts:</span>
                <span className="text-slate-900 font-extrabold">{suspiciousStats.faceMissing}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-bold">Camera Offline Events:</span>
                <span className="text-slate-900 font-extrabold">{suspiciousStats.cameraOffline}</span>
              </div>
              <div className="flex justify-between items-center text-xs border-t border-slate-100 pt-3">
                <span className="text-violet-600 font-extrabold">Accumulated Warnings:</span>
                <span className="inline-flex rounded-full bg-rose-50 border border-rose-100 px-2 py-0.5 text-xs font-black text-rose-600">
                  {suspiciousStats.totalFlags} flags
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Exam Attempt Counters */}
          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
            <CardContent className="p-5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-violet-600" />
                <span className="text-xs font-extrabold text-slate-900">Active Candidates In-Progress</span>
              </div>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-xs font-black text-violet-700 animate-bounce">
                {activeCandidates}
              </span>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

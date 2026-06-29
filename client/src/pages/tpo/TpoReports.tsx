import { useEffect, useState } from "react";
import { BarChart3, TrendingUp, Users, GraduationCap, CheckCircle } from "lucide-react";
import { tpoApi, examApi, resultApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AttemptDetailModal from "@/components/AttemptDetailModal";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const BRANCH_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];

export default function TpoReports() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Exam Performance States
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState("");
  const [examAttempts, setExamAttempts] = useState<any[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);

  useEffect(() => {
    tpoApi.getStudents()
      .then(({ data }) => setStudents(data.students || []))
      .finally(() => setLoading(false));

    examApi.getExams()
      .then(({ data }) => setExams(data.exams || []))
      .catch(err => console.error("Error loading exams:", err));
  }, []);

  useEffect(() => {
    if (selectedExam) {
      setAttemptsLoading(true);
      resultApi.getResults(selectedExam)
        .then(({ data }) => setExamAttempts(data.results || []))
        .catch(err => console.error("Error loading results:", err))
        .finally(() => setAttemptsLoading(false));
    } else {
      setExamAttempts([]);
    }
  }, [selectedExam]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-lg bg-slate-200" />)}
      </div>
    );
  }

  const total = students.length;
  const verified = students.filter((s) => s.documents_verified).length;
  const profileComplete = students.filter((s) => s.profile_complete || s.user?.profile_complete).length;
  const avgCgpa = total
    ? (students.reduce((sum, s) => sum + (Number(s.cgpa) || 0), 0) / total).toFixed(2)
    : "0.00";

  // Branch distribution
  const branchMap: Record<string, number> = {};
  students.forEach((s) => {
    const b = s.branch || "Unknown";
    branchMap[b] = (branchMap[b] || 0) + 1;
  });
  const branchData = Object.entries(branchMap).map(([name, value]) => ({ name, value }));

  // CGPA distribution buckets
  const cgpaBuckets = [
    { label: "< 6.0", min: 0, max: 6 },
    { label: "6.0 – 7.0", min: 6, max: 7 },
    { label: "7.0 – 8.0", min: 7, max: 8 },
    { label: "8.0 – 9.0", min: 8, max: 9 },
    { label: "9.0+", min: 9, max: 11 },
  ];
  const cgpaData = cgpaBuckets.map((bucket) => ({
    name: bucket.label,
    count: students.filter((s) => {
      const c = Number(s.cgpa);
      return c >= bucket.min && c < bucket.max;
    }).length,
  }));

  // Graduation year distribution
  const yearMap: Record<string, number> = {};
  students.forEach((s) => {
    const y = String(s.graduation_year || "Unknown");
    yearMap[y] = (yearMap[y] || 0) + 1;
  });
  const yearData = Object.entries(yearMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([name, count]) => ({ name, count }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Reports &amp; Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Overview of student data, CGPA distribution, and verification status.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total Students", value: total, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Docs Verified", value: verified, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Profile Complete", value: profileComplete, icon: GraduationCap, color: "text-violet-600", bg: "bg-violet-50" },
          { label: "Avg CGPA", value: avgCgpa, icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div className="text-2xl font-extrabold text-slate-950">{value}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Branch distribution pie */}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-blue-600" />
              Branch Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {branchData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={branchData} cx="50%" cy="50%" outerRadius={85} dataKey="value" paddingAngle={3} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {branchData.map((_, i) => <Cell key={i} fill={BRANCH_COLORS[i % BRANCH_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-16 text-center text-sm text-slate-400">No student data yet</div>
            )}
          </CardContent>
        </Card>

        {/* CGPA distribution bar */}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-violet-600" />
              CGPA Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={cgpaData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[5, 5, 0, 0]} name="Students" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Graduation year */}
        <Card className="rounded-lg lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-4 w-4 text-emerald-600" />
              Graduation Year Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={yearData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="#10b981" radius={[5, 5, 0, 0]} name="Students" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Exam Performance Reports */}
      <Card className="rounded-lg mt-6 text-left">
        <CardHeader className="border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-violet-600" />
            Exam Performance Reports
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <div className="text-xs text-slate-500 font-semibold leading-relaxed">
            Select any conducted exam below to inspect candidate performance, scores, pass/fail status, and drill down to individual candidate code submissions and answer sheets.
          </div>

          {/* Exam Selector */}
          <div className="flex items-center gap-3 max-w-md">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Select Exam:</span>
            <select 
              value={selectedExam} 
              onChange={e => setSelectedExam(e.target.value)}
              className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-violet-500 shadow-sm cursor-pointer"
            >
              <option value="">Choose an exam...</option>
              {exams.map(e => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
            </select>
          </div>

          {/* Attempts Table */}
          {selectedExam && (
            <div className="pt-2">
              {attemptsLoading ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-2">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                  <span className="text-[10px] text-slate-400 font-bold">Loading candidate scores...</span>
                </div>
              ) : examAttempts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs font-semibold text-slate-400 bg-slate-50/50">
                  No submissions or exam attempts recorded yet for this assessment.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left">
                      <tr>
                        <th className="px-4 py-3">Candidate</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Score</th>
                        <th className="px-4 py-3">Result</th>
                        <th className="px-4 py-3">Submitted At</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-left font-medium text-slate-700">
                      {examAttempts.map(attempt => {
                        const isCompleted = attempt.status === "completed";
                        const passScore = attempt.exams?.pass_marks || 0;
                        const hasPassed = isCompleted && (attempt.score || 0) >= passScore;
                        
                        return (
                          <tr key={attempt.id} className="hover:bg-slate-50/40 transition duration-150">
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-800">{attempt.users?.name || "Unknown"}</div>
                              <div className="text-[10px] text-slate-400">{attempt.users?.email}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                isCompleted 
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                                  : "bg-blue-50 text-blue-700 border border-blue-100"
                              }`}>
                                {isCompleted ? "Completed" : "In Progress"}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-900">
                              {isCompleted ? `${attempt.score} / ${attempt.exams?.total_marks || 0}` : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {isCompleted ? (
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                  hasPassed 
                                    ? "bg-green-50 text-green-700 border border-green-200" 
                                    : "bg-rose-50 text-rose-700 border border-rose-200"
                                }`}>
                                  {hasPassed ? "Pass" : "Fail"}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isCompleted ? (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => setActiveAttemptId(attempt.id)}
                                  className="h-7 border-slate-200 text-violet-600 font-bold text-[10px] rounded-lg hover:bg-violet-50/50"
                                >
                                  Review Submission
                                </Button>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic font-semibold">Active Exam</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {activeAttemptId && (
        <AttemptDetailModal 
          attemptId={activeAttemptId} 
          onClose={() => setActiveAttemptId(null)} 
        />
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { 
  BarChart3, TrendingUp, Users, GraduationCap, CheckCircle, 
  Landmark, UploadCloud, Search, Mail, Target, Download
} from "lucide-react";
import { tpoApi, examApi, resultApi, tpoAnalyticsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { exportToCSV } from "@/lib/csvExport";
import { toast } from "sonner";
import AttemptDetailModal from "@/components/AttemptDetailModal";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line
} from "recharts";

const BRANCH_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];

export default function TpoReports() {
  const [activeTab, setActiveTab] = useState<"placement" | "readiness" | "upload" | "academic">("placement");
  const [loading, setLoading] = useState(true);

  // Existing student lists
  const [students, setStudents] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState("");
  const [examAttempts, setExamAttempts] = useState<any[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);

  // New Analytics States
  const [placementStats, setPlacementStats] = useState<any>({ byBranch: [], byYear: [], topCompanies: [] });
  const [readinessData, setReadinessData] = useState<any>({ students: [], zoneCounts: { ready: 0, approaching: 0, needs_work: 0 } });
  const [companyData, setCompanyData] = useState<any>({ companies: [] });
  const [uploadData, setUploadData] = useState<any>({ uploads: [], trend: [] });

  // Filter States for Heatmap
  const [filterBranch, setFilterBranch] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      tpoApi.getStudents(),
      examApi.getExams(),
      tpoAnalyticsApi.getPlacementStats(),
      tpoAnalyticsApi.getReadinessHeatmap(),
      tpoAnalyticsApi.getCompanyPerformance(),
      tpoAnalyticsApi.getUploadTracking(),
    ])
      .then(([studentsRes, examsRes, placementRes, readinessRes, companyRes, uploadRes]) => {
        setStudents(studentsRes.data.students || []);
        setExams(examsRes.data.exams || []);
        setPlacementStats(placementRes.data || { byBranch: [], byYear: [], topCompanies: [] });
        setReadinessData(readinessRes.data || { students: [], zoneCounts: { ready: 0, approaching: 0, needs_work: 0 } });
        setCompanyData(companyRes.data || { companies: [] });
        setUploadData(uploadRes.data || { uploads: [], trend: [] });
      })
      .catch((err) => console.error("Error loading TPO analytics reports", err))
      .finally(() => setLoading(false));
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

  // Handle reminder email mock send
  const handleSendReminder = (studentEmail: string) => {
    toast.success(`Practice reminder email dispatched to ${studentEmail}`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-lg bg-slate-200" />)}
      </div>
    );
  }

  // Academic breakdown calculations
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

  // Filter student readiness heatmap list
  const filteredReadiness = readinessData.students?.filter((s: any) => {
    const matchesBranch = filterBranch ? s.branch === filterBranch : true;
    const matchesYear = filterYear ? String(s.roll_number || "").includes(filterYear) || String(s.graduation_year || "").includes(filterYear) : true;
    const matchesSearch = searchQuery 
      ? s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.roll_number.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchesBranch && matchesYear && matchesSearch;
  }) || [];

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Campus Reports &amp; Placement Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor branch placement rates, student practice readiness indices, and bulk upload trend reports.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const formatted = students.map((s) => ({
              name: s.user?.name || s.name || "Student",
              email: s.user?.email || s.email || "N/A",
              branch: s.branch || "N/A",
              roll_number: s.roll_number || "N/A",
              cgpa: s.cgpa || "N/A",
              verified: s.documents_verified ? "Yes" : "No",
            }));
            exportToCSV(
              formatted,
              ["name", "email", "branch", "roll_number", "cgpa", "verified"],
              `campus_placement_report_${new Date().toISOString().slice(0, 10)}`,
              ["Student Name", "Email", "Branch", "Roll Number", "CGPA", "Verified"]
            );
            toast.success("Campus placement report exported to CSV");
          }}
          className="h-9 px-3.5 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <Download className="mr-2 h-4 w-4 text-blue-600" />
          Export Report (CSV)
        </Button>
      </div>

      {/* Tab Navigation Controls */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-px">
        {[
          { id: "placement", label: "Placement & Company Drive Stats", icon: Landmark },
          { id: "readiness", label: "Student Readiness Heatmap", icon: Target },
          { id: "upload", label: "Upload success tracking", icon: UploadCloud },
          { id: "academic", label: "Academic Distributions", icon: BarChart3 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px outline-none ${
                isActive
                  ? "border-violet-600 text-violet-700 font-extrabold"
                  : "border-transparent text-slate-500 hover:text-slate-950 hover:border-slate-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      {activeTab === "placement" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            
            {/* Placement stats by Branch */}
            <Card className="rounded-xl border border-slate-200">
              <CardHeader>
                <CardTitle className="text-sm font-extrabold text-slate-800">Placement Statistics by Branch &amp; Year</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {placementStats.byBranch?.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400 font-semibold bg-slate-50/50 border border-dashed rounded-lg">
                    No branch placement stats recorded.
                  </div>
                ) : (
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 font-black uppercase">
                      <tr>
                        <th className="p-3">Branch</th>
                        <th className="p-3">Students</th>
                        <th className="p-3">Placed</th>
                        <th className="p-3">Placement %</th>
                        <th className="p-3">Avg CTC</th>
                        <th className="p-3">Avg CGPA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                      {placementStats.byBranch.map((b: any) => (
                        <tr key={b.branch} className="hover:bg-slate-50/20">
                          <td className="p-3 font-extrabold text-slate-900 capitalize">{b.branch}</td>
                          <td className="p-3 text-slate-500">{b.totalStudents}</td>
                          <td className="p-3 text-slate-500">{b.placed}</td>
                          <td className="p-3 text-slate-700">
                            <span className="inline-flex rounded bg-emerald-50 px-2 py-0.5 font-extrabold text-emerald-600">
                              {b.placementRate}%
                            </span>
                          </td>
                          <td className="p-3 text-violet-600 font-bold">{b.avgSalary ? `₹${b.avgSalary}L` : "N/A"}</td>
                          <td className="p-3 text-slate-600">{b.avgCgpa}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            {/* Company conversion rates */}
            <Card className="rounded-xl border border-slate-200">
              <CardHeader>
                <CardTitle className="text-sm font-extrabold text-slate-800">Company-Wise Drive Performance</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {companyData.companies?.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400 font-semibold bg-slate-50/50 border border-dashed rounded-lg">
                    No active company recruitment drives.
                  </div>
                ) : (
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 font-black uppercase">
                      <tr>
                        <th className="p-3">Company</th>
                        <th className="p-3">Drives</th>
                        <th className="p-3">Registered</th>
                        <th className="p-3">Exam Taken</th>
                        <th className="p-3">Shortlisted</th>
                        <th className="p-3">Offers</th>
                        <th className="p-3">Conversion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                      {companyData.companies.map((c: any) => (
                        <tr key={c.company} className="hover:bg-slate-50/20">
                          <td className="p-3 font-extrabold text-slate-900">{c.company}</td>
                          <td className="p-3 text-slate-500">{c.drives}</td>
                          <td className="p-3 text-slate-500">{c.registered}</td>
                          <td className="p-3 text-slate-500">{c.examTaken}</td>
                          <td className="p-3 text-slate-500">{c.shortlisted}</td>
                          <td className="p-3 text-emerald-600 font-bold">{c.offered}</td>
                          <td className="p-3 text-slate-700">
                            <span className="inline-flex rounded bg-violet-50 px-2 py-0.5 font-extrabold text-violet-600">
                              {c.conversionRate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      )}

      {activeTab === "readiness" && (
        <div className="space-y-6">
          {/* Readiness Zone count cards */}
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Placement Ready (>=75)", count: readinessData.zoneCounts?.ready || 0, tone: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
              { label: "Approaching (50-74)", count: readinessData.zoneCounts?.approaching || 0, tone: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100" },
              { label: "Needs Practice (<50)", count: readinessData.zoneCounts?.needs_work || 0, tone: "text-rose-600", bg: "bg-rose-50", border: "border-rose-100" },
            ].map((zone) => (
              <div key={zone.label} className={`rounded-xl border ${zone.border} ${zone.bg} p-5 shadow-sm`}>
                <div className="text-2xl font-black text-slate-950">{zone.count}</div>
                <div className={`mt-1 text-xs font-bold uppercase ${zone.tone}`}>{zone.label}</div>
              </div>
            ))}
          </div>

          {/* Student readiness list with filters */}
          <Card className="rounded-xl border border-slate-200">
            <CardHeader className="border-b border-slate-100 pb-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-sm font-extrabold text-slate-800">Student Placement Readiness Indices</CardTitle>
                </div>
                
                {/* Filters toolbar */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      placeholder="Search students..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-9 w-44 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-violet-500 font-semibold"
                    />
                  </div>
                  
                  <select
                    value={filterBranch}
                    onChange={(e) => setFilterBranch(e.target.value)}
                    className="h-9 w-32 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-violet-500 cursor-pointer"
                  >
                    <option value="">All Branches</option>
                    <option value="cse">CSE</option>
                    <option value="ece">ECE</option>
                    <option value="eee">EEE</option>
                    <option value="me">ME</option>
                  </select>

                  <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    className="h-9 w-28 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-violet-500 cursor-pointer"
                  >
                    <option value="">All Years</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {filteredReadiness.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 font-semibold">
                  No students match your selected filters.
                </div>
              ) : (
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 font-black uppercase">
                    <tr>
                      <th className="p-3.5">Roll Number</th>
                      <th className="p-3.5">Student</th>
                      <th className="p-3.5">Branch</th>
                      <th className="p-3.5">CGPA</th>
                      <th className="p-3.5">ATS Resume</th>
                      <th className="p-3.5">Readiness Score</th>
                      <th className="p-3.5">Status Zone</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {filteredReadiness.map((student: any) => {
                      const isReady = student.zone === "ready";
                      const isNeedsWork = student.zone === "needs_work";
                      
                      return (
                        <tr key={student.candidateId} className="hover:bg-slate-50/20">
                          <td className="p-3.5 font-mono text-slate-500">{student.roll_number}</td>
                           <td className="p-3.5 font-extrabold text-slate-900">{student.name}</td>
                          <td className="p-3.5 text-slate-500 capitalize">{student.branch}</td>
                          <td className="p-3.5 text-slate-600">{student.cgpa}</td>
                          <td className="p-3.5">
                            {student.resume_url ? (
                              <div className="flex items-center gap-1.5">
                                <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                                  (student.resume_ats_analysis?.atsScore || 0) >= 75
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                    : (student.resume_ats_analysis?.atsScore || 0) >= 50
                                      ? "bg-amber-50 text-amber-700 border border-amber-100"
                                      : "bg-rose-50 text-rose-700 border border-rose-100"
                                }`}>
                                  {student.resume_ats_analysis?.atsScore || 0}%
                                </span>
                                 <a 
                                   href={student.resume_url ? (import.meta.env.VITE_API_URL || "").replace(/\/api$/, "") + student.resume_url : ""}
                                   target="_blank"
                                   rel="noreferrer"
                                   className="text-[10px] font-black text-violet-600 hover:underline"
                                 >
                                  PDF
                                </a>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-bold italic select-none">Not uploaded</span>
                            )}
                          </td>
                          <td className="p-3.5 font-black text-slate-900">{student.readinessScore}%</td>
                          <td className="p-3.5">
                            <span className={`inline-flex rounded px-2 py-0.5 text-[9px] font-black uppercase ${
                              isReady 
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                                : isNeedsWork 
                                  ? "bg-rose-50 text-rose-700 border border-rose-100 animate-pulse" 
                                  : "bg-amber-50 text-amber-700 border border-amber-100"
                            }`}>
                              {student.zone.replace("_", " ")}
                            </span>
                          </td>
                          <td className="p-3.5 text-right">
                            {isNeedsWork && (
                              <button
                                onClick={() => handleSendReminder(student.name)}
                                className="inline-flex h-7 items-center justify-center rounded-lg bg-rose-50 border border-rose-100 px-3 text-[10px] font-bold text-rose-600 hover:bg-rose-100 transition cursor-pointer"
                              >
                                <Mail className="h-3.5 w-3.5 mr-1" /> Send Reminder
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "upload" && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-12">
            
            {/* Upload trend line */}
            <div className="md:col-span-8 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="mb-4">
                <h3 className="text-sm font-extrabold text-slate-800">Bulk Upload Success Trends</h3>
                <p className="text-xs text-slate-400 mt-1">Success rate trends of student registry uploads over the last 6 months.</p>
              </div>

              {uploadData.trend?.length === 0 ? (
                <div className="py-20 text-center text-xs text-slate-400 font-semibold bg-slate-50/50 border border-dashed rounded-lg">
                  No upload batch records available.
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={uploadData.trend} margin={{ left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="successRate" name="Registry Success Rate (%)" stroke="#8b5cf6" strokeWidth={3} activeDot={{ r: 8 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* General metrics summary */}
            <div className="md:col-span-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800">Batch Onboarding</h3>
                <p className="text-xs text-slate-400 mt-1">TPO registry database import logs.</p>
              </div>

              <div className="my-6 space-y-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
                  <div>
                    <div className="text-xl font-black text-slate-900">{uploadData.uploads?.length || 0}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mt-1">Onboarding Batches</div>
                  </div>
                  <UploadCloud className="h-8 w-8 text-violet-600 opacity-80" />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 text-[11px] text-slate-400 font-semibold leading-normal">
                ℹ️ Upload success is verified against email format validation rules.
              </div>
            </div>

          </div>

          {/* Upload detail list */}
          <Card className="rounded-xl border border-slate-200">
            <CardHeader>
              <CardTitle className="text-sm font-extrabold text-slate-800">Registry Upload History</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {uploadData.uploads?.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 font-semibold bg-slate-50/50 border border-dashed rounded-lg">
                  No upload batch entries logged.
                </div>
              ) : (
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 font-black uppercase">
                    <tr>
                      <th className="p-3.5">Filename</th>
                      <th className="p-3.5">Total Rows</th>
                      <th className="p-3.5">Onboarded</th>
                      <th className="p-3.5">Failed</th>
                      <th className="p-3.5">Success Rate</th>
                      <th className="p-3.5">Created Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {uploadData.uploads.map((u: any) => (
                      <tr key={u.id} className="hover:bg-slate-50/20">
                        <td className="p-3.5 font-bold text-slate-900 truncate max-w-48">{u.fileName}</td>
                        <td className="p-3.5 text-slate-500">{u.rowsTotal}</td>
                        <td className="p-3.5 text-emerald-600 font-extrabold">{u.rowsCreated}</td>
                        <td className="p-3.5 text-rose-600 font-extrabold">{u.rowsFailed}</td>
                        <td className="p-3.5">
                          <span className={`inline-flex rounded px-2.5 py-0.5 font-black text-xs ${
                            u.successRate >= 90 
                              ? "bg-emerald-50 text-emerald-600" 
                              : "bg-amber-50 text-amber-600"
                          }`}>
                            {u.successRate}%
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "academic" && (
        <div className="space-y-6">
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
                  <ResponsiveContainer width="100%" height="240">
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
                <ResponsiveContainer width="100%" height="240">
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
          <Card className="rounded-lg mt-6 text-left border border-slate-200">
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
                      <table className="w-full text-xs border-collapse">
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
                              <tr key={attempt.id} className="hover:bg-slate-50/20">
                                <td className="px-4 py-3">
                                  <div className="font-extrabold text-slate-900">{attempt.users?.name || "Candidate"}</div>
                                  <div className="text-[10px] text-slate-400 font-normal">{attempt.users?.email}</div>
                                </td>
                                <td className="px-4 py-3 capitalize">
                                  <span className={`inline-flex rounded px-2 py-0.5 text-[9px] font-black uppercase ${
                                    isCompleted ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
                                  }`}>
                                    {attempt.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-extrabold">{attempt.score || 0}/{attempt.exams?.total_marks || 100}</td>
                                <td className="px-4 py-3">
                                  {isCompleted ? (
                                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                                      hasPassed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                                    }`}>
                                      {hasPassed ? "Passed" : "Failed"}
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className="px-4 py-3 text-slate-500">
                                  {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : "—"}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    onClick={() => setActiveAttemptId(attempt.id)}
                                    className="inline-flex h-7 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-950 transition cursor-pointer"
                                  >
                                    View Details
                                  </button>
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
        </div>
      )}

      {/* Attempt Details Modal Popup */}
      {activeAttemptId && (
        <AttemptDetailModal
          attemptId={activeAttemptId}
          onClose={() => setActiveAttemptId(null)}
        />
      )}
    </div>
  );
}

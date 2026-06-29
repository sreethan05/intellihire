import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { examApi, resultApi } from "@/lib/api";
import { useCollege } from "@/context/CollegeContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { BarChart3, ChevronDown } from "lucide-react";
import type { Exam, Attempt } from "@/types";
import AttemptDetailModal from "@/components/AttemptDetailModal";

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444"];

export default function ViewResults() {
  const { examId: paramExamId } = useParams<{ examId: string }>();
  const { selectedCollegeId } = useCollege();
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState(paramExamId || "");
  const [results, setResults] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);

  useEffect(() => { examApi.getExams().then(({ data }) => { setExams(data.exams || []); setLoading(false); }); }, []);
  useEffect(() => {
    if (selectedExam) {
      setResultsLoading(true);
      resultApi.getResults(selectedExam, selectedCollegeId)
        .then(({ data }) => setResults(data.results || []))
        .finally(() => setResultsLoading(false));
    }
    else setResults([]);
  }, [selectedExam, selectedCollegeId]);

  const completedResults = results.filter(r => r.status === "completed");
  const inProgressResults = results.filter(r => r.status === "in_progress");
  const chartData = completedResults.map(r => ({
    name: (r.users?.name || "Candidate").split(" ")[0],
    fullName: r.users?.name || "Candidate",
    score: r.score || 0,
    total: (r as any).exams?.total_marks || 0,
    passed: (r.score || 0) >= ((r as any).exams?.pass_marks || 0),
  }));
  const statusData = [
    { name: "Completed", value: completedResults.length },
    { name: "In Progress", value: inProgressResults.length },
  ].filter(d => d.value > 0);
  const avgScore = completedResults.length > 0 ? Math.round(completedResults.reduce((s, r) => s + (r.score || 0), 0) / completedResults.length) : 0;
  const passCount = completedResults.filter(r => (r.score || 0) >= ((r as any).exams?.pass_marks || 0)).length;
  const passRate = completedResults.length > 0 ? Math.round((passCount / completedResults.length) * 100) : 0;

  if (loading) return <div style={{ height: 300, background: "#e2e8f0", borderRadius: 12, animation: "pulse 1.5s infinite" }} />;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" }}>View Results</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>Analyze exam performance across candidates.</p>
      </div>

      {/* Exam selector */}
      <div style={{ background: "white", borderRadius: 12, border: "1px solid #e8ecf0", padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <BarChart3 size={16} color="#3b82f6" />
        <div style={{ position: "relative", flex: 1, maxWidth: 400 }}>
          <select value={selectedExam} onChange={e => setSelectedExam(e.target.value)}
            style={{ width: "100%", padding: "10px 36px 10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, fontFamily: "Inter,sans-serif", color: selectedExam ? "#0f172a" : "#94a3b8", outline: "none", appearance: "none" }}>
            <option value="">Select an exam to view results…</option>
            {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <ChevronDown size={14} color="#94a3b8" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
        </div>
      </div>

      {resultsLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
          {[1,2,3,4].map(i => <div key={i} style={{ height: 90, background: "#e2e8f0", borderRadius: 12, animation: "pulse 1.5s infinite" }} />)}
        </div>
      )}

      {!resultsLoading && selectedExam && results.length > 0 && (
        <>
          {/* Stat row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { label: "Total Attempts", value: results.length, color: "#3b82f6", bg: "#dbeafe" },
              { label: "Completed", value: completedResults.length, color: "#10b981", bg: "#dcfce7" },
              { label: "Avg Score", value: avgScore, color: "#8b5cf6", bg: "#ede9fe" },
              { label: "Pass Rate", value: `${passRate}%`, color: "#f59e0b", bg: "#fef3c7" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "white", borderRadius: 12, border: "1px solid #e8ecf0", padding: "18px 20px" }}>
                <div style={{ fontSize: 24, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e8ecf0", padding: "18px 20px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>Score Distribution</div>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: any, _: any, p: any) => [`${v} / ${p.payload.total}`, p.payload.fullName]} contentStyle={{ borderRadius: 8, border: "1px solid #e8ecf0", fontSize: 12 }} />
                    <Bar dataKey="score" radius={[5, 5, 0, 0]}>
                      {chartData.map((entry, i) => <Cell key={i} fill={entry.passed ? "#10b981" : "#ef4444"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "60px 0" }}>No completed attempts yet</p>}
            </div>
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e8ecf0", padding: "18px 20px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>Attempt Status</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                    {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e8ecf0", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Results table */}
          <div style={{ background: "white", borderRadius: 12, border: "1px solid #e8ecf0", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Candidate Results</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Candidate","Status","Score","Result","Submitted","Action"].map(h => (
                    <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid #e8ecf0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map(result => {
                  const passed = result.status === "completed" && (result.score || 0) >= ((result as any).exams?.pass_marks || 0);
                  return (
                    <tr key={result.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f8fafc"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{result.users?.name || "Unknown"}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{result.users?.email}</div>
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{ background: result.status === "completed" ? "#dcfce7" : "#dbeafe", color: result.status === "completed" ? "#166534" : "#1e40af", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 100 }}>
                          {result.status === "completed" ? "Completed" : "In Progress"}
                        </span>
                      </td>
                      <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" }}>
                        {result.status === "completed" ? `${result.score ?? 0} / ${(result as any).exams?.total_marks ?? "?"}` : "—"}
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        {result.status === "completed" ? (
                          <span style={{ background: passed ? "#dcfce7" : "#fee2e2", color: passed ? "#166534" : "#991b1b", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 100 }}>
                            {passed ? "Pass" : "Fail"}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "13px 16px", fontSize: 12, color: "#94a3b8" }}>
                        {result.submitted_at ? new Date(result.submitted_at).toLocaleString() : "—"}
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        {result.status === "completed" ? (
                          <button
                            onClick={() => setActiveAttemptId(result.id)}
                            style={{ background: "#f5f3ff", color: "#7c3aed", border: "1px solid #ddd6fe", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                          >
                            View Paper
                          </button>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 11, fontStyle: "italic" }}>In Progress</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!resultsLoading && selectedExam && results.length === 0 && (
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #e8ecf0", padding: "56px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
          No attempts found for this exam yet.
        </div>
      )}
      {!selectedExam && (
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #e8ecf0", padding: "56px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
          Select an exam above to view results and analytics.
        </div>
      )}

      {activeAttemptId && (
        <AttemptDetailModal
          attemptId={activeAttemptId}
          onClose={() => setActiveAttemptId(null)}
        />
      )}
    </div>
  );
}

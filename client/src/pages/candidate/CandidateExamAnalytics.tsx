import { type CSSProperties, useEffect, useState } from "react";
import { Award, CheckCircle2, MessageSquareText, Target, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { candidateApi } from "@/lib/api";
import type { CandidatePerformanceItem, DashboardStats } from "@/types";

const panelStyle: CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: 20,
};

export default function CandidateExamAnalytics() {
  const [performance, setPerformance] = useState<CandidatePerformanceItem[]>([]);
  const [stats, setStats] = useState<DashboardStats>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    candidateApi.getDashboard()
      .then(({ data }) => {
        setPerformance(data.performance || []);
        setStats(data.stats || {});
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ height: 320, borderRadius: 16, background: "#e2e8f0", animation: "pulse 1.5s infinite" }} />
        <div style={{ height: 260, borderRadius: 16, background: "#e2e8f0", animation: "pulse 1.5s infinite" }} />
      </div>
    );
  }

  const completedCount = performance.length;
  const passCount = performance.filter((item) => item.status === "pass").length;
  const needsWorkCount = Math.max(0, completedCount - passCount);
  const passRate = completedCount ? Math.round((passCount / completedCount) * 100) : 0;
  const averagePercentage = completedCount
    ? Math.round(performance.reduce((total, item) => total + item.percentage, 0) / completedCount)
    : 0;
  const strongestExam = [...performance].sort((a, b) => b.percentage - a.percentage)[0];
  const focusExam = [...performance].sort((a, b) => a.percentage - b.percentage)[0];
  const latestExam = [...performance]
    .filter((item) => item.submittedAt)
    .sort((a, b) => new Date(b.submittedAt || "").getTime() - new Date(a.submittedAt || "").getTime())[0];
  const insightComment =
    completedCount === 0
      ? "Complete an exam to unlock personalized performance comments."
      : passRate >= 80
        ? "Excellent consistency. Keep the same pace and push weaker topics with focused revision."
        : passRate >= 50
          ? "Good base. A few targeted corrections can move more exams into the passing band."
          : "Prioritize fundamentals and review failed questions before attempting the next exam.";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.4px" }}>Candidate Exam Analysis</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
          Review completed-exam performance, percentages, and pass outcomes.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(280px,0.8fr)", gap: 16 }}>
        <div style={panelStyle}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Performance by Exam</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Completed exam scores compared side by side.</div>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="title" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                  {performance.map((item) => (
                    <Cell key={item.examId} fill={item.status === "pass" ? "#10b981" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          {[
            { label: "Average Score", value: `${stats.averageScore || 0}`, color: "#2563eb" },
            { label: "Best Score", value: `${stats.bestScore || 0}`, color: "#8b5cf6" },
            { label: "Passed Exams", value: `${stats.passCount || 0}`, color: "#10b981" },
          ].map((item, index) => (
            <div key={item.label} style={{ ...panelStyle, minHeight: index === 0 ? 122 : undefined }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, color: item.color }}>{item.value}</div>
            </div>
          ))}
          <div style={panelStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <TrendingUp size={16} color="#2563eb" />
              <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Completion trend</span>
            </div>
            <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.7 }}>
              {Math.round(stats.completionRate || 0)}% of your assigned exams are completed. Keep improving the lower-scoring exams and aim to convert more attempts into passes.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 14 }}>
        {[
          { label: "Pass Rate", value: `${passRate}%`, detail: `${passCount} of ${completedCount} completed exams`, color: "#10b981", icon: CheckCircle2 },
          { label: "Avg Percentage", value: `${averagePercentage}%`, detail: "Across completed exams", color: "#2563eb", icon: Target },
          { label: "Needs Work", value: `${needsWorkCount}`, detail: focusExam ? `Focus: ${focusExam.title}` : "No weak area yet", color: "#f97316", icon: TrendingUp },
          { label: "Latest Attempt", value: latestExam ? `${latestExam.percentage}%` : "0%", detail: latestExam?.title || "No attempt yet", color: "#8b5cf6", icon: Award },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} style={panelStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Icon size={16} color={item.color} />
                <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {item.label}
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: item.color }}>{item.value}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 6, lineHeight: 1.5 }}>{item.detail}</div>
            </div>
          );
        })}
      </div>

      <div style={{ ...panelStyle, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <MessageSquareText size={16} color="#2563eb" />
            <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Performance Comment</span>
          </div>
          <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.7 }}>{insightComment}</p>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>Best and Focus Area</div>
          <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.7 }}>
            {strongestExam ? `Strongest: ${strongestExam.title} at ${strongestExam.percentage}%.` : "Strongest area will appear after your first completed exam."}
            {" "}
            {focusExam ? `Next focus: ${focusExam.title} at ${focusExam.percentage}%.` : ""}
          </p>
        </div>
      </div>

      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Award size={16} color="#8b5cf6" />
          <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Completed Exam Breakdown</span>
        </div>
        {performance.length === 0 ? (
          <div style={{ fontSize: 13, color: "#94a3b8" }}>No completed exam data available yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {performance.map((item) => (
              <div key={item.examId} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                      Score {item.score}/{item.totalMarks} • Pass mark {item.passMarks}
                    </div>
                  </div>
                  <span
                    style={{
                      background: item.status === "pass" ? "#dcfce7" : "#fee2e2",
                      color: item.status === "pass" ? "#166534" : "#b91c1c",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {item.status === "pass" ? "Passed" : "Needs Improvement"}
                  </span>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ height: 8, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.min(item.percentage, 100)}%`,
                        height: "100%",
                        background: item.status === "pass" ? "linear-gradient(90deg,#10b981,#34d399)" : "linear-gradient(90deg,#ef4444,#f97316)",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#64748b" }}>
                    <span>{item.percentage}% achieved</span>
                    <span>{item.submittedAt ? new Date(item.submittedAt).toLocaleString() : "Submitted"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

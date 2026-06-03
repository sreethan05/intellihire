import { type CSSProperties, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, CheckCircle2, MessageSquareText, Target, Users } from "lucide-react";
import { recruiterApi } from "@/lib/api";
import { useCollege } from "@/context/CollegeContext";
import type { RecruiterExamPerformance } from "@/types";

const panelStyle: CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: 20,
};

export default function RecruiterExamAnalytics() {
  const { selectedCollegeId } = useCollege();
  const [examPerformance, setExamPerformance] = useState<RecruiterExamPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    recruiterApi.getDashboard(selectedCollegeId)
      .then(({ data }) => {
        setExamPerformance(data.examPerformance || []);
      })
      .finally(() => setLoading(false));
  }, [selectedCollegeId]);

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ height: 320, borderRadius: 16, background: "#e2e8f0", animation: "pulse 1.5s infinite" }} />
        <div style={{ height: 280, borderRadius: 16, background: "#e2e8f0", animation: "pulse 1.5s infinite" }} />
      </div>
    );
  }

  const totalAssigned = examPerformance.reduce((total, exam) => total + exam.assignedCount, 0);
  const totalCompleted = examPerformance.reduce((total, exam) => total + exam.completedCount, 0);
  const totalAttempts = examPerformance.reduce((total, exam) => total + exam.attemptCount, 0);
  const completionRate = totalAssigned ? Math.round((totalCompleted / totalAssigned) * 100) : 0;
  const averagePassRate = examPerformance.length
    ? Math.round(examPerformance.reduce((total, exam) => total + exam.passRate, 0) / examPerformance.length)
    : 0;
  const topExam = [...examPerformance].sort((a, b) => b.passRate - a.passRate)[0];
  const attentionExam = [...examPerformance].sort((a, b) => a.passRate - b.passRate)[0];
  const analyticsComment =
    examPerformance.length === 0
      ? "Create and assign exams to unlock recruiter-level comments."
      : completionRate >= 80
        ? "Excellent participation. The next improvement area is pass quality and question difficulty balance."
        : completionRate >= 50
          ? "Good activity. Follow up with candidates who have not completed assigned exams."
          : "Completion is the priority. Send reminders and review whether exam duration or difficulty is blocking attempts.";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.4px" }}>Exam Analytics</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
          Compare assigned exams by completion volume, average score, and pass rate.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 14 }}>
        {[
          { label: "Completion Rate", value: `${completionRate}%`, detail: `${totalCompleted} of ${totalAssigned} assignments`, color: "#2563eb", icon: CheckCircle2 },
          { label: "Total Attempts", value: `${totalAttempts}`, detail: "Candidate exam starts", color: "#8b5cf6", icon: Users },
          { label: "Avg Pass Rate", value: `${averagePassRate}%`, detail: "Across active exams", color: "#10b981", icon: Target },
          { label: "Needs Attention", value: attentionExam ? `${Math.round(attentionExam.passRate)}%` : "0%", detail: attentionExam?.title || "No exam data yet", color: "#f97316", icon: BarChart3 },
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
            <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Recruiter Comment</span>
          </div>
          <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.7 }}>{analyticsComment}</p>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>Quality Signals</div>
          <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.7 }}>
            {topExam ? `Best pass rate: ${topExam.title} at ${Math.round(topExam.passRate)}%.` : "Best pass rate will appear after attempts."}
            {" "}
            {attentionExam ? `Review: ${attentionExam.title} has the lowest pass rate.` : ""}
          </p>
        </div>
      </div>

      <div style={panelStyle}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Completion by Exam</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Assigned versus completed attempts across your exams.</div>
        </div>
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={examPerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="title" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="completedCount" name="Completed" fill="#2563eb" radius={[6, 6, 0, 0]} />
              <Bar dataKey="assignedCount" name="Assigned" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <BarChart3 size={16} color="#2563eb" />
          <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Exam Breakdown</span>
        </div>
        {examPerformance.length === 0 ? (
          <div style={{ fontSize: 13, color: "#94a3b8" }}>No exam performance data available yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {examPerformance.map((exam) => (
              <div key={exam.examId} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{exam.title}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                      {exam.completedCount}/{exam.assignedCount} completed • {exam.attemptCount} attempts
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#2563eb" }}>{exam.averageScore}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>avg score</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginTop: 12 }}>
                  <div style={{ background: "#f8fafc", borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{exam.completedCount}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Completed</div>
                  </div>
                  <div style={{ background: "#f8fafc", borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#10b981" }}>{Math.round(exam.passRate)}%</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Pass rate</div>
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

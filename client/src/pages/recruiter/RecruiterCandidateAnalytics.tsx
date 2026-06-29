import { type CSSProperties, useEffect, useState } from "react";
import { CheckCircle2, Clock3, Users } from "lucide-react";
import { recruiterApi } from "@/lib/api";
import type { Attempt, RecruiterCandidatePerformance } from "@/types";

const panelStyle: CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: 20,
};

function statusPill(status: string) {
  if (status === "completed") {
    return { label: "Completed", bg: "#dcfce7", color: "#166534" };
  }
  if (status === "in_progress") {
    return { label: "In Progress", bg: "#dbeafe", color: "#1d4ed8" };
  }
  return { label: "Pending", bg: "#f1f5f9", color: "#475569" };
}

export default function RecruiterCandidateAnalytics() {
  const [candidatePerformance, setCandidatePerformance] = useState<RecruiterCandidatePerformance[]>([]);
  const [recentAttempts, setRecentAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recruiterApi.getDashboard()
      .then(({ data }) => {
        setCandidatePerformance(data.candidatePerformance || []);
        setRecentAttempts(data.recentAttempts || []);
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

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.4px" }}>Candidate Analytics</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
          See candidate rankings, completion behavior, and the latest exam attempt flow.
        </p>
      </div>

      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Users size={16} color="#2563eb" />
          <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Candidate Leaderboard</span>
        </div>
        {candidatePerformance.length === 0 ? (
          <div style={{ fontSize: 13, color: "#94a3b8" }}>No candidate attempt data yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {candidatePerformance.map((candidate, index) => (
              <div key={candidate.candidateId} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                      #{index + 1} {candidate.name}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{candidate.email}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#2563eb" }}>{candidate.averageScore}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>avg score</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginTop: 12 }}>
                  <div style={{ background: "#f8fafc", borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{candidate.attempts}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Attempts</div>
                  </div>
                  <div style={{ background: "#f8fafc", borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#10b981" }}>{candidate.completedAttempts}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Completed</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Clock3 size={16} color="#2563eb" />
          <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Recent Attempts</span>
        </div>
        {recentAttempts.length === 0 ? (
          <div style={{ fontSize: 13, color: "#94a3b8" }}>No attempts recorded yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {recentAttempts.slice(0, 8).map((attempt) => {
              const pill = statusPill(attempt.status);
              return (
                <div key={attempt.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                        {attempt.users?.name || "Candidate"} • {attempt.exams?.title || "Exam"}
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                        Score {attempt.score ?? 0} • {attempt.users?.email || "No email"}
                      </div>
                    </div>
                    <span style={{ background: pill.bg, color: pill.color, borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 700 }}>
                      {pill.label}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: "#64748b" }}>
                    <CheckCircle2 size={13} color="#10b981" />
                    {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : "Still active"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

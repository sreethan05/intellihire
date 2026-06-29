import { type CSSProperties, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Users } from "lucide-react";
import { adminApi } from "@/lib/api";
import type { AdminRecruiterSnapshot } from "@/types";

const panelStyle: CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: 20,
};

export default function AdminRecruiterAnalytics() {
  const [recruiterSnapshots, setRecruiterSnapshots] = useState<AdminRecruiterSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getDashboard()
      .then(({ data }) => {
        setRecruiterSnapshots(data.recruiterSnapshots || []);
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

  const recruiterChartData = recruiterSnapshots.slice(0, 6).map((snapshot) => ({
    name: snapshot.name.split(" ")[0],
    Candidates: snapshot.candidateCount,
    Exams: snapshot.examCount,
    Attempts: snapshot.attemptCount,
  }));

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.4px" }}>Recruiter Analytics</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
          Compare recruiter output, assignment reach, and exam delivery volume.
        </p>
      </div>

      <div style={panelStyle}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Recruiter Output Comparison</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Top recruiters by candidate, exam, and attempt volume.</div>
        </div>
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={recruiterChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="Candidates" fill="#2563eb" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Exams" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Attempts" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Users size={16} color="#2563eb" />
          <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Recruiter Watchlist</span>
        </div>
        {recruiterSnapshots.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 13 }}>No recruiter records available yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {recruiterSnapshots.map((snapshot) => (
              <div key={snapshot.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{snapshot.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{snapshot.email}</div>
                  </div>
                  <span style={{ fontSize: 12, color: "#2563eb", fontWeight: 700 }}>
                    {snapshot.completedCount}/{snapshot.attemptCount || 0} completed
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 12 }}>
                  {[
                    { label: "Candidates", value: snapshot.candidateCount },
                    { label: "Exams", value: snapshot.examCount },
                    { label: "Attempts", value: snapshot.attemptCount },
                    { label: "Completed", value: snapshot.completedCount },
                  ].map((metric) => (
                    <div key={metric.label} style={{ background: "#f8fafc", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{metric.value}</div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{metric.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

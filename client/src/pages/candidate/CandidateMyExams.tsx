import { type CSSProperties, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Award, CheckCircle, Clock, FileText, Lock, Target, Video } from "lucide-react";
import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { candidateApi, proctoringApi } from "@/lib/api";
import type { DashboardStats, ExamAssignment } from "@/types";

const PIE_COLORS = ["#10b981", "#2563eb", "#f59e0b"];

const panelStyle: CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: 20,
};

function getStatus(assignment: ExamAssignment) {
  if (assignment.attempts && assignment.attempts.length > 0) {
    const latestAttempt = assignment.attempts[0];
    if (latestAttempt.status === "completed") {
      return { label: "Completed", bg: "#dcfce7", color: "#166534", icon: CheckCircle };
    }
    if (latestAttempt.status === "in_progress") {
      return { label: "In Progress", bg: "#dbeafe", color: "#1d4ed8", icon: Clock };
    }
  }

  return { label: "Not Started", bg: "#f1f5f9", color: "#475569", icon: AlertCircle };
}

function getAvailability(assignment: ExamAssignment) {
  const now = Date.now();
  const from = assignment.exam.available_from ? new Date(assignment.exam.available_from).getTime() : null;
  const until = assignment.exam.available_until ? new Date(assignment.exam.available_until).getTime() : null;

  if (from && from > now) {
    return {
      canAttempt: false,
      label: `Opens ${new Date(from).toLocaleString()}`,
      action: "Not Open Yet",
    };
  }

  if (until && until < now) {
    return {
      canAttempt: false,
      label: `Closed ${new Date(until).toLocaleString()}`,
      action: "Window Closed",
    };
  }

  return {
    canAttempt: true,
    label: from ? `Open from ${new Date(from).toLocaleString()}` : "Open now",
    action: "",
  };
}

export default function CandidateMyExams() {
  const [assignments, setAssignments] = useState<ExamAssignment[]>([]);
  const [stats, setStats] = useState<DashboardStats>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    candidateApi.getDashboard()
      .then(({ data }) => {
        setAssignments(data.assignments || []);
        setStats(data.stats || {});
      })
      .finally(() => setLoading(false));
  }, []);

  const [activeAttemptIdForTimeline, setActiveAttemptIdForTimeline] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    if (activeAttemptIdForTimeline) {
      setTimelineLoading(true);
      proctoringApi.getTimeline(activeAttemptIdForTimeline)
        .then(({ data }) => {
          setTimelineEvents(data.timeline || []);
        })
        .catch(err => {
          console.error("Failed to load proctoring logs:", err);
        })
        .finally(() => setTimelineLoading(false));
    } else {
      setTimelineEvents([]);
    }
  }, [activeAttemptIdForTimeline]);

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ height: 260, borderRadius: 16, background: "#e2e8f0", animation: "pulse 1.5s infinite" }} />
        <div style={{ height: 320, borderRadius: 16, background: "#e2e8f0", animation: "pulse 1.5s infinite" }} />
      </div>
    );
  }

  const progressMix = [
    { label: "Completed", value: stats.completed || 0 },
    { label: "In Progress", value: stats.inProgress || 0 },
    { label: "Pending", value: stats.pending || 0 },
  ];

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.4px" }}>My Exams</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
          Browse assigned exams, resume active ones, and track completion status.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(320px,0.8fr)", gap: 16 }}>
        <div style={panelStyle}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>Assignment Progress</div>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
            {stats.completed || 0} of {stats.assigned || 0} assigned exams are completed.
          </p>
          <div style={{ height: 12, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.min(stats.completionRate || 0, 100)}%`,
                height: "100%",
                background: "linear-gradient(90deg,#2563eb,#4f46e5)",
              }}
            />
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "#2563eb", fontWeight: 700 }}>
            {Math.round(stats.completionRate || 0)}% completed
          </div>
        </div>

        <div style={panelStyle}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>Exam Status Mix</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={progressMix} dataKey="value" nameKey="label" innerRadius={55} outerRadius={84} paddingAngle={4}>
                  {progressMix.map((item, index) => (
                    <Cell key={item.label} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {assignments.length === 0 ? (
        <div style={{ ...panelStyle, textAlign: "center", padding: "56px 20px" }}>
          <FileText size={40} color="#cbd5e1" style={{ margin: "0 auto 12px" }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: "#334155", marginBottom: 4 }}>No exams assigned yet</p>
          <p style={{ fontSize: 13, color: "#94a3b8" }}>Your recruiter will assign exams here when they are ready.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
          {assignments.map((assignment) => {
            const status = getStatus(assignment);
            const StatusIcon = status.icon;
            const latestAttempt = assignment.attempts?.[0];
            const isCompleted = status.label === "Completed";
            const isInProgress = status.label === "In Progress";
            const score = latestAttempt?.score ?? 0;
            const qualifiedForInterview = isCompleted && score >= assignment.exam.pass_marks;
            const availability = getAvailability(assignment);

            return (
              <div key={assignment.id} style={{ ...panelStyle, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <FileText size={18} color="#2563eb" />
                  </div>
                  <span style={{ background: status.bg, color: status.color, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, display: "flex", alignItems: "center", gap: 4 }}>
                    <StatusIcon size={11} />
                    {status.label}
                  </span>
                </div>

                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", lineHeight: 1.3 }}>{assignment.exam.title}</h3>
                  <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, marginTop: 6 }}>
                    {assignment.exam.description || "No description provided for this exam."}
                  </p>
                </div>

                <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={12} />
                    {assignment.exam.duration} min
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Target size={12} />
                    {assignment.exam.pass_marks} pass mark
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Award size={12} />
                    {assignment.exam.total_marks} total
                  </span>
                </div>

                {!isCompleted && (
                  <div style={{ background: availability.canAttempt ? "#ecfdf5" : "#fff7ed", border: `1px solid ${availability.canAttempt ? "#bbf7d0" : "#fed7aa"}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, fontWeight: 700, color: availability.canAttempt ? "#166534" : "#c2410c" }}>
                    {availability.label}
                  </div>
                )}

                {isCompleted ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                          Score {score}/{assignment.exam.total_marks}
                        </span>
                        <span style={{ fontSize: 12, color: qualifiedForInterview ? "#166534" : "#b91c1c", fontWeight: 700 }}>
                          {Math.round((score / assignment.exam.total_marks) * 100)}%
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => latestAttempt && setActiveAttemptIdForTimeline(latestAttempt.id)}
                      style={{
                        padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "white",
                        fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#475569", display: "flex", alignItems: "center", justifyContent: "center", gap: 5
                      }}
                    >
                      <Video size={13} />
                      View Proctoring Logs
                    </button>
                    {qualifiedForInterview ? (
                      <button
                        onClick={() => navigate("/candidate/interview")}
                        style={{
                          padding: "11px 16px",
                          borderRadius: 10,
                          border: "none",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                          background: "linear-gradient(135deg,#059669,#2563eb)",
                          color: "white",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                        }}
                      >
                        Attempt AI Interview
                        <Video size={14} />
                      </button>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #fed7aa", borderRadius: 10, background: "#fff7ed", color: "#c2410c", padding: "10px 12px", fontSize: 12, fontWeight: 700 }}>
                        <Lock size={13} />
                        Interview unlocks only after meeting the pass mark.
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => navigate(`/candidate/exam/${assignment.exam_id}`)}
                    disabled={!availability.canAttempt}
                    style={{
                      padding: "11px 16px",
                      borderRadius: 10,
                      border: "none",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: availability.canAttempt ? "pointer" : "not-allowed",
                      background: !availability.canAttempt ? "#cbd5e1" : isInProgress ? "linear-gradient(135deg,#f59e0b,#d97706)" : "linear-gradient(135deg,#2563eb,#4f46e5)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {!availability.canAttempt ? availability.action : isInProgress ? "Continue Exam" : "Start Exam"}
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Self-Proctoring Review Modal */}
      {activeAttemptIdForTimeline && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)"
        }}>
          <div style={{
            background: "white", borderRadius: 16, width: "100%", maxWidth: 500,
            display: "flex", flexDirection: "column", maxHeight: "85vh", border: "1px solid #e2e8f0", boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)"
          }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>Proctoring Compliance Logs</h3>
                <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Review webcam proctoring check events and security alerts.</p>
              </div>
              <button
                onClick={() => setActiveAttemptIdForTimeline(null)}
                style={{ background: "none", border: "none", fontSize: 18, color: "#94a3b8", cursor: "pointer", fontWeight: "bold" }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
              {timelineLoading ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b", fontSize: 13 }}>
                  Fetching compliance records...
                </div>
              ) : timelineEvents.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: 13 }}>
                  No proctoring logs found for this attempt.
                </div>
              ) : (
                <div style={{ borderLeft: "2px solid #e2e8f0", paddingLeft: 16, display: "flex", flexDirection: "column", gap: 20 }}>
                  {timelineEvents.map((evt, idx) => {
                    const isViolation = evt.event_type === "violation";
                    const isCamera = evt.event_type === "camera_check";
                    return (
                      <div key={idx} style={{ position: "relative" }}>
                        <span style={{
                          position: "absolute", left: -21, top: 4, borderRadius: "50%",
                          background: isViolation ? "#ef4444" : isCamera ? "#8b5cf6" : "#10b981",
                          border: "2px solid white", width: 10, height: 10
                        }} />
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{
                            fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase",
                            background: isViolation ? "#fee2e2" : isCamera ? "#ede9fe" : "#dcfce7",
                            color: isViolation ? "#991b1b" : isCamera ? "#5b21b6" : "#15803d"
                          }}>
                            {evt.event_type}
                          </span>
                          <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                            Time: {evt.relativeTime}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: "#334155", marginTop: 4, fontWeight: isViolation ? 600 : 400 }}>
                          {evt.message || (isCamera ? "Webcam validation passed" : "System state snapshot captured")}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", textAlign: "right" }}>
              <button
                onClick={() => setActiveAttemptIdForTimeline(null)}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "1px solid #d1d5db", background: "white",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#374151"
                }}
              >
                Close Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { recruiterApi, examApi } from "@/lib/api";
import { toast } from "sonner";
import { Search, UserCheck } from "lucide-react";
import type { User, Exam } from "@/types";

export default function ViewCandidates() {
  const [candidates, setCandidates] = useState<User[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState("");
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([recruiterApi.getCandidates(), examApi.getExams()])
      .then(([cRes, eRes]) => {
        setCandidates(cRes.data.candidates || []);
        setExams(eRes.data.exams || []);
      }).finally(() => setLoading(false));
  }, []);

  const toggleCandidate = (id: string) => {
    const updated = new Set(selectedCandidates);
    if (updated.has(id)) updated.delete(id); else updated.add(id);
    setSelectedCandidates(updated);
  };

  const handleAssign = async () => {
    if (!selectedExam || selectedCandidates.size === 0) { toast.error("Select an exam and at least one candidate"); return; }
    setAssigning(true);
    try {
      const res = await examApi.assignExam({ exam_id: selectedExam, candidate_ids: Array.from(selectedCandidates) });
      toast.success(res.data?.message || "Exam assigned successfully!");
      setSelectedCandidates(new Set()); setSelectedExam("");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to assign exam");
    } finally { setAssigning(false); }
  };

  const filtered = candidates.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  );

  const avatarColors = ["#dbeafe","#dcfce7","#fce7f3","#fef3c7","#ede9fe"];
  const textColors =  ["#1e40af","#166534","#9d174d","#92400e","#5b21b6"];
  const initials = (name: string) => name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  if (loading) return (
    <div>
      <div style={{ height: 110, background: "#e2e8f0", borderRadius: 12, marginBottom: 16, animation: "pulse 1.5s infinite" }} />
      <div style={{ height: 300, background: "#e2e8f0", borderRadius: 12, animation: "pulse 1.5s infinite" }} />
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" }}>Manage Candidates</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>Select candidates and assign them to an exam.</p>
      </div>

      {/* Assign toolbar */}
      <div style={{ background: "white", borderRadius: 12, border: "1px solid #e8ecf0", padding: "18px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <select
          value={selectedExam} onChange={e => setSelectedExam(e.target.value)}
          style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, fontFamily: "Inter,sans-serif", color: selectedExam ? "#0f172a" : "#94a3b8", minWidth: 260, outline: "none" }}
        >
          <option value="">Select an exam to assign…</option>
          {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <button
          onClick={handleAssign}
          disabled={assigning || !selectedExam || selectedCandidates.size === 0}
          style={{
            padding: "10px 18px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700,
            fontFamily: "Inter,sans-serif", cursor: (assigning || !selectedExam || selectedCandidates.size === 0) ? "not-allowed" : "pointer",
            background: (assigning || !selectedExam || selectedCandidates.size === 0) ? "#e2e8f0" : "linear-gradient(135deg,#3b82f6,#6366f1)",
            color: (assigning || !selectedExam || selectedCandidates.size === 0) ? "#94a3b8" : "white",
            display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s"
          }}
        >
          <UserCheck size={14} />
          {assigning ? "Assigning..." : selectedCandidates.size > 0 ? `Assign to ${selectedCandidates.size} candidate(s)` : "Assign Exam"}
        </button>
        {selectedCandidates.size > 0 && (
          <span style={{ fontSize: 12, color: "#3b82f6", fontWeight: 600 }}>{selectedCandidates.size} selected</span>
        )}
      </div>

      {/* Candidates table */}
      <div style={{ background: "white", borderRadius: 12, border: "1px solid #e8ecf0", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", flex: 1 }}>Candidates ({candidates.length})</span>
          <div style={{ position: "relative" }}>
            <Search size={14} color="#94a3b8" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input
              placeholder="Search candidates…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ padding: "8px 10px 8px 30px", borderRadius: 8, border: "1px solid #e8ecf0", fontSize: 13, fontFamily: "Inter,sans-serif", outline: "none", width: 220 }}
            />
          </div>
          <button
            onClick={() => {
              if (selectedCandidates.size === filtered.length) setSelectedCandidates(new Set());
              else setSelectedCandidates(new Set(filtered.map(c => c.id)));
            }}
            style={{ padding: "7px 12px", borderRadius: 7, border: "1px solid #e8ecf0", background: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Inter,sans-serif", color: "#374151" }}
          >
            {selectedCandidates.size === filtered.length && filtered.length > 0 ? "Deselect all" : "Select all"}
          </button>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            {search ? "No candidates match your search." : "No candidates yet. Create some first!"}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ width: 48, padding: "11px 16px", borderBottom: "1px solid #e8ecf0" }}></th>
                {["Name","Email","Actions"].map(h => (
                  <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid #e8ecf0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((candidate, idx) => {
                const checked = selectedCandidates.has(candidate.id);
                const ci = idx % 5;
                return (
                  <tr key={candidate.id}
                    style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer", background: checked ? "#eff6ff" : "transparent" }}
                    onClick={() => toggleCandidate(candidate.id)}
                    onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = "#f8fafc"; }}
                    onMouseLeave={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: 4, border: checked ? "none" : "1.5px solid #d1d5db",
                        background: checked ? "#3b82f6" : "transparent", display: "flex", alignItems: "center", justifyContent: "center"
                      }}>
                        {checked && <span style={{ color: "white", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                      </div>
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: avatarColors[ci], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: textColors[ci], flexShrink: 0 }}>
                          {initials(candidate.name)}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{candidate.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "13px 16px", fontSize: 13, color: "#64748b" }}>{candidate.email}</td>
                    <td style={{ padding: "13px 16px" }}>
                      <span style={{ fontSize: 12, color: checked ? "#3b82f6" : "#94a3b8", fontWeight: 600 }}>
                        {checked ? "Selected" : "Click to select"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
import { useState } from "react";
import { recruiterApi } from "@/lib/api";
import { toast } from "sonner";
import { UserPlus, Mail, Lock, User } from "lucide-react";

export default function CreateCandidate() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await recruiterApi.createCandidate({ name, email, password });
      toast.success("Candidate created successfully!");
      setName(""); setEmail(""); setPassword("");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to create candidate");
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" }}>Create Candidate</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>Register a new candidate for assessments.</p>
      </div>
      <div style={{ maxWidth: 520 }}>
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #e8ecf0", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 8 }}>
            <UserPlus size={16} color="#3b82f6" />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Candidate Details</span>
          </div>
          <form onSubmit={handleSubmit} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
            {[
              { label: "Full Name", icon: User, value: name, setter: setName, type: "text", placeholder: "John Doe" },
              { label: "Email Address", icon: Mail, value: email, setter: setEmail, type: "email", placeholder: "john@email.com" },
              { label: "Password", icon: Lock, value: password, setter: setPassword, type: "password", placeholder: "Minimum 8 characters" },
            ].map(({ label, icon: Icon, value, setter, type, placeholder }) => (
              <div key={label}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>{label}</label>
                <div style={{ position: "relative" }}>
                  <Icon size={14} color="#94a3b8" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
                  <input
                    type={type} required value={value} onChange={e => setter(e.target.value)} placeholder={placeholder}
                    style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, fontFamily: "Inter,sans-serif", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => e.target.style.borderColor = "#3b82f6"}
                    onBlur={e => e.target.style.borderColor = "#d1d5db"}
                  />
                </div>
              </div>
            ))}
            <button type="submit" disabled={loading} style={{
              padding: "11px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700,
              fontFamily: "Inter,sans-serif", cursor: loading ? "not-allowed" : "pointer",
              background: loading ? "#93c5fd" : "linear-gradient(135deg,#3b82f6,#6366f1)", color: "white", marginTop: 4
            }}>
              {loading ? "Creating..." : "Create Candidate"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

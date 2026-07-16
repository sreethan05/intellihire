import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/context/AuthContext";
import { authApi } from "@/lib/api";
import { AlertCircle } from "lucide-react";

const TABS = [
  {
    key: "admin",
    label: "Admin",
    title: "Admin Login",
    subtitle: "Platform owner access",
    placeholder: "Enter admin username",
  },
  {
    key: "candidate",
    label: "Student",
    title: "Student Login",
    subtitle: "Campus candidate access",
    placeholder: "Enter student email",
  },
  {
    key: "tpo",
    label: "TPO",
    title: "TPO Login",
    subtitle: "Training & Placement Officer access",
    placeholder: "Enter TPO email",
  },
  {
    key: "recruiter",
    label: "Recruiter",
    title: "Recruiter Login",
    subtitle: "Company recruiter access",
    placeholder: "Enter recruiter email",
  },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function Login() {
  const [activeTab, setActiveTab] = useState<TabKey>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const currentTab = TABS.find((t) => t.key === activeTab)!;

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
    setEmail("");
    setPassword("");
    setError("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await authApi.login(email, password);
      login(data.token, data.user);
      if (data.user.role === "admin") navigate("/admin/dashboard");
      else if (data.user.role === "tpo") navigate("/tpo/dashboard");
      else if (data.user.role === "recruiter") navigate("/recruiter/dashboard");
      else if (data.user.must_change_password || data.user.profile_complete === false)
        navigate("/candidate/onboarding");
      else navigate("/candidate/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.error || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center p-6 text-slate-200"
      style={{ background: "radial-gradient(circle at top left, #1e1b4b 0%, #0f172a 60%, #020617 100%)" }}
    >
      {/* Header */}
      <div className="mb-8 text-center animate-in fade-in duration-500">
        <h1 className="text-6xl font-black tracking-tight text-white bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">IntelliHire</h1>
        <p className="mt-3 text-[14px] font-bold uppercase tracking-widest text-slate-400">
          AI-Powered Campus Recruitment Platform
        </p>
      </div>

      {/* Tab switcher — glassmorphic pill bar */}
      <div className="mb-6 flex rounded-full border border-slate-800 bg-slate-950/40 p-1 backdrop-blur-md shadow-inner">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleTabChange(tab.key)}
            className={`rounded-full px-6 py-2 text-xs font-black uppercase tracking-wider transition-all duration-200 ${
              activeTab === tab.key
                ? "bg-blue-600 text-white shadow shadow-blue-600/20"
                : "text-slate-450 text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Login card */}
      <div className="w-full max-w-[460px] rounded-2xl border border-slate-800 bg-slate-900/30 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="mb-6">
          <h2 className="text-2xl font-black text-white tracking-tight">{currentTab.title}</h2>
          <p className="mt-1 text-xs text-blue-400 font-bold uppercase tracking-wider">{currentTab.subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-400">
              <AlertCircle className="h-4.5 w-4.5 shrink-0 text-rose-400" />
              {error}
            </div>
          )}

          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-400">
              Username or Email
            </label>
            <input
              type="text"
              name="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={currentTab.placeholder}
              className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950/40 px-4 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-400">Password</label>
            <input
              type="password"
              name="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950/40 px-4 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 h-12 w-full rounded-xl text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/15 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 bg-gradient-to-r from-blue-600 to-indigo-600"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

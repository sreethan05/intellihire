import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { authApi } from "@/lib/api";
import { AlertCircle, Brain, ShieldCheck, Sparkles } from "lucide-react";

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
      className="flex min-h-screen flex-col items-center justify-center p-6"
      style={{ background: "linear-gradient(135deg,#0f172a 0%,#172554 55%,#064e3b 100%)" }}
    >
      {/* Header */}
      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white shadow-lg backdrop-blur">
          <Brain className="h-7 w-7" />
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight text-white">IntelliHire</h1>
        <p className="mt-3 text-[15px] font-normal text-slate-400">
          AI-Powered Campus Recruitment Platform
        </p>
      </div>

      {/* Tab switcher — white pill bar */}
      <div className="mb-5 flex rounded-full border border-slate-300 bg-white px-1.5 py-1.5 shadow-sm">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleTabChange(tab.key)}
            className={`rounded-full px-7 py-2 text-sm font-semibold transition-all duration-200 ${
              activeTab === tab.key
                ? "bg-[#131c2e] text-white shadow"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid w-full max-w-[460px] grid-cols-2 gap-3">
        <div className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-white backdrop-blur">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-emerald-100">
            <ShieldCheck className="h-4 w-4" />
            Secure Login
          </div>
          <div className="mt-1 text-xs text-slate-200">JWT and bcrypt protected</div>
        </div>
        <div className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-white backdrop-blur">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-blue-100">
            <Sparkles className="h-4 w-4" />
            Role Based
          </div>
          <div className="mt-1 text-xs text-slate-200">Admin, TPO, recruiter, student</div>
        </div>
      </div>

      {/* Login card */}
      <div className="w-full max-w-[460px] rounded-xl bg-white p-8 shadow-xl">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">{currentTab.title}</h2>
          <p className="mt-1 text-sm text-blue-500">{currentTab.subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-800">
              Username or Email
            </label>
            <input
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={currentTab.placeholder}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-800">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-1 h-12 w-full rounded-xl text-sm font-bold text-white shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: "#131c2e" }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

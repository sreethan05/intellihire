import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/context/AuthContext";
import { authApi } from "@/lib/api";
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  Mail,
  Shield,
  Sparkles,
} from "lucide-react";

interface RoleConfig {
  key: "admin" | "candidate" | "tpo" | "recruiter";
  label: string;
  badge: string;
  title: string;
  subtitle: string;
  placeholder: string;
  defaultEmail: string;
  icon: typeof Shield;
  accent: string;
}

const ROLES: RoleConfig[] = [
  {
    key: "admin",
    label: "Admin",
    badge: "Platform Governance",
    title: "System Control",
    subtitle: "Enterprise administration & global audits",
    placeholder: "admin@intellihire.com",
    defaultEmail: "admin@intellihire.com",
    icon: Shield,
    accent: "from-blue-500 to-indigo-600",
  },
  {
    key: "candidate",
    label: "Student",
    badge: "Campus Candidate",
    title: "Student Portal",
    subtitle: "Exams, Monaco sandbox & certificates",
    placeholder: "candidate@intellihire.com",
    defaultEmail: "candidate@intellihire.com",
    icon: GraduationCap,
    accent: "from-emerald-500 to-teal-600",
  },
  {
    key: "tpo",
    label: "TPO",
    badge: "Placement Cell",
    title: "Placement Hub",
    subtitle: "Student directory & bulk OCR verification",
    placeholder: "tpo@intellihire.com",
    defaultEmail: "tpo@intellihire.com",
    icon: Building2,
    accent: "from-amber-500 to-orange-600",
  },
  {
    key: "recruiter",
    label: "Recruiter",
    badge: "Talent Acquisition",
    title: "Recruiter Suite",
    subtitle: "Live drive proctoring & talent assessment",
    placeholder: "recruiter@intellihire.com",
    defaultEmail: "recruiter@intellihire.com",
    icon: Briefcase,
    accent: "from-purple-500 to-pink-600",
  },
];

type RoleKey = RoleConfig["key"];

export default function Login() {
  const navigate = useNavigate();
  const [activeRole, setActiveRole] = useState<RoleKey>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const currentRole = ROLES.find((r) => r.key === activeRole)!;
  const RoleIcon = currentRole.icon;

  const handleRoleChange = (key: RoleKey) => {
    setActiveRole(key);
    setError("");
  };

  const handleAutofill = (role: RoleConfig) => {
    setActiveRole(role.key);
    setEmail(role.defaultEmail);
    setPassword("admin123");
    setError("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await authApi.login(email, password);
      login(data.token, data.user);
      const role = data.user.role;
      const target =
        role === "admin"
          ? "/admin/overview"
          : role === "tpo"
          ? "/tpo/overview"
          : role === "recruiter"
          ? "/recruiter/overview"
          : data.user.must_change_password || data.user.profile_complete === false
          ? "/candidate/onboarding"
          : "/candidate/overview";
      navigate(target, { replace: true });
    } catch (err: unknown) {
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Invalid credentials. Please try again."
          : "Invalid credentials. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#0a0d14] text-slate-100 flex flex-col justify-center selection:bg-blue-500 selection:text-white">
      {/* Dynamic Background Mesh Gradients */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[520px] w-[520px] rounded-full bg-blue-600/15 blur-[120px]" />
        <div className="absolute -bottom-40 right-1/4 h-[520px] w-[520px] rounded-full bg-indigo-600/15 blur-[140px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[700px] w-[700px] rounded-full bg-violet-600/10 blur-[160px]" />
        {/* Subtle dot matrix pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          
          {/* Left Column: Branding, Product Highlights & Value Prop */}
          <div className="lg:col-span-6 xl:col-span-7 flex flex-col justify-center">
            {/* Live Status Pill */}
            <div className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-400 backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span>IntelliHire v2.4 • Production Ready</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl xl:text-6xl">
              Next-Gen{" "}
              <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-violet-400 bg-clip-text text-transparent">
                Technical Hiring
              </span>{" "}
              & Campus Placement.
            </h1>

            <p className="mt-5 max-w-xl text-base text-slate-400 sm:text-lg leading-relaxed">
              Standardize technical assessments with automated anti-cheat proctoring,
              multi-language sandboxes, and instantaneous verifiable credentials.
            </p>

            {/* Feature Cards Grid */}
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="group rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4.5 backdrop-blur-xl transition duration-300 hover:border-slate-700 hover:bg-slate-900/60">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200">Anti-Cheat Proctoring</h2>
                    <p className="text-xs text-slate-400">Webcam telemetry & tab-blur detection</p>
                  </div>
                </div>
              </div>

              <div className="group rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4.5 backdrop-blur-xl transition duration-300 hover:border-slate-700 hover:bg-slate-900/60">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200">Monaco Code Sandbox</h2>
                    <p className="text-xs text-slate-400">Python, C++, Java, JS with diffing</p>
                  </div>
                </div>
              </div>

              <div className="group rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4.5 backdrop-blur-xl transition duration-300 hover:border-slate-700 hover:bg-slate-900/60">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200">TPO Readiness Engine</h2>
                    <p className="text-xs text-slate-400">OCR marksheets & conflict resolution</p>
                  </div>
                </div>
              </div>

              <div className="group rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4.5 backdrop-blur-xl transition duration-300 hover:border-slate-700 hover:bg-slate-900/60">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200">AI-Assisted Evaluation</h2>
                    <p className="text-xs text-slate-400">Groq LLM question & voice synthesis</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Demo Autofill Chips Bar */}
            <div className="mt-8 pt-6 border-t border-slate-800/60">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-3">
                Quick 1-Click Demo Accounts:
              </span>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((role) => (
                  <button
                    key={role.key}
                    type="button"
                    onClick={() => handleAutofill(role)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-blue-500/50 hover:bg-slate-800 hover:text-white"
                  >
                    <role.icon className="h-3.5 w-3.5 text-blue-400" />
                    <span>Fill {role.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Modern Glassmorphic Login Card */}
          <div className="lg:col-span-6 xl:col-span-5">
            <div className="relative rounded-3xl border border-slate-800/90 bg-slate-900/60 p-6 sm:p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-2xl">
              
              {/* Subtle Card Header Ambient Glow */}
              <div className="absolute -top-10 right-10 -z-10 h-32 w-32 rounded-full bg-blue-500/20 blur-3xl" />

              {/* Role Selector Tabs */}
              <div className="mb-6">
                <div className="grid grid-cols-4 gap-1.5 rounded-2xl border border-slate-800 bg-slate-950/70 p-1.5">
                  {ROLES.map((role) => {
                    const Icon = role.icon;
                    const isActive = activeRole === role.key;
                    return (
                      <button
                        key={role.key}
                        type="button"
                        onClick={() => handleRoleChange(role.key)}
                        className={`group relative flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-center transition duration-200 ${
                          isActive
                            ? "bg-gradient-to-b from-slate-800 to-slate-900 text-white shadow-md border border-slate-700/60"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 transition duration-200 ${
                            isActive ? "text-blue-400 scale-110" : "text-slate-400 group-hover:text-slate-300"
                          }`}
                        />
                        <span className="text-[11px] font-semibold tracking-tight">{role.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form Title & Context Badge */}
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                    {currentRole.title}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">{currentRole.subtitle}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400">
                  <RoleIcon className="h-5 w-5" />
                </div>
              </div>

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Error Banner */}
                {error && (
                  <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                    <span className="leading-snug">{error}</span>
                  </div>
                )}

                {/* Email / Username Input */}
                <div>
                  <label
                    htmlFor="login-email"
                    className="mb-1.5 block text-xs font-medium text-slate-300"
                  >
                    Email or Username
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      id="login-email"
                      name="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={currentRole.placeholder}
                      className="block h-11 w-full rounded-xl border border-slate-800 bg-slate-950/60 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-400 transition focus:border-blue-500 focus:bg-slate-950 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Password
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Demo: <code className="text-blue-400 font-mono">admin123</code>
                    </span>
                  </div>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      id="login-password"
                      name="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="block h-11 w-full rounded-xl border border-slate-800 bg-slate-950/60 pl-10 pr-11 text-sm text-slate-100 placeholder:text-slate-400 transition focus:border-blue-500 focus:bg-slate-950 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-200 transition"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Submit Action Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 bg-[length:200%_auto] font-semibold text-sm text-white shadow-lg shadow-blue-500/20 transition-all duration-300 hover:bg-[position:right_center] hover:shadow-blue-500/35 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Authenticating...</span>
                    </div>
                  ) : (
                    <>
                      <span>Sign In to {currentRole.label}</span>
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </form>

              {/* Security & Verification Guarantee Footer */}
              <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 border-t border-slate-800/60 pt-4">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>256-Bit Encrypted Session • RBAC Protected</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

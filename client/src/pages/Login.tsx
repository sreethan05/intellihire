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
    <div className="relative min-h-screen w-full bg-slate-50 text-slate-900 flex flex-col justify-center selection:bg-blue-600 selection:text-white">
      {/* Background Decorative Soft Gradients & Pattern */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-[500px] w-[500px] rounded-full bg-blue-100/70 blur-[100px]" />
        <div className="absolute -bottom-32 right-1/4 h-[500px] w-[500px] rounded-full bg-indigo-100/60 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          
          {/* Left Column: Branding & Feature Highlights */}
          <div className="lg:col-span-6 xl:col-span-7 flex flex-col justify-center">
            {/* Logo & Platform Name */}
            <div className="mb-4 inline-flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <span className="text-2xl font-black tracking-tight text-slate-900">IntelliHire</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl xl:text-6xl leading-[1.15]">
              Next-Gen{" "}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
                Technical Hiring
              </span>{" "}
              & Campus Placement.
            </h1>

            <p className="mt-5 max-w-xl text-base text-slate-600 sm:text-lg leading-relaxed">
              Standardize technical assessments with automated anti-cheat proctoring,
              multi-language sandboxes, and instantaneous verifiable credentials.
            </p>

            {/* Feature Cards Grid (Clean Light Style) */}
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="group rounded-2xl border border-slate-200/90 bg-white/80 p-4.5 shadow-sm backdrop-blur-md transition duration-200 hover:border-slate-300 hover:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Anti-Cheat Proctoring</h2>
                    <p className="text-xs text-slate-500">Webcam telemetry & tab-blur detection</p>
                  </div>
                </div>
              </div>

              <div className="group rounded-2xl border border-slate-200/90 bg-white/80 p-4.5 shadow-sm backdrop-blur-md transition duration-200 hover:border-slate-300 hover:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Monaco Code Sandbox</h2>
                    <p className="text-xs text-slate-500">Python, C++, Java, JS with diffing</p>
                  </div>
                </div>
              </div>

              <div className="group rounded-2xl border border-slate-200/90 bg-white/80 p-4.5 shadow-sm backdrop-blur-md transition duration-200 hover:border-slate-300 hover:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">TPO Readiness Engine</h2>
                    <p className="text-xs text-slate-500">OCR marksheets & conflict resolution</p>
                  </div>
                </div>
              </div>

              <div className="group rounded-2xl border border-slate-200/90 bg-white/80 p-4.5 shadow-sm backdrop-blur-md transition duration-200 hover:border-slate-300 hover:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">AI-Assisted Evaluation</h2>
                    <p className="text-xs text-slate-500">Groq LLM question & voice synthesis</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Clean White Card with Role Switcher & Form */}
          <div className="lg:col-span-6 xl:col-span-5">
            <div className="relative rounded-3xl border border-slate-200/90 bg-white p-7 sm:p-9 shadow-xl shadow-slate-200/60">
              
              {/* Role Selector Tabs */}
              <div className="mb-6">
                <div className="grid grid-cols-4 gap-1.5 rounded-2xl border border-slate-200 bg-slate-100/80 p-1.5">
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
                            ? "bg-white text-blue-600 shadow-sm font-semibold border border-slate-200/60"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 transition duration-200 ${
                            isActive ? "text-blue-600 scale-110" : "text-slate-500 group-hover:text-slate-700"
                          }`}
                        />
                        <span className="text-[11px] tracking-tight">{role.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form Title & Context Badge */}
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">
                    {currentRole.title}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">{currentRole.subtitle}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
                  <RoleIcon className="h-5 w-5" />
                </div>
              </div>

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Error Banner */}
                {error && (
                  <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                    <span className="leading-snug">{error}</span>
                  </div>
                )}

                {/* Email / Username Input */}
                <div>
                  <label
                    htmlFor="login-email"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
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
                      className="block h-11 w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Password
                    </label>
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
                      className="block h-11 w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-11 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 transition"
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
                  className="group relative mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 font-semibold text-sm text-white shadow-md shadow-blue-600/20 transition-all duration-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
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
              <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-500 border-t border-slate-100 pt-4">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>256-Bit Encrypted Session • Enterprise RBAC Protected</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

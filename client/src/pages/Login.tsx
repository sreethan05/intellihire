import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { authApi } from "@/lib/api";
import { GradientText, Stagger, StaggerItem } from "@/components/motion/primitives";
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
    title: "Admin Login",
    subtitle: "Enterprise administration & global audits",
    placeholder: "Enter admin username",
    defaultEmail: "admin@intellihire.com",
    icon: Shield,
  },
  {
    key: "candidate",
    label: "Student",
    badge: "Campus Candidate",
    title: "Student Login",
    subtitle: "Exams, Monaco sandbox & certificates",
    placeholder: "Enter student email",
    defaultEmail: "candidate@intellihire.com",
    icon: GraduationCap,
  },
  {
    key: "tpo",
    label: "TPO",
    badge: "Placement Cell",
    title: "TPO Login",
    subtitle: "Student directory & bulk OCR verification",
    placeholder: "Enter TPO email",
    defaultEmail: "tpo@intellihire.com",
    icon: Building2,
  },
  {
    key: "recruiter",
    label: "Recruiter",
    badge: "Talent Acquisition",
    title: "Recruiter Login",
    subtitle: "Live drive proctoring & talent assessment",
    placeholder: "Enter recruiter email",
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
    <div className="relative min-h-screen w-full bg-[#FAF9F6] text-slate-900 flex flex-col justify-center selection:bg-emerald-600 selection:text-white">
      {/* Background Decorative Soft Gradients & Pattern */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-[500px] w-[500px] rounded-full bg-emerald-100/60 blur-[100px]" />
        <div className="absolute -bottom-32 right-1/4 h-[500px] w-[500px] rounded-full bg-teal-100/60 blur-[120px]" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">

          {/* Left Column: dark navy hero panel with branding & features */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="relative overflow-hidden hero-theme rounded-3xl border border-slate-200 dark:border-slate-800 p-8 sm:p-10 lg:col-span-6 xl:col-span-7 flex flex-col justify-center min-h-[560px] shadow-[0_10px_35px_-18px_rgba(15,23,42,0.18)] dark:shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]"
          >
            <div aria-hidden className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 rounded-full bg-emerald-400/15 blur-3xl animate-float-slow" />
            <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-teal-500/15 blur-3xl" />

            <div className="relative">
              {/* Logo & Platform Name */}
              <div className="mb-5 inline-flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/90 text-white shadow-lg shadow-emerald-500/30">
                  <Sparkles className="h-5 w-5" />
                </div>
                <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">IntelliHire</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl xl:text-6xl leading-[1.15]">
                Next-Gen{" "}
                <GradientText>
                  Technical Hiring
                </GradientText>{" "}
                & Campus Placement.
              </h1>

              <p className="mt-5 max-w-xl text-base text-slate-600 dark:text-slate-300 sm:text-lg leading-relaxed">
                Standardize technical assessments with automated anti-cheat proctoring,
                multi-language sandboxes, and instantaneous verifiable credentials.
              </p>

              {/* Feature Cards — dark glass tiles with hover lift */}
              <Stagger className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  { Icon: Shield, title: "Anti-Cheat Proctoring", desc: "Webcam telemetry & tab-blur detection", iconCls: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-400/10 text-emerald-300 border-emerald-300/20" },
                  { Icon: Cpu, title: "Monaco Code Sandbox", desc: "Python, C++, Java, JS with diffing", iconCls: "bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-400/10 text-teal-300 border-teal-300/20" },
                  { Icon: Building2, title: "TPO Readiness Engine", desc: "OCR marksheets & conflict resolution", iconCls: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-400/10 text-amber-300 border-amber-300/20" },
                  { Icon: Sparkles, title: "AI-Assisted Evaluation", desc: "Groq LLM question & voice synthesis", iconCls: "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-400/10 text-violet-300 border-violet-300/20" },
                ].map(({ Icon, title, desc, iconCls }) => (
                  <StaggerItem key={title}>
                    <div className="group rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 p-4.5 backdrop-blur-md transition duration-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:-translate-y-1 hover:shadow-[0_16px_40px_-20px_rgba(15,23,42,0.25)] dark:hover:shadow-[0_16px_40px_-20px_rgba(0,0,0,0.6)]">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${iconCls}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{desc}</p>
                        </div>
                      </div>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </motion.div>

          {/* Right Column: Clean White Card with Role Switcher & Form */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="lg:col-span-6 xl:col-span-5"
          >
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
                            ? "bg-white text-emerald-700 shadow-sm font-semibold border border-slate-200/60"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 transition duration-200 ${
                            isActive ? "text-emerald-600 scale-110" : "text-slate-500 group-hover:text-slate-700"
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
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-600">
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
                      className="block h-11 w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100"
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
                      placeholder="Enter password"
                      className="block h-11 w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-11 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
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
                  className="group relative mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 bg-[length:200%_100%] hover:bg-right font-semibold text-sm text-white shadow-md shadow-emerald-600/25 transition-all duration-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Authenticating...</span>
                    </div>
                  ) : (
                    <>
                      <span>Sign In</span>
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
          </motion.div>

        </div>
      </div>
    </div>
  );
}

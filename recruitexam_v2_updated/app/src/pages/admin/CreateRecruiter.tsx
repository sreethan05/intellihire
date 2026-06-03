import { useState } from "react";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";
import { UserPlus, Mail, Lock, User, Shield, Check, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function CreateRecruiter() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Toggle states
  const [autoActivate, setAutoActivate] = useState(true);
  const [allowDrives, setAllowDrives] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await adminApi.createRecruiter({ name, email, password });
      toast.success("Recruiter created successfully!");
      setName(""); setEmail(""); setPassword("");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to create recruiter");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-violet-50 p-2 text-violet-700">
            <UserPlus size={20} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Onboard Recruiter</h1>
            <p className="text-xs text-slate-500 font-medium">Provision credentials and permission settings for a corporate recruiter.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-12 items-stretch">
        {/* Left Column: Vector Illustration & Details */}
        <div className="md:col-span-5 hidden md:flex flex-col justify-between p-6 rounded-2xl bg-gradient-to-br from-violet-50/50 via-slate-50 to-indigo-50/30 border border-slate-100/80 overflow-hidden relative">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-200/30 rounded-full blur-3xl pointer-events-none" />
          
          <div className="space-y-4 relative z-10">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-100/70 border border-violet-200/50 px-2.5 py-0.5 text-[10px] font-bold text-violet-700 uppercase tracking-wider">
              <Shield className="h-3 w-3" /> Admin Dashboard
            </div>
            <h2 className="text-sm font-extrabold text-slate-800 leading-tight">Fast-track Corporate Hiring</h2>
            <p className="text-xs text-slate-500 leading-relaxed">Adding a recruiter allows them to instantly post active job drives, screen eligible college candidates, and access AI proctored test assessments.</p>
          </div>

          {/* SVG Vector Onboarding Onboarding */}
          <div className="my-6 flex justify-center items-center">
            <svg viewBox="0 0 220 180" className="w-full max-w-[180px] drop-shadow-sm">
              <defs>
                <linearGradient id="violetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
                <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>
              {/* Background circle */}
              <circle cx="110" cy="90" r="75" fill="none" stroke="#f1f5f9" strokeWidth="1.5" />
              <circle cx="110" cy="90" r="55" fill="none" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
              
              {/* Floating lines */}
              <path d="M40 90 L180 90" stroke="#f1f5f9" strokeWidth="2" />
              <path d="M110 30 L110 150" stroke="#f1f5f9" strokeWidth="2" />

              {/* Main Laptop / Portal representation */}
              <rect x="50" y="65" width="120" height="75" rx="6" fill="#ffffff" stroke="#e2e8f0" strokeWidth="2" />
              <path d="M40 140 H180" stroke="#cbd5e1" strokeWidth="4" strokeLinecap="round" />
              
              {/* Internal elements in illustration */}
              <rect x="62" y="77" width="96" height="8" rx="2" fill="#f8fafc" />
              <rect x="62" y="91" width="56" height="6" rx="2" fill="#e2e8f0" />
              <rect x="62" y="103" width="76" height="6" rx="2" fill="#e2e8f0" />
              <rect x="62" y="115" width="40" height="6" rx="2" fill="#e2e8f0" />
              
              {/* Floating checkmarks / user card */}
              <g className="animate-bounce" style={{ animationDuration: '4s' }}>
                <rect x="135" y="95" width="45" height="35" rx="4" fill="url(#violetGrad)" filter="drop-shadow(0 4px 6px rgba(124, 58, 237, 0.15))" />
                <circle cx="157" cy="112" r="8" fill="#ffffff" />
                <path d="M154 112 L156 114 L160 110" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </g>

              {/* Recruiter Badge */}
              <g className="animate-pulse">
                <circle cx="150" cy="50" r="16" fill="url(#emeraldGrad)" />
                <path d="M144 56 C144 52 147 50 150 50 C153 50 156 52 156 56" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <circle cx="150" cy="45" r="3.5" fill="#ffffff" />
              </g>
            </svg>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Check className="h-4 w-4 text-emerald-500" />
              <span>Full Candidate ATS Matching</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Check className="h-4 w-4 text-emerald-500" />
              <span>AI Exam & Proctoring Tools</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Check className="h-4 w-4 text-emerald-500" />
              <span>Auto email invite sent</span>
            </div>
          </div>
        </div>

        {/* Right Column: Form Card */}
        <div className="md:col-span-7 flex flex-col justify-between">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Input fields */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="recruiter-name" className="text-xs font-bold text-slate-700">Full Name</Label>
                <div className="relative mt-1">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="recruiter-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Jane Smith"
                    className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-4 text-xs font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 bg-slate-50/50 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="recruiter-email" className="text-xs font-bold text-slate-700">Email Address</Label>
                <div className="relative mt-1">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="recruiter-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. jane.smith@company.com"
                    className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-4 text-xs font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 bg-slate-50/50 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="recruiter-password" className="text-xs font-bold text-slate-700">Password</Label>
                <div className="relative mt-1">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="recruiter-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-4 text-xs font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 bg-slate-50/50 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Toggle Switches (Access Controls) */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3.5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Access Privileges</div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-activate" className="text-xs font-bold text-slate-800">Auto-activate Account</Label>
                  <p className="text-[10px] text-slate-500">Recruiter can log in immediately upon creation.</p>
                </div>
                <Switch id="auto-activate" checked={autoActivate} onCheckedChange={setAutoActivate} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="allow-drives" className="text-xs font-bold text-slate-800">Allow Hiring Drives</Label>
                  <p className="text-[10px] text-slate-500">Permission to publish jobs and invite candidate cohorts.</p>
                </div>
                <Switch id="allow-drives" checked={allowDrives} onCheckedChange={setAllowDrives} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="send-email" className="text-xs font-bold text-slate-800">Send Invite Email</Label>
                  <p className="text-[10px] text-slate-500">Email credentials and setup link to recruiter.</p>
                </div>
                <Switch id="send-email" checked={sendEmail} onCheckedChange={setSendEmail} />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-lg text-xs font-extrabold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-violet-100"
              >
                {loading ? (
                  <>Onboarding recruiter...</>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" /> Complete Recruiter Setup
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


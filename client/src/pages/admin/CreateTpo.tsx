import { useState } from "react";
import type { FormEvent } from "react";
import { Landmark, Lock, Mail, MapPin, School, User, GraduationCap, Check, Send } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function CreateTpo() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    college_name: "",
    college_code: "",
    location: "",
  });
  const [loading, setLoading] = useState(false);

  // Toggle states
  const [autoVerifyCollege, setAutoVerifyCollege] = useState(true);
  const [allowBulkUpload, setAllowBulkUpload] = useState(true);
  const [sendInvite, setSendInvite] = useState(false);

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await adminApi.createTpo(form);
      toast.success("TPO and college created successfully");
      setForm({ name: "", email: "", password: "", college_name: "", college_code: "", location: "" });
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to create TPO");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-violet-50 p-2 text-violet-700">
            <GraduationCap size={20} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Onboard TPO</h1>
            <p className="text-xs text-slate-500 font-medium">Link a Training & Placement Officer account to their college campus.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-12 items-stretch">
        {/* Left Column: Campus Illustration */}
        <div className="md:col-span-5 hidden md:flex flex-col justify-between p-6 rounded-2xl bg-gradient-to-br from-violet-50/50 via-slate-50 to-indigo-50/30 border border-slate-100/80 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-200/30 rounded-full blur-3xl pointer-events-none" />
          
          <div className="space-y-4 relative z-10">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-100/70 border border-violet-200/50 px-2.5 py-0.5 text-[10px] font-bold text-violet-700 uppercase tracking-wider">
              <Landmark className="h-3 w-3" /> Campus Link
            </div>
            <h2 className="text-sm font-extrabold text-slate-800 leading-tight">Campus Placement Management</h2>
            <p className="text-xs text-slate-500 leading-relaxed">Connecting college TPOs enables batch candidate provisioning, marksheet verification scans, and local student eligibility analytics for incoming corporate drives.</p>
          </div>

          {/* SVG Vector Onboarding Onboarding */}
          <div className="my-6 flex justify-center items-center">
            <svg viewBox="0 0 220 180" className="w-full max-w-[180px] drop-shadow-sm">
              <defs>
                <linearGradient id="violetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
                <linearGradient id="indigoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4f46e5" />
                  <stop offset="100%" stopColor="#3730a3" />
                </linearGradient>
              </defs>
              {/* Background circle */}
              <circle cx="110" cy="90" r="75" fill="none" stroke="#f1f5f9" strokeWidth="1.5" />
              
              {/* College Campus Representation */}
              <path d="M40 135 H180" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
              
              {/* College Building */}
              <rect x="60" y="70" width="100" height="65" rx="4" fill="#ffffff" stroke="#e2e8f0" strokeWidth="2" />
              {/* Pillars */}
              <rect x="75" y="90" width="10" height="45" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
              <rect x="105" y="90" width="10" height="45" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
              <rect x="135" y="90" width="10" height="45" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
              
              {/* Triangle Roof */}
              <polygon points="55,70 110,40 165,70" fill="url(#violetGrad)" />
              
              {/* TPO Badge Cap */}
              <g className="animate-bounce" style={{ animationDuration: '5s' }}>
                <rect x="140" y="30" width="40" height="40" rx="8" fill="url(#indigoGrad)" filter="drop-shadow(0 4px 6px rgba(79, 70, 229, 0.15))" />
                <path d="M150 48 L160 42 L170 48 L160 54 Z" fill="#ffffff" />
                <path d="M155 51 V57 C155 59 165 59 165 57 V51" stroke="#ffffff" strokeWidth="1" fill="none" />
                <path d="M168 49 V56" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" />
              </g>
            </svg>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Check className="h-4 w-4 text-emerald-500" />
              <span>Bulk CSV Student Upload</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Check className="h-4 w-4 text-emerald-500" />
              <span>Smart Document OCR Validation</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Check className="h-4 w-4 text-emerald-500" />
              <span>Direct placement track tools</span>
            </div>
          </div>
        </div>

        {/* Right Column: Form Card */}
        <div className="md:col-span-7 flex flex-col justify-between">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Input fields */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="tpo-name" className="text-xs font-bold text-slate-700">TPO Name</Label>
                <div className="relative mt-1">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="tpo-name"
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="e.g. Dr. Ray"
                    className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-4 text-xs font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 bg-slate-50/50 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="tpo-email" className="text-xs font-bold text-slate-700">TPO Email</Label>
                <div className="relative mt-1">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="tpo-email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="e.g. tpo@college.edu"
                    className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-4 text-xs font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 bg-slate-50/50 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="tpo-password" className="text-xs font-bold text-slate-700">Password</Label>
                <div className="relative mt-1">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="tpo-password"
                    type="password"
                    required
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-4 text-xs font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 bg-slate-50/50 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="college-code" className="text-xs font-bold text-slate-700">College Code</Label>
                <div className="relative mt-1">
                  <School size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="college-code"
                    type="text"
                    required
                    value={form.college_code}
                    onChange={(e) => update("college_code", e.target.value.toUpperCase())}
                    placeholder="e.g. MGIT"
                    className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-4 text-xs font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 bg-slate-50/50 focus:bg-white"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="college-name" className="text-xs font-bold text-slate-700">College Name</Label>
                <div className="relative mt-1">
                  <Landmark size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="college-name"
                    type="text"
                    required
                    value={form.college_name}
                    onChange={(e) => update("college_name", e.target.value)}
                    placeholder="e.g. Mahatma Gandhi Institute of Technology"
                    className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-4 text-xs font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 bg-slate-50/50 focus:bg-white"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="college-location" className="text-xs font-bold text-slate-700">Location</Label>
                <div className="relative mt-1">
                  <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="college-location"
                    type="text"
                    value={form.location}
                    onChange={(e) => update("location", e.target.value)}
                    placeholder="e.g. Hyderabad"
                    className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-4 text-xs font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 bg-slate-50/50 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Toggle Switches */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3.5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Access Privileges</div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-verify-college" className="text-xs font-bold text-slate-800">Auto-verify College Details</Label>
                  <p className="text-[10px] text-slate-500">Automatically flag the linked college as an active partner.</p>
                </div>
                <Switch id="auto-verify-college" checked={autoVerifyCollege} onCheckedChange={setAutoVerifyCollege} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="allow-bulk-upload" className="text-xs font-bold text-slate-800">Allow Bulk CSV Uploads</Label>
                  <p className="text-[10px] text-slate-500">TPO can upload roster lists to provision accounts in bulk.</p>
                </div>
                <Switch id="allow-bulk-upload" checked={allowBulkUpload} onCheckedChange={setAllowBulkUpload} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="send-invite" className="text-xs font-bold text-slate-800">Send Invitation Email</Label>
                  <p className="text-[10px] text-slate-500">Deliver dashboard login parameters immediately.</p>
                </div>
                <Switch id="send-invite" checked={sendInvite} onCheckedChange={setSendInvite} />
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
                  <>Onboarding TPO...</>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" /> Complete TPO Setup
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


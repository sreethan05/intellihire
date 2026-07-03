import { useAuth } from "@/context/AuthContext";
import { useCollege } from "@/context/CollegeContext";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Activity,
  BarChart3,
  Bot,
  CalendarDays,
  ChevronDown,
  FileText,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Search,
  Settings,
  ShieldCheck,
  Video,
  User,
  Users,
  Mail,
  Lock,
  Award,
  PenSquare,
  UserCheck,
  X,
  Sparkles,
  Sun,
  Moon,
} from "lucide-react";


export default function Layout() {
  const { user, logout, updateUser } = useAuth();
  const { selectedCollegeId, setSelectedCollegeId, collegesSummary } = useCollege();
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editName, setEditName] = useState(user?.name || "");
  const [editEmail, setEditEmail] = useState(user?.email || "");
  const [currentDate, setCurrentDate] = useState("");

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      const timeStr = now.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
      setCurrentDate(`${dateStr} • ${timeStr}`);
    };
    updateDateTime();
    const interval = setInterval(updateDateTime, 60000);
    return () => clearInterval(interval);
  }, []);
  const [profileStats, setProfileStats] = useState<{ title: string; stats: Array<{ label: string; value: string }> } | null>(null);

  useEffect(() => {
    if (!user) return;
    api.get("/ai/profile-stats")
      .then((res) => {
        if (res.data && res.data.stats) {
          setProfileStats(res.data);
        }
      })
      .catch((err) => console.error("Error fetching profile stats:", err));
  }, [user]);

  // Connect to notifications WebSocket
  useEffect(() => {
    if (!user) return;

    const socket = io(import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000", {
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      socket.emit("notifications:join", { userId: user.id });
    });

    socket.on("notification", (data: { title: string; body: string; type: string }) => {
      toast(data.title, {
        description: data.body,
        duration: 8000,
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  const [editPassword, setEditPassword] = useState("");
  const [editConfirm, setEditConfirm] = useState("");

  const adminLinks = [
    { path: "/admin/overview", label: "Dashboard", icon: LayoutDashboard },
    { path: "/admin/manage", label: "Manage", icon: PlusCircle },
    { path: "/admin/recruiter-analytics", label: "Reports", icon: BarChart3 },
    { path: "/admin/exam-activity", label: "Activity", icon: Activity },
  ];
  const tpoLinks = [
    { path: "/tpo/overview", label: "Dashboard", icon: LayoutDashboard },
    { path: "/tpo/students", label: "Manage", icon: GraduationCap },
    { path: "/tpo/reports", label: "Reports", icon: BarChart3 },
    { path: "/tpo/activity", label: "Activity", icon: Activity },
  ];
  const recruiterLinks = [
    { path: "/recruiter/overview", label: "Dashboard", icon: LayoutDashboard },
    { path: "/recruiter/ai-studio", label: "AI Studio", icon: Sparkles },
    { path: "/recruiter/create-exam", label: "Create Exam", icon: PenSquare },
    { path: "/recruiter/create-drive", label: "Manage", icon: Landmark },
    { path: "/recruiter/candidates", label: "Candidates", icon: Users },
    { path: "/recruiter/results", label: "Reports", icon: BarChart3 },
    { path: "/recruiter/candidate-analytics", label: "Candidate Analytics", icon: Users },
    { path: "/recruiter/voice-interviews", label: "AI Interviews", icon: Bot },
    { path: "/recruiter/interview-scheduling", label: "Interview Scheduling", icon: CalendarDays },
    { path: "/recruiter/proctoring", label: "Proctoring", icon: Video },
    { path: "/recruiter/active-monitoring", label: "Live Monitor", icon: Activity },
    { path: "/recruiter/exam-analytics", label: "Activity", icon: Activity },
    { path: "/recruiter/colleges", label: "Colleges", icon: Landmark },
  ];
  const candidateLinks = [
    { path: "/candidate/overview", label: "Dashboard", icon: LayoutDashboard },
    { path: "/candidate/my-exams", label: "Manage", icon: FileText },
    { path: "/candidate/interview", label: "Interview", icon: Video },
    { path: "/candidate/certificates", label: "Certificates", icon: ShieldCheck },
    { path: "/candidate/exam-analysis", label: "Reports", icon: BarChart3 },
    { path: "/candidate/sandbox", label: "Practice Sandbox", icon: PenSquare },
  ];

  const links =
    user?.role === "admin" ? adminLinks :
    user?.role === "tpo" ? tpoLinks :
    user?.role === "recruiter" ? recruiterLinks :
    candidateLinks;

  const initials = (user?.name || "U").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
  const title = links.find((link) => location.pathname === link.path)?.label || "Dashboard";

  const handleEditProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editPassword && editPassword !== editConfirm) {
      toast.error("Passwords do not match");
      return;
    }
    updateUser({ name: editName, email: editEmail });
    toast.success("Profile details updated successfully!");
    setShowEditProfileModal(false);
    setEditPassword("");
    setEditConfirm("");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] dark:bg-slate-950">
      {/* Sidebar - white background, slate borders, light violet accents */}
      <aside className="flex h-full w-[260px] shrink-0 flex-col bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-r border-slate-200/60 dark:border-slate-800/60 shadow-[4px_0_24px_rgba(0,0,0,0.015)]">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm font-extrabold text-lg select-none">
            I
          </div>
          <div>
            <div className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">IntelliHire</div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider capitalize leading-none mt-0.5">{user?.role}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-6">
          <div className="space-y-1">
            {links.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={`${link.path}-${link.label}`}
                  to={link.path}
                  className={`flex h-10 items-center gap-3 rounded-lg px-3.5 text-[13px] font-bold transition-all duration-200 hover:-translate-y-0.5 ${
                    isActive
                      ? "bg-violet-50/90 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 shadow-sm border border-violet-100/50 dark:border-violet-900/20"
                      : "text-slate-500 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 hover:text-slate-900 dark:hover:text-slate-100"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-violet-600" : "text-slate-400"}`} />
                  <span className="truncate">{link.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Bottom sidebar controls */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800/60 space-y-1">
          <button
            type="button"
            onClick={() => {
              setEditName(user?.name || "");
              setEditEmail(user?.email || "");
              setShowEditProfileModal(true);
            }}
            className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-all duration-200"
          >
            <Settings className="h-4 w-4 text-slate-400" />
            Settings
          </button>
          <button type="button" onClick={logout} className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all duration-200">
            <LogOut className="h-4 w-4 text-slate-400" />
            Logout
          </button>
        </div>
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden relative">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-violet-500/5 rounded-full blur-[100px] pointer-events-none -z-10" />

        {/* Header - White background, slate bottom border, Search bar */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-6 shadow-[0_2px_12px_rgba(0,0,0,0.01)]">
          <div className="flex items-center gap-5 w-full max-w-[150px] sm:max-w-xs md:max-w-sm transition-all duration-200">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search global reports..."
                className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 pl-9 pr-4 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none transition duration-200 placeholder:text-slate-400 focus:border-violet-500/80 focus:ring-2 focus:ring-violet-500/10 focus:bg-white"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-5">
            {user?.role === "recruiter" && (
              <div className="flex items-center gap-2">
                <Landmark className="h-4.5 w-4.5 text-violet-600" />
                <select
                  value={selectedCollegeId || ""}
                  onChange={(e) => setSelectedCollegeId(e.target.value || null)}
                  className="h-9 rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 pr-8 text-xs font-bold text-slate-700 outline-none focus:border-violet-500 focus:bg-white cursor-pointer transition-all duration-200"
                >
                  <option value="">All Campuses (Aggregated)</option>
                  {collegesSummary.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="hidden items-center gap-2 text-xs font-bold text-slate-500 lg:flex">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              {currentDate}
            </div>
            {/* Dark Mode Toggle Button */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 transition focus:outline-none cursor-pointer"
              title="Toggle Dark Mode"
            >
              {theme === "dark" ? (
                <Sun className="h-4.5 w-4.5 text-amber-500 animate-spin-slow" />
              ) : (
                <Moon className="h-4.5 w-4.5 text-slate-500" />
              )}
            </button>

            {/* Google / Leetcode Styled Profile Trigger Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="flex items-center gap-2 sm:gap-3 select-none hover:opacity-85 focus:outline-none cursor-pointer"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-xs font-bold text-white shadow-sm border border-violet-100">
                  {initials}
                </div>
                <div className="hidden md:block text-left">
                  <div className="text-xs font-extrabold leading-tight text-slate-900">{user?.name}</div>
                  <div className="text-[10px] capitalize text-slate-400 font-semibold leading-none mt-0.5">{user?.role}</div>
                </div>
                <ChevronDown className="h-4 w-4 text-slate-400 transition-transform duration-200" style={{ transform: showProfileDropdown ? 'rotate(180deg)' : 'rotate(0deg)' }} />
              </button>

              {/* Profile Card Popover */}
              {showProfileDropdown && (
                <>
                  {/* Backdrop Overlay to close */}
                  <div className="fixed inset-0 z-30 cursor-default" onClick={() => setShowProfileDropdown(false)} />
                  
                  <div className="absolute right-0 mt-3 w-80 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-5 shadow-2xl z-40 animate-in fade-in-50 slide-in-from-top-2 duration-150 flex flex-col items-stretch text-center">
                    {/* Upper User Circle */}
                    <div className="relative mx-auto mt-2">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-lg font-bold text-white shadow-md ring-4 ring-violet-50">
                        {initials}
                      </div>
                      <div className="absolute bottom-0 right-0 rounded-full bg-emerald-500 p-1 border-2 border-white">
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100 leading-tight">{user?.name}</div>
                      <div className="text-xs font-medium text-slate-400 mt-0.5">{user?.email}</div>
                      <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-violet-50 dark:bg-violet-950/40 border border-violet-100 dark:border-violet-900/20 text-violet-700 dark:text-violet-400 uppercase tracking-wider">
                        <UserCheck className="h-2.5 w-2.5" /> {user?.role} ACCOUNT
                      </div>
                    </div>

                    <div className="h-px bg-slate-100 dark:bg-slate-800 my-4" />

                    {/* LeetCode / Study Style Statistics */}
                    {profileStats && (
                      <div className="bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl p-3.5 text-left mb-4">
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                          <Award className="h-3 w-3 text-amber-500" /> {profileStats.title}
                        </div>
                        <div className="grid grid-cols-2 gap-3.5">
                          {profileStats.stats.map((stat, i) => (
                            <div key={i}>
                              <div className="text-[10px] text-slate-500 font-bold leading-tight truncate">{stat.label}</div>
                              <div className="text-xs font-extrabold text-slate-850 dark:text-slate-200 mt-0.5 truncate">{stat.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions list */}
                    <div className="space-y-1 text-left">
                      <button
                        onClick={() => {
                          setEditName(user?.name || "");
                          setEditEmail(user?.email || "");
                          setShowEditProfileModal(true);
                          setShowProfileDropdown(false);
                        }}
                        className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 transition"
                      >
                        <PenSquare className="h-4 w-4 text-slate-400" />
                        Edit Profile Details
                      </button>
                      <button
                        onClick={() => setShowProfileDropdown(false)}
                        className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 transition"
                      >
                        <Settings className="h-4 w-4 text-slate-400" />
                        Account Settings
                      </button>
                    </div>

                    <div className="h-px bg-slate-100 dark:bg-slate-800 my-4" />

                    {/* Prominent logout button at the bottom */}
                    <button
                      onClick={logout}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-extrabold text-rose-600 bg-rose-50 hover:bg-rose-100/80 border border-rose-100 transition duration-150 cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign Out of IntelliHire
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <h2 className="hidden">{title}</h2>
          <Outlet />
        </main>
      </div>

      {/* Edit Profile Modal (similar to LeetCode account customization) */}
      {showEditProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-white/20 dark:border-slate-800/40 p-6 shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150">
            {/* Close Button */}
            <button
              onClick={() => setShowEditProfileModal(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 transition"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-5 pb-3 border-b border-slate-100 dark:border-slate-850">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-violet-50 p-2 text-violet-700">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Edit Profile Settings</h2>
                </div>
              </div>
            </div>

            <form onSubmit={handleEditProfileSubmit} className="space-y-4">
              <div>
                <Label htmlFor="edit-profile-name" className="text-xs font-bold text-slate-700">Full Name</Label>
                <div className="relative mt-1">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="edit-profile-name"
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter your name"
                    className="h-10 w-full rounded-lg border border-slate-200 dark:border-slate-700 pl-10 pr-4 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 bg-slate-50/50 focus:bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-profile-email" className="text-xs font-bold text-slate-700">Email Address</Label>
                <div className="relative mt-1">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="edit-profile-email"
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="h-10 w-full rounded-lg border border-slate-200 dark:border-slate-700 pl-10 pr-4 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 bg-slate-50/50 focus:bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-850 my-2" />

              <div>
                <Label htmlFor="edit-profile-pass" className="text-xs font-bold text-slate-700">New Password (Optional)</Label>
                <div className="relative mt-1">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="edit-profile-pass"
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Leave blank to keep current"
                    className="h-10 w-full rounded-lg border border-slate-200 dark:border-slate-700 pl-10 pr-4 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 bg-slate-50/50 focus:bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-profile-confirm" className="text-xs font-bold text-slate-700">Confirm Password</Label>
                <div className="relative mt-1">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="edit-profile-confirm"
                    type="password"
                    value={editConfirm}
                    onChange={(e) => setEditConfirm(e.target.value)}
                    placeholder="Confirm new password"
                    className="h-10 w-full rounded-lg border border-slate-200 dark:border-slate-700 pl-10 pr-4 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 bg-slate-50/50 focus:bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3.5 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditProfileModal(false)}
                  className="h-9 text-xs font-bold border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-9 text-xs font-extrabold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-lg px-4 shadow-sm"
                >
                  Save Profile Info
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


import { useQuery } from "@tanstack/react-query";
import { 
  Briefcase, Calendar, CheckCircle2, Clock, 
  Sparkles, Trophy, AlertTriangle, 
  RefreshCw, Loader2, Info, Users, Award, 
  TrendingUp, Activity, ShieldAlert, ArrowUpRight, 
  Compass, ChevronRight
} from "lucide-react";
import { Link } from "react-router";
import { hubApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid 
} from "recharts";

// --- Hub API payload types ---
interface ActionItem {
  id?: string;
  priority: "urgent" | "high" | "normal";
  title: string;
  description: string;
  action_url?: string;
  date?: string;
}

interface ActivityFeedItem {
  title: string;
  description: string;
  date: string;
}

interface ScheduleEvent {
  title: string;
  date: string;
  type: string;
}

interface QuickLink {
  label: string;
  path: string;
  color: string;
}

interface RadarDataPoint {
  subject: string;
  score: number;
  fullMark: number;
}

interface TrendDataPoint {
  name: string;
  score: number;
}

interface JourneyTracker {
  jobId?: string;
  jobTitle: string;
  companyName: string;
  currentStage: string;
}

interface FunnelItem {
  label: string;
  count: number;
}

interface SpotlightCandidate {
  name: string;
  score: string;
}

interface PerformerItem {
  name: string;
  score: string;
}

interface AtRiskItem {
  name: string;
  reason: string;
}

interface HubInsights {
  radarData?: RadarDataPoint[];
  trendData?: TrendDataPoint[];
  peerPercentile?: number;
  trackers?: JourneyTracker[];
  funnel?: FunnelItem[];
  topPerformers?: PerformerItem[];
  atRiskStudents?: AtRiskItem[];
  candidateSpotlight?: SpotlightCandidate[];
  skillGap?: string | null;
  growth?: string | null;
}

interface HubOverview {
  role: "candidate" | "recruiter" | "tpo" | "admin";
  stats: Record<string, string | number>;
  actionItems: ActionItem[];
  recentActivity: ActivityFeedItem[];
  upcomingSchedule: ScheduleEvent[];
  insights: HubInsights;
  quickLinks: QuickLink[];
}

const STATS_MAP: Record<string, { label: string; icon: any; colorClass: string; gradient: string }> = {
  completedExams: { label: "Completed Exams", icon: Award, colorClass: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", gradient: "from-emerald-500/10 to-emerald-600/5" },
  upcomingExams: { label: "Upcoming Exams", icon: Calendar, colorClass: "text-blue-400 bg-blue-500/10 border-blue-500/20", gradient: "from-blue-500/10 to-indigo-600/5" },
  averageScore: { label: "Average Score", icon: TrendingUp, colorClass: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20", gradient: "from-indigo-500/10 to-purple-600/5" },
  rank: { label: "College Rank", icon: Trophy, colorClass: "text-amber-400 bg-amber-500/10 border-amber-500/20", gradient: "from-amber-500/10 to-yellow-600/5" },
  totalRegistered: { label: "Registered Students", icon: Users, colorClass: "text-blue-400 bg-blue-500/10 border-blue-500/20", gradient: "from-blue-500/10 to-indigo-600/5" },
  completeProfiles: { label: "Complete Profiles", icon: CheckCircle2, colorClass: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", gradient: "from-emerald-500/10 to-emerald-600/5" },
  activeDrives: { label: "Active Job Drives", icon: Briefcase, colorClass: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20", gradient: "from-indigo-500/10 to-purple-600/5" },
  placed: { label: "Placed Candidates", icon: Trophy, colorClass: "text-amber-400 bg-amber-500/10 border-amber-500/20", gradient: "from-amber-500/10 to-yellow-600/5" },
  placementRate: { label: "Placement Rate", icon: TrendingUp, colorClass: "text-teal-400 bg-teal-500/10 border-teal-500/20", gradient: "from-teal-500/10 to-emerald-600/5" },
  averageCgpa: { label: "Average CGPA", icon: Award, colorClass: "text-purple-400 bg-purple-500/10 border-purple-500/20", gradient: "from-purple-500/10 to-pink-600/5" },
  totalCandidates: { label: "Total Candidates", icon: Users, colorClass: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20", gradient: "from-indigo-500/10 to-purple-600/5" },
  completedAttempts: { label: "Completed Exams", icon: CheckCircle2, colorClass: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", gradient: "from-emerald-500/10 to-emerald-600/5" },
  offersExtended: { label: "Offers Extended", icon: Trophy, colorClass: "text-amber-400 bg-amber-500/10 border-amber-500/20", gradient: "from-amber-500/10 to-yellow-600/5" },
  totalUsers: { label: "Total Platform Users", icon: Users, colorClass: "text-blue-400 bg-blue-500/10 border-blue-500/20", gradient: "from-blue-500/10 to-indigo-600/5" },
  totalExams: { label: "Total Exams Created", icon: Award, colorClass: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20", gradient: "from-indigo-500/10 to-purple-600/5" },
  activeSessions: { label: "Active Live Sessions", icon: Activity, colorClass: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", gradient: "from-emerald-500/10 to-emerald-600/5" },
  systemHealth: { label: "Core System Health", icon: ShieldAlert, colorClass: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", gradient: "from-emerald-500/10 to-emerald-600/5" },
};

export default function HubPage() {
  const { user } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useQuery<HubOverview>({
    queryKey: ["hub", "overview"],
    queryFn: async () => {
      const res = await hubApi.getOverview();
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50/50">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto" />
          <p className="text-sm text-slate-500 font-bold tracking-wider uppercase">Assembling Control Command Hub...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50/50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-md">
          <AlertTriangle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
          <h2 className="text-xl font-black text-slate-900">Hub Workspace Offline</h2>
          <p className="mt-2 text-sm text-slate-500">Failed to aggregate command dashboard telemetry.</p>
          <button onClick={() => refetch()} className="mt-6 w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-3 text-xs font-bold text-white transition shadow-lg shadow-blue-500/20">
            Re-Initialize Hub
          </button>
        </div>
      </div>
    );
  }

  const { role, stats, actionItems, recentActivity, upcomingSchedule, insights, quickLinks } = data;

  const todayStr = new Date().toLocaleDateString("en-US", { 
    weekday: "long", 
    year: "numeric", 
    month: "long", 
    day: "numeric" 
  });

  return (
    <div className="space-y-8 pb-16 min-h-screen text-slate-700 p-1 sm:p-4 rounded-3xl">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-100 rounded px-2.5 py-1">
            <Compass className="h-3 w-3" /> Secure Access // {role}
          </span>
          <h1 className="text-3xl font-black text-slate-900 mt-3 capitalize tracking-tight">
            {role === "admin" ? "Platform Control Console" : `${user?.name}'s Command Hub`}
          </h1>
          <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" /> {todayStr}
          </p>
        </div>
        <button 
          onClick={() => refetch()} 
          disabled={isRefetching}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-650 hover:text-slate-900 px-4 py-2.5 transition duration-200 shadow-sm cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin text-blue-500" : "text-slate-400"}`} />
          {isRefetching ? "Syncing..." : "Sync Telemetry"}
        </button>
      </div>

      {/* ZONE 1: ACTION CENTER */}
      {actionItems && actionItems.length > 0 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Active Action Center</h2>
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping"></span>
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {actionItems.map((item: ActionItem, idx: number) => {
              const isUrgent = item.priority === "urgent";
              const isHigh = item.priority === "high";
              const borderCol = isUrgent ? "border-l-rose-500" : isHigh ? "border-l-amber-500" : "border-l-blue-500";
              const tagStyle = isUrgent 
                ? "bg-rose-500/10 text-rose-600 border-rose-500/20" 
                : isHigh 
                  ? "bg-amber-500/10 text-amber-600 border-amber-500/20" 
                  : "bg-blue-500/10 text-blue-650 border-blue-500/20";
              
              return (
                <div key={idx} className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm border-l-4 ${borderCol} flex flex-col justify-between gap-4 hover:-translate-y-0.5 hover:shadow-md hover:bg-slate-50/30 transition duration-300`}>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className={`rounded text-[9px] font-black uppercase px-2 py-0.5 border ${tagStyle}`}>
                        {item.priority} Priority
                      </span>
                      {isUrgent && <AlertTriangle className="h-4 w-4 text-rose-500" />}
                    </div>
                    <h4 className="font-extrabold text-sm text-slate-900">{item.title}</h4>
                    <p className="text-xs text-slate-650 leading-relaxed">{item.description}</p>
                  </div>
                  
                  {item.action_url && (
                    <Link
                      to={item.action_url}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-500 mt-1 group"
                    >
                      Resolve Action <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 text-blue-600" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ZONE 2 & 3: STATS + CORE INSIGHTS & ACTIONS */}
      <div className="grid gap-6 lg:grid-cols-3">
        
        {/* LEFT COLUMN (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Stats Grid */}
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
            {Object.keys(stats).map((key) => {
              const config = STATS_MAP[key] || { label: key, icon: Activity, colorClass: "text-slate-500", gradient: "" };
              const IconComponent = config.icon;
              return (
                <div key={key} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition duration-300">
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">
                      {config.label}
                    </span>
                    <IconComponent className={`h-4.5 w-4.5 ${config.colorClass}`} />
                  </div>
                  <span className="text-2xl font-black text-slate-900 mt-4 block tracking-tight">
                    {stats[key]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Role-Specific Workflows & Funnels */}
          {role === "candidate" && insights?.trackers && insights.trackers.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3 uppercase tracking-wider">
                <Briefcase className="h-4 w-4 text-blue-600" /> Current Application Pipeline
              </h3>
              
              <div className="space-y-6">
                {insights.trackers.map((track: JourneyTracker, idx: number) => {
                  const stages = [
                    { name: "Applied", active: true },
                    { name: "Eligible", active: ["eligible", "exam_assigned", "exam_taken", "shortlisted", "interview_scheduled", "offered", "placed"].includes(track.currentStage) },
                    { name: "Assigned", active: ["exam_assigned", "exam_taken", "shortlisted", "interview_scheduled", "offered", "placed"].includes(track.currentStage) },
                    { name: "Shortlisted", active: ["shortlisted", "interview_scheduled", "offered", "placed"].includes(track.currentStage) },
                    { name: "Offered", active: ["offered", "placed"].includes(track.currentStage) }
                  ];
                  return (
                    <div key={idx} className="space-y-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-slate-800 tracking-wide">{track.jobTitle} <span className="text-slate-500">at</span> {track.companyName}</span>
                        <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 text-[9px] uppercase tracking-wider">
                          Stage: {track.currentStage}
                        </span>
                      </div>
                      
                      <div className="relative pt-2 pb-1">
                        <div className="absolute left-4 right-4 top-[17px] h-0.5 bg-slate-200 -z-10"></div>
                        <div className="flex justify-between">
                          {stages.map((st, sidx) => (
                            <div key={sidx} className="flex flex-col items-center">
                              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-black border transition-all duration-300 ${
                                st.active 
                                  ? "bg-blue-600 border-blue-500 text-white shadow-md scale-110" 
                                  : "bg-white border-slate-200 text-slate-400"
                              }`}>
                                {sidx + 1}
                              </div>
                              <span className={`text-[9px] font-black mt-2 tracking-wide ${st.active ? "text-slate-700" : "text-slate-400"}`}>{st.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {role === "tpo" && insights?.funnel && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3 uppercase tracking-wider">
                <PercentIcon className="h-4 w-4 text-blue-600" /> College Recruitment Funnel
              </h3>
              
              <div className="space-y-4">
                {insights.funnel.map((item: FunnelItem, idx: number) => {
                  const percent = Math.min(100, (item.count / (Number(stats.totalRegistered) || 100)) * 100);
                  return (
                    <div key={idx} className="space-y-2">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-slate-700">{item.label}</span>
                        <span className="text-slate-650 font-bold">{item.count} Candidates <span className="text-slate-500 text-[10px]">({Math.round(percent)}%)</span></span>
                      </div>
                      <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500" style={{ width: `${percent}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {role === "recruiter" && insights?.candidateSpotlight && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3 uppercase tracking-wider">
                <Trophy className="h-4.5 w-4.5 text-yellow-500" /> AI Candidate Spotlight
              </h3>
              
              <div className="grid gap-4 sm:grid-cols-3">
                {insights.candidateSpotlight.map((cand: SpotlightCandidate, idx: number) => (
                  <div key={idx} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 text-center space-y-3 hover:border-blue-500/30 transition duration-300 shadow-inner">
                    <div className="h-12 w-12 rounded-full bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-black text-sm mx-auto shadow-inner">
                      {cand.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-sm">{cand.name}</h4>
                      <span className="inline-flex rounded-full bg-blue-50 border border-blue-100 px-3 py-0.5 text-[9px] font-black text-blue-600 uppercase tracking-widest mt-2">
                        {cand.score}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dynamic Interactive Charts */}
          {role === "candidate" && insights?.radarData && (() => {
            const hasRadarData = insights.radarData.some((d: RadarDataPoint) => d.score > 0);
            const hasTrendData = insights.trendData && insights.trendData.length > 0;
            return (
              <div className="grid gap-6 sm:grid-cols-2">
                
                {/* Skill Radar */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-3 mb-4">
                    Evaluation Skill Radar
                  </h3>
                  {hasRadarData ? (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={insights.radarData}>
                          <PolarGrid stroke="#e2e8f0" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 9, fontWeight: 700 }} />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 8 }} />
                          <Radar name="Proficiency" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-56 flex flex-col items-center justify-center text-center p-4">
                      <Sparkles className="h-8 w-8 text-slate-400 mb-3 animate-pulse" />
                      <p className="text-xs font-extrabold text-slate-700">Diagnostics Unavailable</p>
                      <p className="text-[10px] text-slate-500 mt-1 max-w-[200px] leading-relaxed">Complete assigned exams to map your engineering skill dimensions.</p>
                    </div>
                  )}
                </div>

                {/* Growth Trend */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-3 mb-4">
                      Score Growth History
                    </h3>
                    {hasTrendData ? (
                      <div className="h-36">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={insights.trendData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 8, fontWeight: 600 }} />
                            <YAxis tick={{ fill: '#64748b', fontSize: 8, fontWeight: 600 }} domain={[0, 100]} />
                            <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#0f172a' }} />
                            <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, stroke: '#3b82f6', strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-36 flex flex-col items-center justify-center text-center p-4">
                        <p className="text-xs font-bold text-slate-750">Growth Stats Unmapped</p>
                        <p className="text-[10px] text-slate-500 mt-1">Telemetry will lock once attempts are logged.</p>
                      </div>
                    )}
                  </div>
                  
                  {insights.peerPercentile != null && insights.peerPercentile > 0 ? (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5 text-center text-xs font-bold text-blue-600 mt-4">
                      Batch Percentile Performance: {insights.peerPercentile}%
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center text-xs font-bold text-slate-500 mt-4">
                      Batch Percentile: Aggregating peer diagnostics...
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {role === "tpo" && insights?.topPerformers && (
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-3">
                  Top Performing Students
                </h3>
                <div className="divide-y divide-slate-200">
                  {insights.topPerformers.map((st: PerformerItem, idx: number) => (
                    <div key={idx} className="flex justify-between py-2.5 text-xs font-bold">
                      <span className="text-slate-700">{st.name}</span>
                      <span className="text-blue-600 font-extrabold">{st.score} Average</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-3">
                  Students At Placement Risk
                </h3>
                <div className="divide-y divide-slate-200">
                  {insights.atRiskStudents && insights.atRiskStudents.length > 0 ? (
                    insights.atRiskStudents.map((st: AtRiskItem, idx: number) => (
                      <div key={idx} className="flex justify-between py-2.5 text-xs font-bold">
                        <span className="text-slate-700">{st.name}</span>
                        <span className="text-amber-600 font-extrabold">{st.reason}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center text-slate-500 font-bold text-xs">
                      <CheckCircle2 className="h-6 w-6 text-emerald-500 mb-1" />
                      No risk flags surfaced.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {role === "recruiter" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-3">
                Recruitment Insights Summary
              </h3>
              <div className="flex items-start gap-3.5 text-xs text-slate-700 leading-relaxed bg-blue-50 p-5 rounded-2xl border border-blue-100">
                <Sparkles className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-slate-900 text-sm">AI Copilot Recommendation:</p>
                  <p className="mt-1.5 text-slate-650">{insights?.skillGap || "Diagnostic parameters normal. Complete current drives and review candidates."}</p>
                </div>
              </div>
            </div>
          )}

          {role === "admin" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-3">
                Orchestration Telemetry Diagnostics
              </h3>
              <div className="flex items-start gap-3.5 text-xs text-slate-700 leading-relaxed bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <Info className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-slate-900 text-sm">System Diagnostics Summary:</p>
                  <p className="mt-1.5 text-slate-600">{insights?.growth || "Platform usage and compute bounds within typical operating parameters."}</p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN (1/3 width) - Recent Activity Timeline */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3 uppercase tracking-wider mb-5">
              <Clock className="h-4 w-4 text-blue-600" /> Recent Activities
            </h3>
            
            <div className="relative border-l border-slate-200 pl-4 space-y-6">
              {recentActivity && recentActivity.length > 0 ? (
                recentActivity.map((feed: ActivityFeedItem, idx: number) => (
                  <div key={idx} className="relative text-xs group">
                    {/* Circle timeline dot with scale on hover */}
                    <div className="absolute -left-[21px] top-0.5 h-2 w-2 rounded-full bg-blue-500 border-2 border-white group-hover:scale-125 transition-transform duration-200"></div>
                    <div className="font-extrabold text-slate-800">{feed.title}</div>
                    <p className="text-slate-600 mt-1 leading-relaxed">{feed.description}</p>
                    <span className="text-[9px] text-slate-400 mt-1.5 block font-bold uppercase tracking-wider">
                      {new Date(feed.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-xs text-slate-500 font-bold italic">
                  No activity logs registered.
                </div>
              )}
            </div>
          </div>
          
          <div className="text-[8px] text-slate-400 font-black uppercase tracking-widest text-center border-t border-slate-100 pt-4 mt-6">
            Command Dashboard Diagnostics Stream
          </div>
        </div>

      </div>

      {/* ZONE 4: CALENDAR & QUICK LINKS */}
      <div className="grid gap-6 md:grid-cols-3">
        
        {/* Calendar Events */}
        <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3 uppercase tracking-wider mb-5">
            <Calendar className="h-4 w-4 text-blue-600" /> Upcoming Calendar Events
          </h3>
          
          <div className="grid gap-4 sm:grid-cols-2">
            {upcomingSchedule && upcomingSchedule.length > 0 ? (
              upcomingSchedule.map((sched: ScheduleEvent, idx: number) => (
                <div key={idx} className="flex gap-4 items-center rounded-2xl border border-slate-200 p-4 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition duration-200 shadow-sm">
                  <div className="h-10 w-10 rounded-xl bg-white border border-slate-200 flex flex-col justify-center items-center font-bold text-slate-700 shadow-inner">
                    <span className="text-[9px] text-blue-600 uppercase font-black tracking-wider leading-none">
                      {new Date(sched.date).toLocaleDateString([], { month: 'short' })}
                    </span>
                    <span className="text-sm mt-0.5 font-black leading-none">
                      {new Date(sched.date).getDate()}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900 tracking-wide">{sched.title}</h4>
                    <p className="text-[8px] text-slate-500 font-black uppercase tracking-wider mt-1">
                      Event Type // {sched.type}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="sm:col-span-2 text-center py-8 text-xs text-slate-500 font-bold italic border border-dashed border-slate-200 rounded-2xl">
                No calendar deadlines surfaced.
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions Links Grid */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3 uppercase tracking-wider mb-5">
              <ArrowUpRight className="h-4 w-4 text-blue-600" /> Quick Actions
            </h3>
            
            <div className="grid gap-3 grid-cols-2">
              {quickLinks && quickLinks.map((link: QuickLink, idx: number) => (
                <Link
                  key={idx}
                  to={link.path}
                  className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-violet-600 hover:border-violet-500 hover:text-white p-3.5 text-center text-xs font-bold text-slate-650 transition duration-200 shadow-sm"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          
          <div className="text-[8px] text-slate-400 font-bold text-center mt-6">
            V.1.0 // Command Terminal
          </div>
        </div>

      </div>

    </div>
  );
}

function PercentIcon({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <line x1="19" y1="5" x2="5" y2="19"></line>
      <circle cx="6.5" cy="6.5" r="2.5"></circle>
      <circle cx="17.5" cy="17.5" r="2.5"></circle>
    </svg>
  );
}

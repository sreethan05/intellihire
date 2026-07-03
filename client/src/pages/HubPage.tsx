import { useQuery } from "@tanstack/react-query";
import { 
  Briefcase, Calendar, CheckCircle, Clock, 
  Sparkles, Trophy, ArrowRight, AlertTriangle, 
  RefreshCw, Loader2, Info
} from "lucide-react";
import { Link } from "react-router-dom";
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
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-2 text-sm text-slate-500 font-medium">Assembling Your Workspace Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Workspace Unavailable</h2>
          <p className="mt-1 text-sm text-slate-500">Could not compile your dashboard data. Please try again.</p>
          <button onClick={() => refetch()} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { role, stats, actionItems, recentActivity, upcomingSchedule, insights, quickLinks } = data;

  // Formatting date
  const todayStr = new Date().toLocaleDateString("en-US", { 
    weekday: "long", 
    year: "numeric", 
    month: "long", 
    day: "numeric" 
  });

  return (
    <div className="space-y-6 pb-16">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-100 rounded px-2.5 py-0.5">
            System Workspace : {role}
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-2 capitalize">
            {role === "admin" ? "Platform Control Overview" : `${user?.name}'s Command Hub`}
          </h1>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> {todayStr}
          </p>
        </div>
        <button 
          onClick={() => refetch()} 
          disabled={isRefetching}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 px-3.5 py-2 transition"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          {isRefetching ? "Updating..." : "Refresh Dashboard"}
        </button>
      </div>

      {/* ZONE 1: ACTION ITEMS (Full-width, sticky at top) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Action Center</h2>
          <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse"></span>
        </div>
        
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {actionItems && actionItems.length > 0 ? (
            actionItems.map((item: ActionItem, idx: number) => {
              const borderCol = item.priority === "urgent" ? "border-l-red-500" : item.priority === "high" ? "border-l-amber-500" : "border-l-blue-500";
              const tagBg = item.priority === "urgent" ? "bg-red-50 text-red-700 border-red-100" : item.priority === "high" ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-blue-50 text-blue-700 border-blue-100";
              
              return (
                <div key={idx} className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm border-l-4 ${borderCol} flex flex-col justify-between gap-3 hover:shadow-sm transition`}>
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className={`inline-block rounded text-[9px] font-black uppercase px-2 py-0.5 border ${tagBg}`}>
                        {item.priority}
                      </span>
                      {item.priority === "urgent" && <AlertTriangle className="h-4 w-4 text-red-500" />}
                    </div>
                    <h4 className="font-extrabold text-sm text-slate-900 mt-2">{item.title}</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-5">{item.description}</p>
                  </div>
                  
                  {item.action_url && (
                    <Link
                      to={item.action_url}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 mt-2 group"
                    >
                      Resolve task <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
                    </Link>
                  )}
                </div>
              );
            })
          ) : (
            <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-slate-200 p-8 text-center bg-white shadow-none">
              <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto" />
              <h4 className="font-bold text-slate-900 text-sm mt-2">All Tasks Completed</h4>
              <p className="text-xs text-slate-400 mt-1">Outstanding actions for your workspace are fully resolved.</p>
            </div>
          )}
        </div>
      </div>

      {/* ZONE 2 & 3: STATS + PIPELINE (2/3) AND ACTIVITY FEED (1/3) */}
      <div className="grid gap-6 lg:grid-cols-3">
        
        {/* LEFT COLUMN (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Quick Stats Grid */}
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
            {Object.keys(stats).map((key) => (
              <div key={key} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-none">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wide block capitalize">
                  {key.replace(/([A-Z])/g, " $1")}
                </span>
                <span className="text-xl font-black text-slate-900 mt-1 block">
                  {stats[key]}
                </span>
              </div>
            ))}
          </div>

          {/* Visual Funnels & Pipelines based on Role */}
          {role === "candidate" && insights?.trackers && insights.trackers.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-2.5">
                <Briefcase className="h-4 w-4 text-blue-600" /> Active Placement Journey
              </h3>
              
              <div className="space-y-6">
                {insights.trackers.map((track: JourneyTracker, idx: number) => {
                  const stages = [
                    { name: "Applied", active: true },
                    { name: "Eligible", active: ["eligible", "exam_assigned", "exam_taken", "shortlisted", "interview_scheduled", "offered", "placed"].includes(track.currentStage) },
                    { name: "Assigned", active: ["exam_assigned", "exam_taken", "shortlisted", "interview_scheduled", "offered", "placed"].includes(track.currentStage) },
                    { name: "Shortlisted", active: ["shortlisted", "interview_scheduled", "offered", "placed"].includes(track.currentStage) },
                    { name: "Selected", active: ["offered", "placed"].includes(track.currentStage) }
                  ];
                  return (
                    <div key={idx} className="space-y-3 p-3 bg-slate-50/50 border border-slate-100 rounded-xl">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-slate-800">{track.jobTitle} - {track.companyName}</span>
                        <span className="text-blue-600 uppercase text-[10px]">Stage: {track.currentStage}</span>
                      </div>
                      
                      <div className="relative pt-2 pb-1">
                        <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-1 bg-slate-100 -z-10"></div>
                        <div className="flex justify-between">
                          {stages.map((st, sidx) => (
                            <div key={sidx} className="flex flex-col items-center">
                              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition ${
                                st.active ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-300"
                              }`}>
                                {sidx + 1}
                              </div>
                              <span className={`text-[9px] font-bold mt-1.5 ${st.active ? "text-slate-800" : "text-slate-300"}`}>{st.name}</span>
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
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-2.5">
                <PercentIcon className="h-4 w-4 text-blue-600" /> College Placement Funnel
              </h3>
              
              <div className="space-y-3">
                {insights.funnel.map((item: FunnelItem, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-slate-700">{item.label}</span>
                      <span className="text-slate-900">{item.count} Candidates</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, (item.count / (Number(stats.totalRegistered) || 100)) * 100)}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {role === "recruiter" && insights?.candidateSpotlight && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-2.5">
                <Trophy className="h-4.5 w-4.5 text-yellow-500" /> Auto-Surfaced Top Talent
              </h3>
              
              <div className="grid gap-3 sm:grid-cols-3">
                {insights.candidateSpotlight.map((cand: SpotlightCandidate, idx: number) => (
                  <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-center space-y-1">
                    <div className="h-10 w-10 rounded-full bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm mx-auto">
                      {cand.name.charAt(0)}
                    </div>
                    <h4 className="font-extrabold text-slate-900 text-sm mt-2">{cand.name}</h4>
                    <span className="inline-block rounded-md bg-blue-100/50 px-2 py-0.5 text-[10px] font-black text-blue-700 uppercase">
                      {cand.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skill Radar / Platform Insights */}
          {role === "candidate" && insights?.radarData && (() => {
            const hasRadarData = insights.radarData.some((d: RadarDataPoint) => d.score > 0);
            const hasTrendData = insights.trendData && insights.trendData.length > 0;
            return (
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-50 pb-2 mb-4">
                  Evaluation Skill Radar
                </h3>
                {hasRadarData ? (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="85%" data={insights.radarData}>
                        <PolarGrid stroke="#f1f5f9" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#cbd5e1', fontSize: 8 }} />
                        <Radar name="Proficiency" dataKey="score" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.4} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-52 flex flex-col items-center justify-center text-center">
                    <Sparkles className="h-7 w-7 text-slate-300 mb-2" />
                    <p className="text-xs font-bold text-slate-500">No assessment data yet</p>
                    <p className="text-[11px] text-slate-400 mt-1">Take your first exam to see your skill breakdown.</p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-50 pb-2 mb-4">
                    Score Growth Trend
                  </h3>
                  {hasTrendData ? (
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={insights.trendData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 8 }} />
                          <YAxis tick={{ fontSize: 8 }} domain={[0, 100]} />
                          <Tooltip />
                          <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-36 flex flex-col items-center justify-center text-center">
                      <p className="text-xs font-bold text-slate-500">No exams completed yet</p>
                      <p className="text-[11px] text-slate-400 mt-1">Your score history will appear here.</p>
                    </div>
                  )}
                </div>
                {insights.peerPercentile != null && insights.peerPercentile > 0 ? (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center text-xs font-bold text-blue-800">
                    Batch Percentile Position: {insights.peerPercentile}%
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center text-xs font-bold text-slate-400">
                    Batch Percentile: Not enough peer data yet
                  </div>
                )}
              </div>
            </div>
            );
          })()}

          {role === "tpo" && insights?.topPerformers && (
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-50 pb-2">
                  Top Performing Students
                </h3>
                <div className="divide-y divide-slate-100">
                  {insights.topPerformers.map((st: PerformerItem, idx: number) => (
                    <div key={idx} className="flex justify-between py-2 text-xs font-semibold">
                      <span className="text-slate-800">{st.name}</span>
                      <span className="text-blue-600 font-bold">{st.score} Avg</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-50 pb-2">
                  Students At Academic Risk
                </h3>
                <div className="divide-y divide-slate-100">
                  {insights.atRiskStudents && insights.atRiskStudents.length > 0 ? (
                    insights.atRiskStudents.map((st: AtRiskItem, idx: number) => (
                      <div key={idx} className="flex justify-between py-2 text-xs font-semibold">
                        <span className="text-slate-800">{st.name}</span>
                        <span className="text-amber-600 font-bold">{st.reason}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 py-6 text-center">No at-risk academic flags.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {role === "recruiter" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-50 pb-2">
                Hiring War Room Insights
              </h3>
              <div className="flex items-start gap-2.5 text-xs text-slate-600 leading-6 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <Sparkles className="h-4.5 w-4.5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-blue-900">AI Placement Recommendation:</p>
                  <p className="mt-1">{insights?.skillGap || "Platform diagnostics operating in healthy levels. All assessments are synchronized."}</p>
                </div>
              </div>
            </div>
          )}

          {role === "admin" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-50 pb-2">
                Platform Orchestration Analytics
              </h3>
              <div className="flex items-start gap-2 text-xs text-slate-600 leading-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <Info className="h-4.5 w-4.5 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-900">Growth Insight:</p>
                  <p className="mt-0.5">{insights?.growth || "Platform usage levels are within regular metrics limits."}</p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ZONE 3: ACTIVITY FEED (1/3 width) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-2.5 mb-4">
              <Clock className="h-4 w-4 text-blue-600" /> Recent Activities
            </h3>
            
            <div className="relative border-l border-slate-100 pl-4 space-y-6">
              {recentActivity && recentActivity.length > 0 ? (
                recentActivity.map((feed: ActivityFeedItem, idx: number) => (
                  <div key={idx} className="relative text-xs">
                    {/* Circle timeline dot */}
                    <div className="absolute -left-[21px] top-0.5 h-2 w-2 rounded-full bg-blue-600 border-2 border-white shadow-none"></div>
                    <div className="font-bold text-slate-800">{feed.title}</div>
                    <p className="text-slate-500 mt-1 leading-5">{feed.description}</p>
                    <span className="text-[10px] text-slate-400 mt-1.5 block font-semibold">
                      {new Date(feed.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 text-center py-8">No activities logged recently.</p>
              )}
            </div>
          </div>
          
          <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider text-center border-t border-slate-50 pt-4 mt-6">
            IntelliHire Platform Activity Stream
          </div>
        </div>

      </div>

      {/* ZONE 4: UPCOMING SCHEDULE & QUICK ACTIONS */}
      <div className="grid gap-6 md:grid-cols-3">
        
        {/* Upcoming calendar schedules */}
        <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-2.5 mb-4">
            <Calendar className="h-4 w-4 text-blue-600" /> Upcoming Calendar Events
          </h3>
          
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingSchedule && upcomingSchedule.length > 0 ? (
              upcomingSchedule.map((sched: ScheduleEvent, idx: number) => (
                <div key={idx} className="flex gap-3 items-center rounded-xl border border-slate-100 p-3 bg-slate-50/50 hover:bg-slate-50 transition">
                  <div className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex flex-col justify-center items-center font-bold text-slate-800 shadow-none">
                    <span className="text-[10px] text-blue-600 uppercase leading-none">
                      {new Date(sched.date).toLocaleDateString([], { month: 'short' })}
                    </span>
                    <span className="text-sm mt-0.5 leading-none">
                      {new Date(sched.date).getDate()}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900">{sched.title}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">
                      {sched.type} deadline
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="sm:col-span-2 text-center py-6 text-xs text-slate-400 italic">
                No events on your calendar right now.
              </div>
            )}
          </div>
        </div>

        {/* Quick links & actions */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-2.5 mb-4">
            <ArrowRight className="h-4 w-4 text-blue-600" /> Quick Actions
          </h3>
          
          <div className="grid gap-2 grid-cols-2">
            {quickLinks && quickLinks.map((link: QuickLink, idx: number) => (
              <Link
                key={idx}
                to={link.path}
                className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50/30 hover:border-blue-200 p-3 text-center text-xs font-bold text-slate-700 transition"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}

// Simple placeholder fallback for the Lucide percent icon
function PercentIcon({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
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

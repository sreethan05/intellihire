import { type CSSProperties, useEffect, useState } from "react";
import { 
  Award, CheckCircle2, MessageSquareText, Target, 
  ShieldAlert, Flame, Briefcase, BarChart3, 
  Languages, ChevronDown, Check, AlertCircle
} from "lucide-react";
import { 
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, 
  XAxis, YAxis, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend 
} from "recharts";
import { candidateAnalyticsApi, interviewApi } from "@/lib/api";

const panelStyle: CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: 20,
  boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
};

interface HeatmapDay {
  date: string;
  count: number;
  week: number;
  day: number;
}

export default function CandidateExamAnalytics() {
  const [activeTab, setActiveTab] = useState<"overview" | "topics" | "coding" | "interviews" | "gaps">("overview");
  const [loading, setLoading] = useState(true);

  // States for all analytics data
  
  const [topicMastery, setTopicMastery] = useState<any>({ topics: [], strongest: null, weakest: null, peerAverage: [] });
  const [codingAnalytics, setCodingAnalytics] = useState<any>({ languages: [], difficulty: [], problemTypes: [] });
  const [interviewAnalytics, setInterviewAnalytics] = useState<any>({ interviews: [], averages: {}, count: 0 });
  const [pipelineData, setPipelineData] = useState<any>({ pipeline: [], stages: [] });
  const [streakData, setStreakData] = useState<any>({ currentStreak: 0, longestStreak: 0, heatmap: [], dayNames: [] });
  const [readinessData, setReadinessData] = useState<any>({ readinessScore: 0, zone: "needs_work", components: {} });
  const [proctoringData, setProctoringData] = useState<any>({ totalViolations: 0, byType: [], recentExams: [] });
  const [peerComparison, setPeerComparison] = useState<any>({ comparisons: [], overall: {} });

  // Voice interview deep dive states
  const [selectedInterviewId, setSelectedInterviewId] = useState<string>("");
  const [interviewAnswers, setInterviewAnswers] = useState<any[]>([]);
  const [answersLoading, setAnswersLoading] = useState(false);
  const [openAccordionIdx, setOpenAccordionIdx] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      candidateAnalyticsApi.getTopicMastery(),
      candidateAnalyticsApi.getCodingAnalytics(),
      candidateAnalyticsApi.getInterviewAnalytics(),
      candidateAnalyticsApi.getJobPipeline(),
      candidateAnalyticsApi.getStreak(),
      candidateAnalyticsApi.getReadinessScore(),
      candidateAnalyticsApi.getProctoringSummary(),
      candidateAnalyticsApi.getPeerComparison(),
    ])
      .then(([topicRes, codingRes, interviewRes, pipelineRes, streakRes, readinessRes, proctorRes, peerRes]) => {
        setTopicMastery(topicRes.data || { topics: [], strongest: null, weakest: null, peerAverage: [] });
        setCodingAnalytics(codingRes.data || { languages: [], difficulty: [], problemTypes: [] });
        setInterviewAnalytics(interviewRes.data || { interviews: [], averages: {}, count: 0 });
        setPipelineData(pipelineRes.data || { pipeline: [], stages: [] });
        setStreakData(streakRes.data || { currentStreak: 0, longestStreak: 0, heatmap: [], dayNames: [] });
        setReadinessData(readinessRes.data || { readinessScore: 0, zone: "needs_work", components: {} });
        setProctoringData(proctorRes.data || { totalViolations: 0, byType: [], recentExams: [] });
        setPeerComparison(peerRes.data || { comparisons: [], overall: {} });

        if (interviewRes.data?.interviews?.length > 0) {
          setSelectedInterviewId(interviewRes.data.interviews[0].id);
        }
      })
      .catch((err) => console.error("Error loading candidate analytics dashboard data", err))
      .finally(() => setLoading(false));
  }, []);

  // Fetch voice interview answers on selection change
  useEffect(() => {
    if (!selectedInterviewId) {
      setInterviewAnswers([]);
      return;
    }
    setAnswersLoading(true);
    setOpenAccordionIdx(null);
    interviewApi.getAnswers(selectedInterviewId)
      .then(({ data }) => {
        setInterviewAnswers(data.answers || []);
      })
      .catch((err) => console.error("Error fetching interview answers", err))
      .finally(() => setAnswersLoading(false));
  }, [selectedInterviewId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="h-80 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-80 animate-pulse rounded-lg bg-slate-200" />
        </div>
      </div>
    );
  }

  // Circular Gauge Calculations
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const readinessScore = readinessData.readinessScore || 0;
  const strokeDashoffset = circumference - (readinessScore / 100) * circumference;

  // Selected interview dimensions data for radar chart
  const selectedInterview = interviewAnalytics.interviews?.find((i: any) => i.id === selectedInterviewId);
  const interviewRadarData = selectedInterview ? [
    { subject: "Technical", score: selectedInterview.dimensions.technical, fullMark: 100 },
    { subject: "Relevance", score: selectedInterview.dimensions.relevance, fullMark: 100 },
    { subject: "Communication", score: selectedInterview.dimensions.communication, fullMark: 100 },
    { subject: "Speaking Pace", score: selectedInterview.dimensions.speaking, fullMark: 100 },
    { subject: "Pronunciation", score: selectedInterview.dimensions.pronunciation, fullMark: 100 },
    { subject: "Confidence/Intro", score: selectedInterview.dimensions.intro, fullMark: 100 },
  ] : [];

  // Topic mastery radar data combining candidate and peer averages
  const topicRadarData = topicMastery.topics?.map((topicObj: any) => {
    const peerObj = topicMastery.peerAverage?.find((p: any) => p.topic === topicObj.topic);
    return {
      topic: topicObj.topic,
      "You (%)": topicObj.accuracy,
      "Peer Average (%)": peerObj ? peerObj.accuracy : 50,
    };
  }) || [];

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Personalized Analytics & Insights</h1>
        <p className="mt-1 text-sm text-slate-500">
          Drill down into your skill gaps, practice consistency, coding success, and detailed AI feedback.
        </p>
      </div>

      {/* Tab Navigation Controls */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-px">
        {[
          { id: "overview", label: "Readiness & Overview", icon: Target },
          { id: "topics", label: "Topic Mastery Radar", icon: BarChart3 },
          { id: "coding", label: "Coding Analytics", icon: Languages },
          { id: "interviews", label: "AI Interview Breakdown", icon: MessageSquareText },
          { id: "gaps", label: "Skill Gaps & Recommendations", icon: Target },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px outline-none ${
                isActive
                  ? "border-violet-600 text-violet-700 font-extrabold"
                  : "border-transparent text-slate-500 hover:text-slate-950 hover:border-slate-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-12">
            
            {/* Predicted Readiness circular gauge card */}
            <div style={panelStyle} className="md:col-span-5 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">Predicted Placement Readiness</h3>
                <p className="text-xs text-slate-400 mt-1">Weighted score based on overall performance metrics.</p>
              </div>

              <div className="flex flex-col items-center justify-center my-6 relative">
                <svg className="w-36 h-36 transform -rotate-90">
                  <circle
                    cx="72"
                    cy="72"
                    r={radius}
                    stroke="#f1f5f9"
                    strokeWidth="9"
                    fill="transparent"
                  />
                  <circle
                    cx="72"
                    cy="72"
                    r={radius}
                    stroke={readinessScore >= 75 ? "#10b981" : readinessScore >= 50 ? "#f59e0b" : "#ef4444"}
                    strokeWidth="9"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-slate-950">{readinessScore}</span>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Composite</span>
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Exams Avg (40%)</span>
                  <span className="font-extrabold text-slate-800">{readinessData.components?.exam || 0}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Coding Score (25%)</span>
                  <span className="font-extrabold text-slate-800">{readinessData.components?.coding || 0}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Voice Interview (20%)</span>
                  <span className="font-extrabold text-slate-800">{readinessData.components?.interview || 0}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Streak Consistency (10%)</span>
                  <span className="font-extrabold text-slate-800">{readinessData.components?.consistency || 0}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Topic Breadth (5%)</span>
                  <span className="font-extrabold text-slate-800">{readinessData.components?.breadth || 0}%</span>
                </div>
              </div>
            </div>

            {/* Streak & practice consistency heatmap */}
            <div style={panelStyle} className="md:col-span-7 flex flex-col justify-between bg-white">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">Practice Streak Heatmap</h3>
                  <div className="flex items-center gap-1.5 rounded-full bg-orange-50 border border-orange-100 px-3 py-1 text-xs text-orange-600 font-extrabold">
                    <Flame className="h-4.5 w-4.5 animate-bounce fill-orange-500" />
                    <span>{streakData.currentStreak} Day Streak</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1">Consistency calendar grid tracking daily practice submissions.</p>
              </div>

              {/* GitHub style heatmap grid */}
              <div className="my-6 overflow-x-auto flex justify-center py-2 bg-slate-50/50 rounded-xl border border-slate-100 p-4">
                <div className="flex gap-1">
                  {/* Row headers for days */}
                  <div className="flex flex-col justify-between text-[9px] font-bold text-slate-400 pr-2 pb-1.5 select-none">
                    <span>Mon</span>
                    <span>Wed</span>
                    <span>Fri</span>
                  </div>
                  
                  {/* Heatmap Blocks */}
                  {Array.from({ length: 12 }).map((_, weekIndex) => (
                    <div key={weekIndex} className="flex flex-col gap-1">
                      {Array.from({ length: 7 }).map((_, dayIndex) => {
                        const item = streakData.heatmap?.find(
                          (h: HeatmapDay) => h.week === weekIndex && h.day === dayIndex
                        );
                        const isActive = item?.count && item.count > 0;
                        return (
                          <div
                            key={dayIndex}
                            title={`${item?.date || "Day"} : ${isActive ? "Practiced" : "No practice"}`}
                            className={`w-3.5 h-3.5 rounded-sm transition-all duration-300 ${
                              isActive 
                                ? "bg-emerald-500 shadow-[0_1px_2px_rgba(16,185,129,0.2)] hover:scale-115 cursor-pointer" 
                                : "bg-slate-100 hover:bg-slate-200"
                            }`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-3">
                <div className="text-slate-500">
                  Longest Practice Streak: <span className="font-extrabold text-slate-800">{streakData.longestStreak} days</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold select-none">
                  <span>Less</span>
                  <div className="w-3 h-3 bg-slate-100 rounded-sm" />
                  <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
                  <span>More</span>
                </div>
              </div>
            </div>

          </div>

          <div className="grid gap-6 md:grid-cols-2">
            
            {/* Job Pipeline Tracker */}
            <div style={panelStyle} className="bg-white">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="h-4.5 w-4.5 text-violet-600" />
                <h3 className="text-sm font-extrabold text-slate-800">Job Funnel &amp; Pipeline Status</h3>
              </div>
              
              {pipelineData.pipeline?.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 font-semibold bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  You haven't applied to any job drives yet.
                </div>
              ) : (
                <div className="space-y-6 max-h-[380px] overflow-y-auto pr-1">
                  {pipelineData.pipeline.map((job: any) => {
                    const currentStage = job.status;
                    const allStages = ["registered", "exam_taken", "passed", "shortlisted", "offered"];
                    const stageIndex = allStages.indexOf(currentStage === "rejected" || currentStage === "on_hold" ? "shortlisted" : currentStage);
                    
                    return (
                      <div key={job.jobId} className="border border-slate-100 rounded-xl p-4 bg-slate-50/30 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-900 text-xs">{job.jobTitle}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{job.companyName}</div>
                          </div>
                          
                          {/* Badges for warning/exceptional statuses */}
                          {currentStage === "rejected" && (
                            <span className="rounded-full bg-rose-50 border border-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-600 uppercase">Rejected</span>
                          )}
                          {currentStage === "on_hold" && (
                            <span className="rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600 uppercase">On Hold</span>
                          )}
                          {currentStage === "offered" && (
                            <span className="rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-700 uppercase animate-pulse">Offered 🎉</span>
                          )}
                        </div>

                        {/* Horizontal Stepper Progress */}
                        <div className="flex items-center justify-between relative py-2">
                          <div className="absolute left-1.5 right-1.5 top-1/2 h-0.5 bg-slate-100 -translate-y-1/2 z-0" />
                          <div 
                            className="absolute left-1.5 top-1/2 h-0.5 bg-violet-600 -translate-y-1/2 z-0 transition-all duration-500" 
                            style={{ width: `${stageIndex >= 0 ? (stageIndex / (allStages.length - 1)) * 100 : 0}%` }}
                          />
                          
                          {allStages.map((stageName, idx) => {
                            const isCompleted = idx <= stageIndex;
                            const isCurrent = idx === stageIndex;
                            
                            return (
                              <div key={stageName} className="flex flex-col items-center z-10 relative">
                                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border-2 transition-all ${
                                  isCompleted 
                                    ? "bg-violet-600 border-violet-600 text-white" 
                                    : "bg-white border-slate-200"
                                }`}>
                                  {isCompleted && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                </div>
                                <span className={`text-[8px] font-bold capitalize mt-1.5 select-none ${isCurrent ? 'text-violet-600 font-extrabold' : 'text-slate-400'}`}>
                                  {stageName.replace("_", " ")}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        
                        {job.recruiterNotes && (
                          <div className="rounded-lg bg-white p-2.5 border border-slate-100 text-[10px] text-slate-500 leading-relaxed font-semibold italic">
                            💬 Notes: {job.recruiterNotes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Proctoring Self-Review Violations summary */}
            <div style={panelStyle} className="bg-white flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldAlert className="h-4.5 w-4.5 text-rose-500" />
                  <h3 className="text-sm font-extrabold text-slate-800">Proctoring Self-Review Integrity</h3>
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Review warning counts and self-correct behaviors before recruiters raise review flags.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 my-4">
                {[
                  { label: "Tab Switches", key: "tab_switch", bg: "bg-rose-50", text: "text-rose-600", border: "border-rose-100" },
                  { label: "Face Missing", key: "face_missing", bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-100" },
                  { label: "Camera Offline", key: "camera_offline", bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" },
                ].map((violation) => {
                  const valObj = proctoringData.byType?.find((t: any) => t.type === violation.key);
                  const count = valObj?.count || 0;
                  return (
                    <div key={violation.label} className={`rounded-xl border ${violation.border} ${violation.bg} p-3.5 text-center`}>
                      <div className={`text-2xl font-black ${violation.text}`}>{count}</div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase mt-1 select-none leading-none">{violation.label}</div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-2 flex-1">
                <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider select-none mb-1">Proctor Tips to Improve</div>
                <ul className="text-xs text-slate-500 space-y-1.5 leading-relaxed">
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Use <strong>Fullscreen Mode</strong> and do not switch browser tabs during exams.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Maintain good <strong>webcam lighting</strong> so your face is visible at all times.</span>
                  </li>
                  {proctoringData.totalViolations > 0 && (
                    <li className="flex items-start gap-1.5 text-rose-500 font-semibold bg-rose-50/50 rounded-lg p-2 border border-rose-100/50 mt-1">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>You have {proctoringData.totalViolations} flagged events in recent exams. Please be cautious!</span>
                    </li>
                  )}
                </ul>
              </div>
            </div>

          </div>
        </div>
      )}

      {activeTab === "topics" && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-12">
            
            {/* Topic Mastery Radar chart */}
            <div style={panelStyle} className="md:col-span-7 bg-white">
              <div className="mb-4">
                <h3 className="text-sm font-extrabold text-slate-800">Topic Mastery &amp; Peer Radar</h3>
                <p className="text-xs text-slate-400 mt-1">Comparing your accuracy across topics vs the average of all peer candidates.</p>
              </div>

              {topicRadarData.length === 0 ? (
                <div className="py-24 text-center text-xs text-slate-400 font-semibold bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  Complete an exam to populate topic strengths and radar mappings.
                </div>
              ) : (
                <div className="h-80 w-full flex justify-center items-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={topicRadarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="topic" tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#94a3b8" }} />
                      <Radar name="You" dataKey="You (%)" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2.5} />
                      <Radar name="Peer Average" dataKey="Peer Average (%)" stroke="#94a3b8" fill="#cbd5e1" fillOpacity={0.1} strokeWidth={1.5} />
                      <Tooltip contentStyle={{ borderRadius: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Benchmarking list */}
            <div style={panelStyle} className="md:col-span-5 bg-white flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800">Topic Benchmarks</h3>
                <p className="text-xs text-slate-400 mt-1">Topic-wise percentiles and comparisons.</p>
              </div>

              <div className="space-y-4 my-4 overflow-y-auto max-h-[300px] flex-1 pr-1">
                {peerComparison.comparisons?.length === 0 ? (
                  <div className="py-16 text-center text-xs text-slate-400 font-semibold">
                    No topic benchmark comparisons yet.
                  </div>
                ) : (
                  peerComparison.comparisons.map((c: any) => {
                    const isTop = c.percentile >= 75;
                    const isBottom = c.percentile < 40;
                    return (
                      <div key={c.topic} className="border border-slate-100 rounded-xl p-3 bg-slate-50/20 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-extrabold text-slate-800">{c.topic}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            isTop 
                              ? "bg-emerald-50 border border-emerald-100 text-emerald-600" 
                              : isBottom 
                                ? "bg-rose-50 border border-rose-100 text-rose-600" 
                                : "bg-blue-50 border border-blue-100 text-blue-600"
                          }`}>
                            {isTop ? "Top Tier" : isBottom ? "Below Avg" : "Average"}
                          </span>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold">
                            <span>You: {c.myAccuracy}% vs Peer: {c.peerAccuracy}%</span>
                            <span>Percentile: {c.percentile}%</span>
                          </div>
                          
                          {/* Comparative visual bar */}
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden relative font-bold">
                            <div 
                              className="h-full bg-slate-300 rounded-full absolute" 
                              style={{ width: `${c.peerAccuracy}%` }} 
                            />
                            <div 
                              className="h-full bg-violet-600 rounded-full absolute" 
                              style={{ width: `${c.myAccuracy}%` }} 
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {peerComparison.overall && (
                <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs font-bold bg-violet-50/40 rounded-xl p-3.5 border border-violet-100/50">
                  <span className="text-violet-700">Overall Benchmark Percentile:</span>
                  <span className="text-violet-800 text-sm font-black">{peerComparison.overall.percentile}%</span>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {activeTab === "coding" && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            
            {/* Language success rate */}
            <div style={panelStyle} className="bg-white">
              <div className="mb-4">
                <h3 className="text-sm font-extrabold text-slate-800">Language Distribution &amp; Success</h3>
                <p className="text-xs text-slate-400 mt-1">Success rate and attempt counts for each language used.</p>
              </div>

              {codingAnalytics.languages?.length === 0 ? (
                <div className="py-24 text-center text-xs text-slate-400 font-semibold bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  No coding solutions submitted yet.
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={codingAnalytics.languages} layout="vertical" margin={{ left: -10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} />
                      <YAxis dataKey="language" type="category" tick={{ fontSize: 11, fill: "#64748b", fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Bar dataKey="successRate" name="Success Rate (%)" fill="#10b981" radius={[0, 5, 5, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Coding difficulties stats */}
            <div style={panelStyle} className="bg-white flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800">Problem Difficulty Progression</h3>
                <p className="text-xs text-slate-400 mt-1">Success rates grouped by question difficulty tags.</p>
              </div>

              <div className="space-y-4 my-6 flex-1 flex flex-col justify-center">
                {codingAnalytics.difficulty?.length === 0 ? (
                  <div className="py-16 text-center text-xs text-slate-400 font-semibold">
                    No difficulty breakdown details yet.
                  </div>
                ) : (
                  codingAnalytics.difficulty.map((diff: any) => {
                    const isEasy = String(diff.level).toLowerCase() === "easy";
                    const barColor = isEasy ? "bg-emerald-500" : "bg-rose-500";
                    const textColor = isEasy ? "text-emerald-700" : "text-rose-700";
                    const bgColor = isEasy ? "bg-emerald-50" : "bg-rose-50";
                    const borderColor = isEasy ? "border-emerald-100" : "border-rose-100";
                    
                    return (
                      <div key={diff.level} className="space-y-2 border border-slate-100 rounded-xl p-4 bg-slate-50/10">
                        <div className="flex items-center justify-between">
                          <span className={`rounded-lg border px-2.5 py-0.5 text-xs font-black uppercase ${textColor} ${bgColor} ${borderColor}`}>
                            {diff.level}
                          </span>
                          <span className="text-xs font-bold text-slate-500">Solved: {diff.total}</span>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[10px] text-slate-400 font-extrabold uppercase">
                            <span>Class Success Rate</span>
                            <span>{diff.successRate}%</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${barColor} rounded-full`} style={{ width: `${diff.successRate}%` }} />
                          </div>
                        </div>

                        <div className="text-[10px] font-bold text-slate-500 pt-1 flex items-center justify-between">
                          <span>Average score per question:</span>
                          <span className="font-extrabold text-slate-800">{diff.avgScore} pts</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t border-slate-100 pt-3 text-xs text-slate-400 leading-normal font-semibold">
                💡 Practicing intermediate/medium questions will push your predicted composite score higher.
              </div>
            </div>

          </div>
        </div>
      )}

      {activeTab === "interviews" && (
        <div className="space-y-6">
          <div style={panelStyle} className="bg-white">
            
            {/* Interview selector */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800">AI Voice Interview breakdown</h3>
                <p className="text-xs text-slate-400 mt-1">Review pronunciation, technical accuracy, pace, and transcript.</p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Select Interview:</span>
                <select
                  value={selectedInterviewId}
                  onChange={(e) => setSelectedInterviewId(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-violet-500 shadow-sm cursor-pointer"
                >
                  {interviewAnalytics.interviews?.length === 0 ? (
                    <option value="">No interviews found</option>
                  ) : (
                    interviewAnalytics.interviews.map((int: any) => (
                      <option key={int.id} value={int.id}>
                        {int.jobTitle} ({new Date(int.submittedAt).toLocaleDateString()})
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {selectedInterviewId ? (
              <div className="grid gap-6 md:grid-cols-12">
                
                {/* 6-Dimension Radar Chart */}
                <div className="md:col-span-5 flex flex-col justify-between">
                  <div className="h-64 w-full flex justify-center items-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={interviewRadarData}>
                        <PolarGrid stroke="#e2e8f0" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: "#64748b", fontSize: 10, fontWeight: 700 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#94a3b8" }} />
                        <Radar name="Score" dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} strokeWidth={2} />
                        <Tooltip />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                  
                  <div className="rounded-xl border border-violet-100 bg-violet-50/20 p-4 space-y-2 mt-4 text-xs font-semibold leading-relaxed">
                    <div className="text-violet-800 font-extrabold flex items-center gap-1">
                      <Award className="h-4.5 w-4.5" />
                      <span>AI Evaluator Feedback Summary</span>
                    </div>
                    <p className="text-slate-600 font-medium">{selectedInterview?.summary || "Great effort! Review the question transcripts on the right to improve technical accuracy."}</p>
                  </div>
                </div>

                {/* Per-Question Transcripts and feedback accordion */}
                <div className="md:col-span-7 flex flex-col space-y-4">
                  <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Per-Question Feedback &amp; Transcript</h4>
                  
                  {answersLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 space-y-2 border border-slate-100 rounded-xl bg-slate-50/50">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                      <span className="text-xs text-slate-400 font-bold">Loading questions...</span>
                    </div>
                  ) : interviewAnswers.length === 0 ? (
                    <div className="py-16 text-center text-xs text-slate-400 font-semibold border border-dashed border-slate-200 bg-slate-50/50 rounded-xl">
                      No question feedback responses recorded.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                      {interviewAnswers.map((answer, index) => {
                        const isOpen = openAccordionIdx === index;
                        return (
                          <div key={answer.id} className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/30">
                            {/* Header Toggle */}
                            <button
                              onClick={() => setOpenAccordionIdx(isOpen ? null : index)}
                              className="w-full flex items-center justify-between p-3.5 text-left border-b border-transparent bg-white hover:bg-slate-50 transition-colors"
                            >
                              <div className="flex items-start gap-2.5 pr-4">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                                  {index + 1}
                                </span>
                                <span className="text-xs font-bold text-slate-800 leading-normal">{answer.question}</span>
                              </div>
                              <ChevronDown className={`h-4.5 w-4.5 text-slate-400 shrink-0 transition-transform ${isOpen ? "transform rotate-180" : ""}`} />
                            </button>

                            {/* Accordion Content */}
                            {isOpen && (
                              <div className="p-4 bg-slate-50/40 border-t border-slate-100/60 space-y-3.5 text-xs font-semibold leading-relaxed">
                                <div className="space-y-1">
                                  <div className="text-[10px] font-extrabold uppercase text-slate-400 select-none">Your Answer Transcript:</div>
                                  <p className="text-slate-700 bg-white border border-slate-100 rounded-lg p-2.5 font-normal italic">
                                    "{answer.answer || "No vocal response captured."}"
                                  </p>
                                </div>
                                
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/20 p-3 space-y-1">
                                    <div className="text-[10px] font-black text-emerald-700 uppercase">Correct Concepts:</div>
                                    <p className="text-slate-600 font-normal leading-normal">{answer.correct_concepts || "Your response covers target definitions well."}</p>
                                  </div>
                                  <div className="rounded-xl border border-rose-100 bg-rose-50/20 p-3 space-y-1">
                                    <div className="text-[10px] font-black text-rose-700 uppercase">Gaps to Improve:</div>
                                    <p className="text-slate-600 font-normal leading-normal">{answer.gaps || "No major conceptual gaps identified."}</p>
                                  </div>
                                </div>

                                <div className="flex justify-between items-center text-[10px] font-bold border-t border-slate-100/80 pt-2 text-slate-400 select-none">
                                  <span>Evaluator ID: #{answer.id.slice(0,8)}</span>
                                  <span>Time taken: {answer.speaking_duration_sec || 20}s</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className="py-24 text-center text-xs text-slate-400 font-semibold bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                You haven't completed any AI Voice interviews yet. Complete exams to unlock interviews.
              </div>
            )}

          </div>
        </div>
      )}

      {activeTab === "gaps" && (
        <div className="space-y-6">
          {/* Skill Gap Summary Card */}
          <div style={panelStyle} className="bg-white">
            <div className="mb-4">
              <h3 className="text-sm font-extrabold text-slate-800">Skill Gap Analysis</h3>
              <p className="text-xs text-slate-400 mt-1">
                Your weakest topics identified with personalized recommendations to improve.
              </p>
            </div>

            {topicMastery.topics?.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400 font-semibold bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                Complete an exam to see your skill gaps and personalized recommendations.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Weakest Topics Highlighted */}
                {topicMastery.topics
                  ?.filter((t: any) => t.accuracy < 60)
                  .sort((a: any, b: any) => a.accuracy - b.accuracy)
                  .map((topic: any) => {
                    const peerObj = topicMastery.peerAverage?.find((p: any) => p.topic === topic.topic);
                    const peerAcc = peerObj?.accuracy || 50;
                    const gap = peerAcc - topic.accuracy;
                    return (
                      <div key={topic.topic} className="border border-rose-100 rounded-xl p-4 bg-rose-50/30 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-extrabold text-slate-900 text-sm">{topic.topic}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Your accuracy: {topic.accuracy}% · Peer avg: {peerAcc}%
                              {gap > 0 && <span className="text-rose-500 font-bold"> · {gap.toFixed(0)}% behind peers</span>}
                            </div>
                          </div>
                          <span className="rounded-full bg-rose-50 border border-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-600 uppercase">
                            Needs Work
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${topic.accuracy}%`,
                              background: topic.accuracy < 40 ? "#ef4444" : topic.accuracy < 60 ? "#f59e0b" : "#10b981",
                            }}
                          />
                        </div>
                        {/* Recommendation */}
                        <div className="flex items-start gap-2 bg-white rounded-lg p-2.5 border border-slate-100 text-xs text-slate-600">
                          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          <span>
                            <strong>Recommendation:</strong> Practice {topic.topic} problems in the sandbox.
                            Focus on {topic.difficulty || "medium"} difficulty level. You've answered{" "}
                            {topic.attempted || 0} questions with {(100 - topic.accuracy).toFixed(0)}% error rate.
                          </span>
                        </div>
                      </div>
                    );
                  })}

                {/* Strong Topics */}
                {topicMastery.topics
                  ?.filter((t: any) => t.accuracy >= 60)
                  .sort((a: any, b: any) => b.accuracy - a.accuracy)
                  .slice(0, 3)
                  .map((topic: any) => (
                    <div key={topic.topic} className="border border-emerald-100 rounded-xl p-4 bg-emerald-50/30 flex items-center justify-between">
                      <div>
                        <div className="font-extrabold text-slate-900 text-sm">{topic.topic}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Accuracy: {topic.accuracy}%</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-[10px] font-bold text-emerald-600 uppercase">Strong</span>
                      </div>
                    </div>
                  ))}

                {/* No weak topics */}
                {topicMastery.topics?.every((t: any) => t.accuracy >= 60) && (
                  <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <span className="text-sm font-bold text-emerald-700">
                      Great job! You're performing above 60% in all topics. Keep practicing to maintain your edge.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Coding Skill Gaps */}
          <div style={panelStyle} className="bg-white">
            <div className="mb-4">
              <h3 className="text-sm font-extrabold text-slate-800">Coding Language Proficiency</h3>
              <p className="text-xs text-slate-400 mt-1">
                Success rate by programming language across all coding submissions.
              </p>
            </div>
            <div className="space-y-3">
              {codingAnalytics.languages?.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 font-semibold">
                  No coding submissions yet. Try the practice sandbox!
                </div>
              ) : (
                codingAnalytics.languages?.map((lang: any) => (
                  <div key={lang.language} className="flex items-center gap-4">
                    <span className="text-xs font-bold text-slate-700 w-20">{lang.language}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${lang.successRate || 0}%`,
                          background: lang.successRate < 40 ? "#ef4444" : lang.successRate < 70 ? "#f59e0b" : "#10b981",
                        }}
                      />
                    </div>
                    <span className="text-xs font-extrabold text-slate-800 w-12 text-right">
                      {lang.successRate || 0}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Interview Skill Gaps */}
          <div style={panelStyle} className="bg-white">
            <div className="mb-4">
              <h3 className="text-sm font-extrabold text-slate-800">Interview Dimension Gaps</h3>
              <p className="text-xs text-slate-400 mt-1">
                Weakest interview dimensions that need improvement.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {(() => {
                const avgs = interviewAnalytics.averages || {};
                const dims = [
                  { label: "Technical", key: "technical", icon: "💻" },
                  { label: "Communication", key: "communication", icon: "💬" },
                  { label: "Relevance", key: "relevance", icon: "🎯" },
                  { label: "Speaking Pace", key: "speaking", icon: "🎤" },
                  { label: "Pronunciation", key: "pronunciation", icon: "🗣️" },
                  { label: "Intro/Confidence", key: "intro", icon: "✨" },
                ];
                return dims.map((dim) => {
                  const score = avgs[dim.key] || 0;
                  const isWeak = score < 60;
                  return (
                    <div
                      key={dim.key}
                      className={`rounded-xl border p-3 text-center ${
                        isWeak ? "border-rose-100 bg-rose-50/30" : "border-emerald-100 bg-emerald-50/30"
                      }`}
                    >
                      <div className="text-lg mb-1">{dim.icon}</div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">{dim.label}</div>
                      <div className={`text-xl font-black ${isWeak ? "text-rose-500" : "text-emerald-600"}`}>
                        {score}
                      </div>
                      {isWeak && (
                        <div className="text-[9px] text-rose-400 font-semibold mt-1">Below average</div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import {
  Bot,
  Briefcase,
  ShieldAlert,
  Target,
  UserCheck,
  Users,
  Landmark,
  Award,
  Sparkles,
  ArrowRight
} from "lucide-react";
import { Link } from "react-router-dom";
import { recruiterApi } from "@/lib/api";
import { useCollege } from "@/context/CollegeContext";
import { MetricCard } from "@/components/dashboard/DashboardKit";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function RecruiterDashboard() {
  const { selectedCollegeId, setSelectedCollegeId, collegesSummary } = useCollege();
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  
  // AI Shortlist States
  const [aiCriteria, setAiCriteria] = useState("");
  const [shortlist, setShortlist] = useState<any[]>([]);
  const [generatingShortlist, setGeneratingShortlist] = useState(false);

  // Comparison States
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [comparisonData, setComparisonData] = useState<any[]>([]);
  const [fetchingComparison, setFetchingComparison] = useState(false);
  const [showComparisonModal, setShowComparisonModal] = useState(false);

  useEffect(() => {
    setLoading(true);
    recruiterApi.getDashboard(selectedCollegeId)
      .then(({ data }) => setStats(data || {}))
      .catch((e) => console.error("Failed to load dashboard data", e))
      .finally(() => setLoading(false));
  }, [selectedCollegeId]);

  const activeCollege = collegesSummary.find((c) => c.id === selectedCollegeId);

  const handleAiShortlist = async () => {
    if (!aiCriteria.trim()) {
      toast.error("Please enter shortlist criteria");
      return;
    }
    setGeneratingShortlist(true);
    try {
      const { data } = await recruiterApi.aiShortlist(aiCriteria);
      setShortlist(data.shortlist || []);
      toast.success(`AI compiled a shortlist of ${data.shortlist?.length || 0} candidates!`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "AI Shortlist generation failed");
    } finally {
      setGeneratingShortlist(false);
    }
  };

  const toggleSelectCandidate = (candidateId: string) => {
    setSelectedCandidates(prev =>
      prev.includes(candidateId) ? prev.filter(c => c !== candidateId) : [...prev, candidateId]
    );
  };

  const handleCompare = async () => {
    if (selectedCandidates.length === 0) return;
    setFetchingComparison(true);
    try {
      const { data } = await recruiterApi.compareCandidates(selectedCandidates);
      setComparisonData(data.comparison || []);
      setShowComparisonModal(true);
    } catch (_err: any) {
      toast.error("Failed to fetch comparison details");
    } finally {
      setFetchingComparison(false);
    }
  };

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

  const dashboardStats = stats.stats || {};
  const funnelData = stats.funnel || [];
  const driveAnalytics = stats.driveAnalytics || [];
  const candidatePerformance = stats.candidatePerformance || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Dynamic Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {selectedCollegeId ? (
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <Landmark className="h-5 w-5 text-violet-600 animate-pulse" />
                {activeCollege?.name} Drive Console
              </h1>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Campus recruitment metrics filtered for {activeCollege?.name} ({activeCollege?.code}).
              </p>
            </div>
          ) : (
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <Landmark className="h-5 w-5 text-violet-600 animate-pulse" />
                All Campuses Drive Console
              </h1>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Aggregated campus placement outcomes, totals, and hiring trends across all locations.
              </p>
            </div>
          )}
        </div>

        {selectedCollegeId && (
          <button
            onClick={() => setSelectedCollegeId(null)}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-100 px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
          >
            Clear Campus Filter
          </button>
        )}
      </div>

      {/* Aggregated Overview Grid cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Candidates" value={dashboardStats.candidates || 0} icon={Users} tone="blue" />
        <MetricCard title="Job Drives" value={dashboardStats.drives || 0} icon={Briefcase} tone="cyan" />
        <MetricCard title="Assignments" value={dashboardStats.assignments || 0} icon={Target} tone="amber" />
        <MetricCard title="Offers" value={dashboardStats.offers || 0} icon={UserCheck} tone="green" />
      </div>

      {/* Quick Links Section */}
      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/recruiter/ai-studio" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:bg-violet-50/20">
          <div>
            <div className="font-bold text-slate-900">AI Studio</div>
            <div className="mt-1 text-xs text-slate-500">Generate MCQs, coding drafts, and custom AI templates.</div>
          </div>
          <Bot className="h-5 w-5 text-violet-600" />
        </Link>
        <Link to="/recruiter/proctoring" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:bg-violet-50/20">
          <div>
            <div className="font-bold text-slate-900">Proctoring Review</div>
            <div className="mt-1 text-xs text-slate-500">Inspect camera snap warnings and examine session logs.</div>
          </div>
          <ShieldAlert className="h-5 w-5 text-violet-600" />
        </Link>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Funnel chart card */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-800 mb-4">Hiring Funnel</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} margin={{ left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="value" name="Candidates Count" fill="#4f46e5" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Drive analytics card */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm flex flex-col justify-between bg-white">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 mb-4">Drives Engagement</h3>
            <div className="space-y-4">
              {driveAnalytics.map((drive: any) => (
                <div key={drive.driveId} className="border border-slate-100 rounded-xl p-3.5 bg-slate-50/50">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-800">{drive.company} - {drive.label}</span>
                    <span className="text-slate-500">{drive.completed} / {drive.assigned} Attempts</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-violet-600 rounded-full"
                      style={{ width: `${drive.assigned ? (drive.completed / drive.assigned) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
              {driveAnalytics.length === 0 && (
                <div className="text-xs text-slate-400 text-center py-6">No drive stats available.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Assisted Shortlists & Search */}
      <div className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
          <Sparkles className="h-4.5 w-4.5 text-blue-600" /> AI-Assisted Candidate Shortlist
        </h3>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={aiCriteria}
            onChange={(e) => setAiCriteria(e.target.value)}
            placeholder="e.g. Find top 3 candidates scoring >80% on exams with C++ or JavaScript skills"
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold outline-none focus:border-blue-500 bg-slate-50/50 focus:bg-white"
          />
          <Button 
            onClick={handleAiShortlist} 
            disabled={generatingShortlist}
            className="h-9 px-4 font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs self-start sm:self-auto"
          >
            {generatingShortlist ? "Analyzing Candidates..." : "Generate Shortlist"}
          </Button>
        </div>

        {/* Shortlist Results */}
        {shortlist.length > 0 && (
          <div className="mt-4 border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] text-slate-400 font-black uppercase tracking-wider">
                <tr>
                  <th className="p-3">Rank</th>
                  <th className="p-3">Candidate</th>
                  <th className="p-3">Match Justification</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {shortlist.map((c) => (
                  <tr key={c.candidate_id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-black text-blue-600">#{c.rank}</td>
                    <td className="p-3 font-bold text-slate-800">{c.name}</td>
                    <td className="p-3 text-slate-600">{c.justification}</td>
                    <td className="p-3 text-right">
                      <Link 
                        to={`/portfolio/${c.candidate_id}`} 
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline"
                        target="_blank"
                      >
                        View Passport <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Best Performers List with Comparison triggers */}
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm bg-white space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
            <Award className="h-4.5 w-4.5 text-yellow-500" />
            Top Candidate Performers
          </h3>
          {selectedCandidates.length > 0 && (
            <Button
              size="sm"
              onClick={handleCompare}
              disabled={fetchingComparison}
              className="h-8 px-4 font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs"
            >
              {fetchingComparison ? "Loading comparison..." : `Compare Selected (${selectedCandidates.length})`}
            </Button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-100">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 uppercase font-black tracking-wider">
                <th className="p-3 w-8 text-center">Compare</th>
                <th className="p-3">Candidate</th>
                <th className="p-3">Attempts Count</th>
                <th className="p-3">Avg score %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidatePerformance.map((candidate: any) => (
                <tr key={candidate.candidateId} className="hover:bg-slate-50/50">
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={selectedCandidates.includes(candidate.candidateId)}
                      onChange={() => toggleSelectCandidate(candidate.candidateId)}
                      className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 h-4 w-4"
                    />
                  </td>
                  <td className="p-3 font-bold text-slate-800">
                    <div>{candidate.name}</div>
                    <div className="text-[10px] text-slate-400 font-normal">{candidate.email}</div>
                  </td>
                  <td className="p-3 text-slate-600 font-semibold">{candidate.completedAttempts} attempts</td>
                  <td className="p-3 font-black text-violet-600">{candidate.averageScore}%</td>
                </tr>
              ))}
              {candidatePerformance.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-slate-400">No candidate metrics found yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comparison Overlay Modal */}
      {showComparisonModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-lg">Side-by-Side Candidate Comparison</h3>
              <button 
                onClick={() => setShowComparisonModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                Close (Esc)
              </button>
            </div>

            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${comparisonData.length + 1}, minmax(0, 1fr))` }}>
              {/* Labels Column */}
              <div className="space-y-4 font-bold text-slate-400 uppercase tracking-wide text-[10px] pt-12">
                <div className="h-10">Candidate</div>
                <div className="border-t border-slate-100 pt-3">Branch</div>
                <div className="border-t border-slate-100 pt-3">CGPA</div>
                <div className="border-t border-slate-100 pt-3">Avg Exam score</div>
                <div className="border-t border-slate-100 pt-3">Communication fit</div>
                <div className="border-t border-slate-100 pt-3">Technical fit</div>
                <div className="border-t border-slate-100 pt-3">Core Skills</div>
              </div>

              {/* Candidates Columns */}
              {comparisonData.map((cand) => (
                <div key={cand.candidateId} className="space-y-4 text-xs font-semibold text-slate-800 text-center border-l border-slate-100 pl-4">
                  <div className="h-10 flex flex-col justify-center items-center">
                    <span className="font-bold text-slate-900 text-sm block">{cand.name}</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">{cand.rollNumber || "ID Pending"}</span>
                  </div>
                  
                  <div className="border-t border-slate-100 pt-3 font-bold text-slate-700">
                    {cand.branch}
                  </div>
                  
                  <div className="border-t border-slate-100 pt-3 font-extrabold text-slate-900">
                    {cand.cgpa}
                  </div>
                  
                  <div className="border-t border-slate-100 pt-3 font-black text-violet-600">
                    {cand.avgExamScore}%
                  </div>
                  
                  <div className="border-t border-slate-100 pt-3 font-bold text-blue-600">
                    {cand.avgCommScore ? `${cand.avgCommScore}/10` : "N/A"}
                  </div>
                  
                  <div className="border-t border-slate-100 pt-3 font-bold text-indigo-600">
                    {cand.avgTechScore ? `${cand.avgTechScore}/10` : "N/A"}
                  </div>
                  
                  <div className="border-t border-slate-100 pt-3 flex flex-wrap gap-1 justify-center max-h-24 overflow-y-auto">
                    {cand.skills?.map((skill: string, sidx: number) => (
                      <span key={sidx} className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                        {skill}
                      </span>
                    )) || <span className="text-slate-400">None</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

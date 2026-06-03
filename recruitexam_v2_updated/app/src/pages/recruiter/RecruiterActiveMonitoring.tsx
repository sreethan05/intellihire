import { useEffect, useState, useRef } from "react";
import { useCollege } from "@/context/CollegeContext";
import { 
  Activity, 
  CheckCircle2, 
  Clock, 
  Monitor, 
  RefreshCw, 
  ShieldAlert, 
  User, 
  Lock, 
  Unlock, 
  Search, 
  Users 
} from "lucide-react";
import { examApi, proctoringApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import type { Exam } from "@/types";

export default function RecruiterActiveMonitoring() {
  const { selectedCollegeId } = useCollege();
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState("");
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const pollIntervalRef = useRef<number | null>(null);

  // Fetch exams on component mount
  useEffect(() => {
    examApi.getExams()
      .then(({ data }) => setExams(data.exams || []))
      .catch(() => toast.error("Failed to load exams"));

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Fetch active candidate list
  const loadActiveMonitoring = async (examId = selectedExam, silent = false) => {
    if (!examId) {
      setAttempts([]);
      return;
    }
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    
    try {
      const { data } = await proctoringApi.getActiveMonitoring(examId, selectedCollegeId);
      setAttempts(data.attempts || []);
    } catch (error) {
      console.error("Failed to load active monitoring", error);
      toast.error("Failed to load live proctoring feed");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Re-establish polling when the selected exam changes
  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (selectedExam) {
      void loadActiveMonitoring(selectedExam, false);
      
      // Dynamic active polling every 6 seconds as requested
      pollIntervalRef.current = window.setInterval(() => {
        void loadActiveMonitoring(selectedExam, true);
      }, 6000);
    } else {
      setAttempts([]);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [selectedExam, selectedCollegeId]);

  // Recruiter triggers unlock bypass
  const handleOverride = async (attemptId: string) => {
    try {
      await proctoringApi.overrideAttempt(attemptId);
      toast.success("Candidate session overridden and unlocked successfully!");
      // Instantly trigger silent refresh to update dashboard stats
      await loadActiveMonitoring(selectedExam, true);
    } catch (error) {
      console.error("Failed to override lock:", error);
      toast.error("Failed to execute bypass override.");
    }
  };

  const formatElapsedTime = (startedAtStr: string) => {
    const startedAt = new Date(startedAtStr);
    const diffMs = Date.now() - startedAt.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just started";
    if (diffMins === 1) return "1 min ago";
    return `${diffMins} mins ago`;
  };

  // Stats calculation
  const totalActive = attempts.length;
  const lockedAttempts = attempts.filter((attempt) => attempt.isLocked).length;
  const complianceRate = totalActive > 0 
    ? Math.round(((totalActive - lockedAttempts) / totalActive) * 100) 
    : 100;

  // Filter candidates based on search query
  const filteredAttempts = attempts.filter((attempt) => {
    const term = searchQuery.toLowerCase();
    return (
      attempt.candidateName.toLowerCase().includes(term) ||
      attempt.candidateEmail.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Upper Title Section */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Monitor className="h-5 w-5 text-indigo-600 animate-pulse" />
            Live Candidate Monitor (Active Exam Wall)
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Real-time candidate proctoring tracking, warning meters, and instant override bypasses.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedExam && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Polling Live
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadActiveMonitoring(selectedExam, true)}
            disabled={!selectedExam || loading || isRefreshing}
            className="h-9 px-3.5 border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 text-slate-500 ${(loading || isRefreshing) ? "animate-spin text-indigo-600" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Select Exam Bar */}
      <Card className="rounded-2xl border-slate-200/70 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex-1 max-w-md">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">Selected Active Exam</label>
            <select
              value={selectedExam}
              onChange={(e) => setSelectedExam(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="">Choose an active exam to monitor...</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.title} ({exam.duration} mins)
                </option>
              ))}
            </select>
          </div>

          {selectedExam && (
            <div className="relative w-full md:w-72 mt-2 md:mt-0">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">Filter Candidates</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-9 pr-4 text-xs font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!selectedExam ? (
        <Card className="rounded-2xl border-dashed border-2 border-slate-200 bg-slate-50/40 p-12 text-center">
          <CardContent className="flex flex-col items-center justify-center p-0">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-4 shadow-sm border border-indigo-100">
              <Monitor className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-800 leading-tight">No Exam Selected</h3>
            <p className="mt-1 max-w-sm text-xs font-medium text-slate-500 leading-relaxed">
              Please choose an exam from the selector dropdown to compile real-time candidate attempts and integrity stats.
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100 border-slate-200" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="h-44 animate-pulse rounded-2xl bg-slate-50 border-slate-100" />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Hero Live Metric Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Active Candidates */}
            <Card className="rounded-2xl border-slate-200/70 shadow-sm overflow-hidden bg-white hover:shadow-md transition duration-200">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <div className="text-2xl font-extrabold text-slate-900 tracking-tight">{totalActive}</div>
                  <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Active Candidates</div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                  <Users className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            {/* Currently Locked Candidates */}
            <Card className="rounded-2xl border-slate-200/70 shadow-sm overflow-hidden bg-white hover:shadow-md transition duration-200">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <div className={`text-2xl font-extrabold tracking-tight ${lockedAttempts > 0 ? "text-rose-600" : "text-slate-900"}`}>
                    {lockedAttempts}
                  </div>
                  <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Currently Locked Sessions</div>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${lockedAttempts > 0 ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                  <Lock className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            {/* Compliance Rate Percentage */}
            <Card className="rounded-2xl border-slate-200/70 shadow-sm overflow-hidden bg-white hover:shadow-md transition duration-200 sm:col-span-2 lg:col-span-1">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <div className={`text-2xl font-extrabold tracking-tight ${complianceRate < 80 ? "text-amber-600" : complianceRate < 95 ? "text-blue-600" : "text-emerald-600"}`}>
                    {complianceRate}%
                  </div>
                  <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Overall Compliance Rate</div>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${complianceRate < 80 ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"}`}>
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Grid Container */}
          <div>
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-3">Active Attempts ({filteredAttempts.length})</h3>

            {filteredAttempts.length === 0 ? (
              <Card className="rounded-2xl border-dashed border-2 border-slate-200 bg-slate-50/20 p-8 text-center">
                <CardContent className="flex flex-col items-center justify-center p-0">
                  <h4 className="text-xs font-bold text-slate-600">No Active Candidates Found</h4>
                  <p className="mt-1 text-[11px] text-slate-400 leading-normal max-w-xs">
                    {searchQuery ? "Try resetting your search query or looking for a different term." : "There are currently no candidates actively attempting this exam."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredAttempts.map((attempt) => (
                  <Card 
                    key={attempt.attemptId} 
                    className={`rounded-2xl border transition duration-200 shadow-sm ${
                      attempt.isLocked 
                        ? "border-rose-200 bg-rose-50/10 hover:shadow-rose-100/50" 
                        : "border-slate-200/70 bg-white hover:border-indigo-100 hover:shadow-indigo-50/40"
                    }`}
                  >
                    <CardContent className="p-5 flex flex-col h-full justify-between gap-4">
                      {/* Card Header Profile Block */}
                      <div className="flex gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white font-extrabold text-xs shadow-sm ${
                          attempt.isLocked ? "bg-rose-500" : "bg-gradient-to-br from-indigo-500 to-violet-500"
                        }`}>
                          <User className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-extrabold text-xs text-slate-900 truncate leading-tight">{attempt.candidateName}</div>
                          <div className="text-[10px] text-slate-400 font-semibold truncate mt-0.5">{attempt.candidateEmail}</div>
                        </div>
                      </div>

                      {/* Warnings and Status Details */}
                      <div className="space-y-2 rounded-xl bg-slate-50/60 p-3 text-[11px] font-semibold border border-slate-100">
                        <div className="flex justify-between items-center text-slate-500">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Elapsed</span>
                          <span className="text-slate-800 font-bold">{formatElapsedTime(attempt.startedAt)}</span>
                        </div>
                        
                        <div className="flex justify-between items-center text-slate-500">
                          <span className="flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> Warning Count</span>
                          <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                            attempt.warningCount >= 2 
                              ? "bg-rose-100 text-rose-700" 
                              : attempt.warningCount === 1 
                                ? "bg-amber-100 text-amber-700" 
                                : "bg-emerald-100 text-emerald-700"
                          }`}>
                            {attempt.warningCount} / 3 Warnings
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-center text-slate-500">
                          <span className="flex items-center gap-1"><Activity className="h-3 w-3" /> Lock Status</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                            attempt.isLocked 
                              ? "bg-rose-100 text-rose-700 border border-rose-200" 
                              : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          }`}>
                            {attempt.isLocked ? "Locked (Exited Fullscreen)" : "Active"}
                          </span>
                        </div>
                      </div>

                      {/* Card Action Override Button */}
                      {attempt.isLocked ? (
                        <Button
                          variant="destructive"
                          onClick={() => void handleOverride(attempt.attemptId)}
                          className="w-full h-9 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition"
                        >
                          <Unlock className="h-3.5 w-3.5" />
                          Bypass & Reset warnings
                        </Button>
                      ) : (
                        <div className="h-9 flex items-center justify-center text-[10px] text-slate-400 font-bold uppercase tracking-wider border border-dashed border-slate-200 rounded-lg select-none bg-slate-50/20">
                          Secure Session
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

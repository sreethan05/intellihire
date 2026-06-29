import { useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Mic,
  Sparkles,
  TrendingUp,
  UserRound,
  XCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { interviewApi } from "@/lib/api";
import { useCollege } from "@/context/CollegeContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

function parseFeedback(feedback: string | undefined): { text: string; audioUrl?: string } {
  if (!feedback) return { text: "" };
  try {
    const parsed = JSON.parse(feedback);
    if (parsed && typeof parsed === "object" && "feedback" in parsed) {
      return {
        text: parsed.feedback || "",
        audioUrl: parsed.audio_url || undefined,
      };
    }
  } catch {
    // ignore
  }
  return { text: feedback };
}

function ScoreBadge({ value, label }: { value: number; label: string }) {
  const color =
    value >= 75
      ? "bg-emerald-100 text-emerald-800"
      : value >= 50
      ? "bg-amber-100 text-amber-800"
      : "bg-rose-100 text-rose-700";
  return (
    <div className={`flex flex-col items-center rounded-lg px-3 py-2 ${color}`}>
      <div className="text-lg font-extrabold leading-none">{value}</div>
      <div className="mt-1 text-xs font-semibold">{label}</div>
    </div>
  );
}

export default function VoiceInterviews() {
  const { selectedCollegeId } = useCollege();
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, { answers: any[]; loading: boolean }>>({});

  const toggleExpand = (interviewId: string) => {
    setExpandedIds((prev) => {
      const isExpanded = prev.includes(interviewId);
      if (isExpanded) {
        return prev.filter((id) => id !== interviewId);
      } else {
        if (!details[interviewId]) {
          setDetails((prevD) => ({
            ...prevD,
            [interviewId]: { answers: [], loading: true },
          }));
          interviewApi.getAnswers(interviewId)
            .then(({ data }) => {
              setDetails((prevD) => ({
                ...prevD,
                [interviewId]: { answers: data.answers || [], loading: false },
              }));
            })
            .catch(() => {
              toast.error("Could not load interview details");
              setDetails((prevD) => ({
                ...prevD,
                [interviewId]: { answers: [], loading: false },
              }));
            });
        }
        return [...prev, interviewId];
      }
    });
  };

  useEffect(() => {
    setLoading(true);
    interviewApi
      .summaries(selectedCollegeId)
      .then(({ data }) => setInterviews(data.interviews || []))
      .catch(() => toast.error("Could not load AI interview results"))
      .finally(() => setLoading(false));
  }, [selectedCollegeId]);

  const completed = interviews.filter((i) => i.status === "completed");
  const pending = interviews.filter((i) => i.status !== "completed");
  const selectedCount = completed.filter((i) => i.selected).length;
  const avgScore =
    completed.length
      ? Math.round(completed.reduce((s: number, i: any) => s + (i.score || 0), 0) / completed.length)
      : 0;

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-20 animate-pulse rounded-lg bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-950">AI Interview Results</h1>
        <p className="mt-1 text-sm text-slate-500">
          Candidates who passed the exam are auto-shortlisted and complete a 3-stage AI face-to-face
          interview. Results appear here.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Total Interviews", value: interviews.length, color: "text-blue-700" },
          { label: "Completed", value: completed.length, color: "text-emerald-700" },
          { label: "Pending / Live", value: pending.length, color: "text-amber-700" },
          { label: "Selected", value: selectedCount, color: "text-violet-700" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className={`text-3xl font-extrabold ${color}`}>{value}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {completed.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            Average Overall Score
          </div>
          <div className="mt-1 text-3xl font-extrabold text-slate-950">{avgScore}/100</div>
        </div>
      )}

      {/* Interview cards */}
      <div className="space-y-4">
        {interviews.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white p-16 text-center text-sm text-slate-500">
            No AI interviews yet. Candidates are automatically shortlisted after passing their assigned exam.
          </div>
        )}

        {interviews.map((interview: any) => {
          const candidate = interview.candidate;
          const job = interview.job;
          const isCompleted = interview.status === "completed";
          const isPending = interview.status === "pending";

          return (
            <Card key={interview.id} className="rounded-lg border border-slate-200 bg-white transition-all hover:shadow-md">
              <CardHeader 
                className={`pb-3 ${isCompleted ? "cursor-pointer select-none" : ""}`}
                onClick={() => isCompleted && toggleExpand(interview.id)}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{candidate?.name || "Candidate"}</CardTitle>
                        {isCompleted && (
                          expandedIds.includes(interview.id) ? (
                            <ChevronUp className="h-4 w-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          )
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{candidate?.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {job && (
                      <div className="hidden rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 sm:block">
                        {job.title} · {job.company_name}
                      </div>
                    )}
                    {isCompleted ? (
                      <span
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                          interview.selected
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {interview.selected ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {interview.selected ? "Selected" : "Not Selected"}
                      </span>
                    ) : isPending ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                        Pending
                      </span>
                    ) : (
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                        In Progress
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>

              {isCompleted && (
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <ScoreBadge value={interview.intro_score || 0} label="Introduction" />
                    <ScoreBadge value={interview.speaking_score || 0} label="Speaking" />
                    <ScoreBadge value={interview.pronunciation_score || 0} label="Pronunciation" />
                    <ScoreBadge value={interview.technical_score || 0} label="Technical" />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-semibold text-slate-700">
                        Overall: <span className="font-extrabold text-slate-950">{interview.score || 0}/100</span>
                      </span>
                    </div>
                    {interview.communication_score !== undefined && (
                      <div className="flex items-center gap-2">
                        <Mic className="h-4 w-4 text-violet-600" />
                        <span className="text-sm font-semibold text-slate-700">
                          Communication:{" "}
                          <span className="font-extrabold text-slate-950">{interview.communication_score}/100</span>
                        </span>
                      </div>
                    )}
                    {interview.submitted_at && (
                      <div className="ml-auto text-xs text-slate-400">
                        Submitted {new Date(interview.submitted_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                    )}
                  </div>

                  {interview.summary && (
                    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                      {interview.summary}
                    </div>
                  )}
                  {interview.feedback && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-800">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                      {interview.feedback}
                    </div>
                  )}

                  {/* Expandable answers timeline */}
                  {expandedIds.includes(interview.id) && (
                    <div className="mt-6 border-t border-slate-100 pt-5 space-y-5">
                      <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                        <Bot className="h-4 w-4 text-blue-600 animate-pulse" /> Interview Timeline &amp; Evaluations
                      </h4>
                      {details[interview.id]?.loading ? (
                        <div className="flex items-center justify-center py-8 text-slate-500 gap-2">
                          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                          <span className="text-sm font-medium">Loading voice data...</span>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {details[interview.id]?.answers?.length === 0 ? (
                            <p className="text-sm text-slate-500 italic">No answers logged for this session.</p>
                          ) : (
                            details[interview.id]?.answers?.map((ans: any, idx: number) => {
                              const { text: feedbackText, audioUrl } = parseFeedback(ans.feedback);
                              const stageNum = idx < 2 ? 1 : idx < 4 ? 2 : 3;
                              const stageName = stageNum === 1 ? "Introduction" : stageNum === 2 ? "Speaking Skills" : "Technical Round";

                              return (
                                <div key={ans.id || idx} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 hover:shadow-md transition-all duration-300">
                                  {/* Item Header */}
                                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold text-slate-600 uppercase tracking-wider border border-slate-200">
                                        Q{idx + 1} · {stageName}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs text-slate-500 font-semibold">Evaluation Score:</span>
                                      <span className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-0.5 text-xs font-extrabold text-blue-700 shadow-sm">
                                        {ans.score || 0}/100
                                      </span>
                                    </div>
                                  </div>

                                  {/* Speech Bubble: AI Question */}
                                  <div className="flex items-start gap-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
                                      <Bot className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-800">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">AI Question</span>
                                      {ans.question}
                                    </div>
                                  </div>

                                  {/* Speech Bubble: Candidate Transcript */}
                                  <div className="flex items-start gap-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
                                      <UserRound className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 rounded-xl bg-white border border-slate-200 px-4 py-3 shadow-sm text-sm leading-relaxed text-slate-700">
                                      <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider block mb-1">Whisper Transcription</span>
                                      {ans.answer || <span className="italic text-slate-400">No response provided</span>}
                                    </div>
                                  </div>

                                  {/* Evaluation feedback and play button */}
                                  <div className="pl-11 space-y-3">
                                    {feedbackText && (
                                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5 text-sm leading-relaxed text-emerald-800 flex items-start gap-2.5 shadow-sm">
                                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                                        <div>
                                          <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">Evaluation Insight</span>
                                          {feedbackText}
                                        </div>
                                      </div>
                                    )}

                                    {audioUrl && (
                                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 max-w-lg shadow-sm flex flex-col gap-2">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                          <Mic className="h-3.5 w-3.5 text-blue-600 animate-pulse" /> Play voice recording
                                        </div>
                                        <audio src={audioUrl} controls className="w-full h-8 mt-1" />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              )}

              {!isCompleted && (
                <CardContent>
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    {isPending
                      ? "This candidate has been shortlisted and their AI interview link is active."
                      : "Interview is currently in progress."}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

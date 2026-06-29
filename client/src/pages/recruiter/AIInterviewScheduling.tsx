import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AxiosError } from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { interviewApi } from "@/lib/api";
import { useCollege } from "@/context/CollegeContext";

type Interview = {
  id: string;
  status: string;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  candidate?: { id: string; name: string; email: string };
  job?: { id: string; title: string };
  exam?: { id: string; title: string };
  score?: number;
  selected?: boolean;
  summary?: string;
  feedback?: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDateTimeLocal(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatMaybeDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function AIInterviewScheduling() {
  const { selectedCollegeId } = useCollege();
  const [pending, setPending] = useState<Interview[]>([]);
  const [completed, setCompleted] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [draftById, setDraftById] = useState<Record<string, { start: string; end: string }>>({});

  const refresh = async () => {
    setLoading(true);
    try {
      const [pendingRes, summariesRes] = await Promise.all([
        interviewApi.recruiterPending(selectedCollegeId),
        interviewApi.summaries(selectedCollegeId),
      ]);

      const pendingInterviews: Interview[] = pendingRes.data.interviews || [];
      const summaries: Interview[] = summariesRes.data.interviews || [];

      setPending(pendingInterviews);
      setCompleted(summaries.filter((i) => i.status === "completed"));
    } catch (err) {
      const e = err as AxiosError<any>;
      toast.error(e.response?.data?.error || "Failed to load interviews");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [selectedCollegeId]);

  const scheduleCandidate = async (interview: Interview) => {
    const draft = draftById[interview.id];
    const startRaw = draft?.start || "";
    const endRaw = draft?.end || "";

    if (!startRaw || !endRaw) {
      toast.error("Please provide both start and end time.");
      return;
    }

    let startIso = "";
    let endIso = "";
    try {
      startIso = new Date(startRaw).toISOString();
      endIso = new Date(endRaw).toISOString();
    } catch {
      toast.error("Invalid date/time values.");
      return;
    }

    setSavingId(interview.id);
    try {
      await interviewApi.schedule(interview.id, { scheduled_start_at: startIso, scheduled_end_at: endIso });
      toast.success("Interview scheduled successfully.");
      await refresh();
    } catch (err) {
      const e = err as AxiosError<any>;
      toast.error(e.response?.data?.error || "Failed to schedule interview");
    } finally {
      setSavingId(null);
    }
  };

  const completedSorted = useMemo(() => {
    return [...completed].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  }, [completed]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-slate-950">AI Interview Scheduling</h2>
        <p className="mt-1 text-sm text-slate-500">After a candidate passes the exam, schedule their AI interview start/end window.</p>
      </div>

      <Card className="rounded-lg">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Pending / Scheduled</CardTitle>
          <div className="mt-3">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-48 animate-pulse rounded-md bg-slate-100" />
          ) : pending.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">No interviews waiting for scheduling.</div>
          ) : (
            <div className="space-y-4">
              {pending.map((interview) => (
                <div key={interview.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-950">
                        {interview.candidate?.name || "Candidate"} ({interview.candidate?.email || "—"})
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Exam: {interview.exam?.title || "—"} · Job: {interview.job?.title || "—"}
                      </div>
                    </div>

                    <div className="text-xs font-bold">
                      {interview.scheduled_start_at && interview.scheduled_end_at ? (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">Scheduled</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Awaiting Schedule</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Start</Label>
                      <Input
                        type="datetime-local"
                        disabled={(!!interview.scheduled_start_at && !!interview.scheduled_end_at) || savingId === interview.id}
                        value={draftById[interview.id]?.start ?? toDateTimeLocal(interview.scheduled_start_at)}
                        onChange={(e) =>
                          setDraftById((prev) => ({ ...prev, [interview.id]: { ...(prev[interview.id] || { start: "", end: "" }), start: e.target.value } }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End</Label>
                      <Input
                        type="datetime-local"
                        disabled={(!!interview.scheduled_start_at && !!interview.scheduled_end_at) || savingId === interview.id}
                        value={draftById[interview.id]?.end ?? toDateTimeLocal(interview.scheduled_end_at)}
                        onChange={(e) =>
                          setDraftById((prev) => ({ ...prev, [interview.id]: { ...(prev[interview.id] || { start: "", end: "" }), end: e.target.value } }))
                        }
                      />
                    </div>
                  </div>

                  {interview.scheduled_start_at && interview.scheduled_end_at && (
                    <div className="mt-3 text-xs text-slate-600">
                      Window: {formatMaybeDateTime(interview.scheduled_start_at)} → {formatMaybeDateTime(interview.scheduled_end_at)}
                    </div>
                  )}

                  {(!interview.scheduled_start_at || !interview.scheduled_end_at) && (
                    <div className="mt-4 flex items-center justify-end gap-3">
                      <Button
                        disabled={savingId === interview.id}
                        onClick={() => void scheduleCandidate(interview)}
                      >
                        {savingId === interview.id ? "Scheduling..." : "Set Start/End"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Completed Results</CardTitle>
        </CardHeader>
        <CardContent>
          {completedSorted.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">No completed interviews yet.</div>
          ) : (
            <div className="space-y-4">
              {completedSorted.map((i) => (
                <div key={i.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-950">
                        {i.candidate?.name || "Candidate"} · Score: {i.score ?? 0}/100
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Exam: {i.exam?.title || "—"} · Job: {i.job?.title || "—"}
                      </div>
                    </div>
                    <div className="text-xs font-bold">
                      {i.selected ? (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">Selected</span>
                      ) : (
                        <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">Not Selected</span>
                      )}
                    </div>
                  </div>

                  {i.summary && <div className="mt-3 text-sm font-semibold text-slate-800">{i.summary}</div>}
                  {i.feedback && (
                    <div className="mt-2 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                      {i.feedback}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


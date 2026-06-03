import { useEffect, useState } from "react";
import { AlertTriangle, Camera, Eye, ShieldAlert } from "lucide-react";
import { examApi, proctoringApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Exam } from "@/types";

export default function RecruiterProctoring() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState("");
  const [summary, setSummary] = useState<any[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<any | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);

  useEffect(() => {
    examApi.getExams().then(({ data }) => setExams(data.exams || []));
  }, []);

  const loadSummary = async (examId = selectedExam) => {
    if (!examId) return;
    setLoading(true);
    try {
      const { data } = await proctoringApi.getExamSummary(examId);
      setSummary(data.summary || []);
    } finally {
      setLoading(false);
    }
  };

  const totalViolations = summary.reduce((sum, item) => sum + (item.violations || 0), 0);
  const flagged = summary.filter((item) => item.violations > 0).length;

  const loadAttemptEvents = async (item: any) => {
    setSelectedAttempt(item);
    setEventsLoading(true);
    try {
      const { data } = await proctoringApi.getAttemptEvents(item.attemptId);
      setEvents(data.events || []);
    } finally {
      setEventsLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-slate-950">Proctoring Review</h2>
        <p className="mt-1 text-sm text-slate-500">Review camera snapshots, violation counts, and integrity flags by exam.</p>
      </div>

      <Card className="rounded-lg">
        <CardContent className="flex flex-wrap items-center gap-3 p-5">
          <select
            value={selectedExam}
            onChange={(event) => {
              setSelectedExam(event.target.value);
              void loadSummary(event.target.value);
            }}
            className="h-10 min-w-72 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none"
          >
            <option value="">Select exam</option>
            {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}
          </select>
          <Button variant="outline" onClick={() => void loadSummary()} disabled={!selectedExam || loading}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Attempts", value: summary.length, icon: Camera },
          { label: "Flagged Candidates", value: flagged, icon: ShieldAlert },
          { label: "Total Violations", value: totalViolations, icon: ShieldAlert },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="rounded-lg">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <div className="text-2xl font-extrabold text-slate-950">{item.value}</div>
                  <div className="mt-1 text-xs font-semibold uppercase text-slate-500">{item.label}</div>
                </div>
                <Icon className="h-5 w-5 text-blue-600" />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base">Candidate Integrity Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">Candidate</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Snapshots</th>
                  <th className="p-3">Violations</th>
                  <th className="p-3">Last Flag</th>
                  <th className="p-3">Review</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((item) => (
                  <tr key={item.attemptId} className="border-t border-slate-100">
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{item.candidateName}</div>
                      <div className="text-xs text-slate-500">{item.candidateEmail}</div>
                    </td>
                    <td className="p-3 capitalize">{item.status}</td>
                    <td className="p-3">{item.snapshots}</td>
                    <td className={item.violations ? "p-3 font-bold text-rose-600" : "p-3 text-emerald-600"}>{item.violations}</td>
                    <td className="p-3 text-slate-600">{item.lastViolation || "Clear"}</td>
                    <td className="p-3">
                      <Button size="sm" variant="outline" onClick={() => void loadAttemptEvents(item)}>
                        <Eye className="mr-2 h-3.5 w-3.5" />
                        Events
                      </Button>
                    </td>
                  </tr>
                ))}
                {summary.length === 0 && (
                  <tr>
                    <td className="p-8 text-center text-slate-500" colSpan={6}>No proctoring data for this exam yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedAttempt && (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Event Log - {selectedAttempt.candidateName}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500">Loading events...</div>
            ) : events.length === 0 ? (
              <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500">No events recorded for this attempt.</div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {events.slice(0, 12).map((event) => (
                  <div key={event.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold capitalize text-slate-900">{String(event.event_type).replace("_", " ")}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {event.captured_at ? new Date(event.captured_at).toLocaleString() : "No timestamp"}
                        </div>
                      </div>
                      <span className={event.event_type === "violation" ? "rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-600" : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600"}>
                        {event.violation_count || 0}/3
                      </span>
                    </div>
                    {event.message && <p className="mt-3 text-sm leading-6 text-slate-600">{event.message}</p>}
                    {event.snapshot_data && (
                      <img
                        src={event.snapshot_data}
                        alt="Proctoring snapshot"
                        className="mt-3 aspect-video w-full rounded-md border border-slate-200 object-cover"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

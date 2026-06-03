import { useEffect, useState } from "react";
import { resultApi } from "@/lib/api";
import { X, CheckCircle2, XCircle, Code2, HelpCircle, FileText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AttemptDetailModalProps {
  attemptId: string;
  onClose: () => void;
}

export default function AttemptDetailModal({ attemptId, onClose }: AttemptDetailModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    resultApi.getAttempt(attemptId)
      .then((res) => {
        setData(res.data);
      })
      .catch((err) => {
        console.error("Fetch attempt detail error:", err);
        setError("Failed to load attempt details.");
      })
      .finally(() => setLoading(false));
  }, [attemptId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-100 animate-in fade-in-50 zoom-in-95 duration-150 overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-violet-50 p-2 text-violet-700">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight text-left">Exam Submission Review</h2>
              {data?.attempt?.users && (
                <p className="text-[11px] text-slate-500 font-bold text-left">
                  Candidate: {data.attempt.users.name} ({data.attempt.users.email})
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
              <p className="text-xs font-bold text-slate-400">Loading attempt response details...</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-5 text-center text-rose-600 space-y-3">
              <ShieldAlert className="h-8 w-8 mx-auto" />
              <p className="text-sm font-semibold">{error}</p>
              <Button onClick={onClose} variant="outline" size="sm">Close Modal</Button>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Attempt Overview Card */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-violet-50/30 border border-violet-100/70 p-4 rounded-xl">
                {[
                  { label: "Status", value: data.attempt.status === "completed" ? "Submitted" : "In Progress", color: "text-violet-700" },
                  { label: "Final Score", value: `${data.attempt.score ?? 0} / ${data.attempt.exams?.total_marks ?? 0}`, color: "text-emerald-700" },
                  { label: "Result", value: (data.attempt.score ?? 0) >= (data.attempt.exams?.pass_marks ?? 0) ? "PASS" : "FAIL", color: (data.attempt.score ?? 0) >= (data.attempt.exams?.pass_marks ?? 0) ? "text-green-600" : "text-rose-600" },
                  { label: "Submitted At", value: data.attempt.submitted_at ? new Date(data.attempt.submitted_at).toLocaleString() : "—", color: "text-slate-700" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-left">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
                    <div className={`text-sm font-extrabold mt-0.5 ${color}`}>{value}</div>
                  </div>
                ))}
              </div>

              {/* MCQs Section */}
              {data.answers && data.answers.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <HelpCircle className="h-4 w-4 text-slate-400" />
                    Multiple Choice Questions ({data.answers.length})
                  </h3>
                  <div className="space-y-3.5">
                    {data.answers.map((ans: any, idx: number) => {
                      const isCorrect = ans.is_correct;
                      const q = ans.questions || {};
                      
                      return (
                        <div key={ans.id || idx} className={`rounded-xl border p-4 text-left ${isCorrect ? "border-emerald-100 bg-emerald-50/10" : "border-rose-100 bg-rose-50/10"}`}>
                          <div className="flex justify-between items-start gap-3">
                            <span className="text-xs font-bold text-slate-400 shrink-0">Q{idx + 1}</span>
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-slate-800 leading-relaxed">{q.question_text}</p>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                                {[
                                  { label: "A", val: q.option_a },
                                  { label: "B", val: q.option_b },
                                  { label: "C", val: q.option_c },
                                  { label: "D", val: q.option_d }
                                ].map(({ label, val }) => {
                                  const isSelected = ans.selected_option === label;
                                  const isCorrectOption = q.correct_option === label;
                                  
                                  let bgClass = "bg-slate-50 border-slate-200 text-slate-700";
                                  if (isSelected) {
                                    bgClass = isCorrect ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800" : "bg-rose-500/10 border-rose-500/30 text-rose-800";
                                  } else if (isCorrectOption) {
                                    bgClass = "bg-emerald-500/10 border-emerald-500/30 text-emerald-800";
                                  }

                                  return (
                                    <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${bgClass}`}>
                                      <span className="font-bold">{label}.</span>
                                      <span className="flex-1">{val}</span>
                                      {isSelected && (isCorrect ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <XCircle className="h-4 w-4 text-rose-600 shrink-0" />)}
                                      {!isSelected && isCorrectOption && <CheckCircle2 className="h-4 w-4 text-emerald-600/60 shrink-0" />}
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="flex items-center justify-between border-t border-slate-100/80 pt-2.5 mt-3 text-[10px] font-bold">
                                <div className="text-slate-400 uppercase tracking-wide">
                                  Correct Option: <span className="text-emerald-700">{q.correct_option}</span> · Candidate Answer: <span className={isCorrect ? "text-emerald-700" : "text-rose-700"}>{ans.selected_option}</span>
                                </div>
                                <div className={isCorrect ? "text-emerald-700" : "text-slate-400"}>
                                  Marks Obtained: {ans.marks_obtained} / {q.marks}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Coding Submissions Section */}
              {data.codingSubmissions && data.codingSubmissions.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Code2 className="h-4 w-4 text-slate-400" />
                    Coding Submissions ({data.codingSubmissions.length})
                  </h3>
                  <div className="space-y-5">
                    {data.codingSubmissions.map((sub: any, idx: number) => {
                      const q = sub.coding_questions || {};
                      
                      return (
                        <div key={sub.id || idx} className="rounded-xl border border-slate-200 p-5 space-y-4 text-left">
                          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-bold text-slate-900">{q.title}</h4>
                                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">{q.difficulty}</span>
                              </div>
                              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Language: <span className="capitalize">{sub.language}</span></p>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-extrabold text-violet-750">{sub.score} / {q.marks} Marks</span>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Status: {sub.status}</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h5 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Problem Description</h5>
                            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50/50 p-3 rounded-lg border border-slate-100">{q.description}</p>
                          </div>

                          {/* Side-by-Side Code Viewer */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Candidate Code */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Candidate Code Submission</span>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wide">Evaluated</span>
                              </div>
                              <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-[11px] text-slate-200 font-mono h-60 border border-slate-800 leading-relaxed">
                                <code>{sub.code || "// No code submitted"}</code>
                              </pre>
                            </div>

                            {/* Reference Solution */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Optimal Reference Solution</span>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wide">Model Solution</span>
                              </div>
                              <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-[11px] text-slate-200 font-mono h-60 border border-slate-800 leading-relaxed">
                                <code>{q.starter_code || sub.code ? `// Standard reference solution or compiler schema template\n${q.starter_code || ""}` : "// No template provided"}</code>
                              </pre>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end shrink-0">
          <Button onClick={onClose} className="h-9 text-xs font-bold bg-slate-900 hover:bg-slate-850 text-white rounded-lg px-4 shadow-sm cursor-pointer">
            Close Panel
          </Button>
        </div>
      </div>
    </div>
  );
}

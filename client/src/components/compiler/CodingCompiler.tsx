import { useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  CheckCircle2,
  FlaskConical,
  Loader2,
  Play,
  RotateCcw,
  Send,
  XCircle,
  BookOpen,
  History,
  HelpCircle,
  FileCode2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { CodingQuestion } from "@/types";

interface TestResult {
  input: string;
  expected_output: string;
  actual_output: string;
  passed: boolean;
}

interface CodingCompilerProps {
  question: CodingQuestion;
  code: string;
  language: string;
  onCodeChange: (code: string, language: string) => void;
  onRun: (stdin?: string) => Promise<{
    output?: string;
    compile_output?: string;
    error?: string;
    status?: string;
  } | null>;
  onSubmit?: () => Promise<{
    results?: TestResult[];
    passed?: number;
    total?: number;
  } | null>;
  questionNumber: number;
  totalQuestions: number;
}

interface SubmissionLog {
  time: string;
  type: "Run Code" | "Submit Code";
  status: string;
  passed?: number;
  total?: number;
  output?: string;
  error?: string;
}



function getMonacoLanguage(language: string) {
  if (language === "cpp") return "cpp";
  if (language === "c") return "c";
  if (language === "javascript") return "javascript";
  return language;
}

function isProblemText(value: string) {
  const text = value.trim();
  if (!text) return false;

  const hasCodeSignal = /[{};=()<>]|\b(def|class|function|public|static|void|return|const|let|var|import|#include)\b/i.test(text);
  const hasProblemSignal = /\b(given|task|write|find|return|array|string|integer|output|input|distinct|element)\b/i.test(text);

  return hasProblemSignal && !hasCodeSignal && text.split(/\s+/).length >= 8;
}

function getStarterCode(question: CodingQuestion) {
  const starterCode = question.starter_code || "";
  const normalizedStarter = starterCode.trim();
  const normalizedDescription = (question.description || "").trim();

  if ((normalizedDescription && normalizedStarter === normalizedDescription) || (!normalizedDescription && isProblemText(starterCode))) {
    return "";
  }

  return starterCode;
}

function getProblemStatement(question: CodingQuestion) {
  const description = question.description?.trim();
  if (description) return description;

  if (isProblemText(question.starter_code || "")) {
    return question.starter_code.trim();
  }

  return "No problem statement was provided for this question.";
}

const languageOptions = [
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "java", label: "Java" },
  { value: "python", label: "Python 3" },
  { value: "javascript", label: "JavaScript" },
];

export default function CodingCompiler({
  question,
  code,
  language,
  onCodeChange,
  onRun,
  onSubmit,
  questionNumber,
  totalQuestions,
}: CodingCompilerProps) {
  const [activeTab, setActiveTab] = useState<"desc" | "sub">("desc");
  const [consoleTab, setConsoleTab] = useState<"output" | "custom">("output");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [submissionLogs, setSubmissionLogs] = useState<SubmissionLog[]>([]);

  const exampleCases = useMemo(() => (question.test_cases || []).slice(0, 3), [question.test_cases]);


  const handleRun = async () => {
    setRunning(true);
    setOutput("");
    setError("");
    setStatus("Running...");
    setConsoleTab("output");

    try {
      const result = await onRun(customInput);
      const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      
      if (result) {
        const outVal = result.output || result.compile_output || "";
        const errVal = result.error || "";
        const statVal = result.status || "Run complete";
        
        setOutput(outVal);
        setError(errVal);
        setStatus(statVal);

        setSubmissionLogs((prev) => [
          {
            time: timestamp,
            type: "Run Code",
            status: statVal,
            output: outVal || undefined,
            error: errVal || undefined,
          },
          ...prev,
        ]);
      }
    } catch (runError: unknown) {
      const message = runError instanceof Error ? runError.message : "Unknown error";
      const errText = `Execution failed: ${message}`;
      setError(errText);
      setStatus("Error");

      setSubmissionLogs((prev) => [
        {
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          type: "Run Code",
          status: "Error",
          error: errText,
        },
        ...prev,
      ]);
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!onSubmit) return;

    setSubmitting(true);
    setOutput("");
    setError("");
    setStatus("Testing...");
    setConsoleTab("output");

    try {
      const result = await onSubmit();
      const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      
      if (result) {
        setTestResults(result.results || null);
        const statVal = `${result.passed ?? 0}/${result.total ?? 0} tests passed`;
        setStatus(statVal);
        
        const isAllPassed = result.passed === result.total;
        setOutput(isAllPassed ? "All tests passed!" : statVal);

        setSubmissionLogs((prev) => [
          {
            time: timestamp,
            type: "Submit Code",
            status: isAllPassed ? "Accepted" : "Wrong Answer",
            passed: result.passed,
            total: result.total,
            output: isAllPassed ? "All tests passed!" : `${result.passed}/${result.total} test cases passed.`,
          },
          ...prev,
        ]);
        
        if (isAllPassed) {
          toast.success("Perfect score! All test cases passed.");
        } else {
          toast.error(`${result.passed} of ${result.total} test cases passed.`);
        }
      }
    } catch (submitError: unknown) {
      const message = submitError instanceof Error ? submitError.message : "Unknown error";
      const errText = `Submission failed: ${message}`;
      setError(errText);
      setStatus("Error");

      setSubmissionLogs((prev) => [
        {
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          type: "Submit Code",
          status: "Error",
          error: errText,
        },
        ...prev,
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  const getDifficultyColor = (diff: string) => {
    const d = (diff || "").toLowerCase();
    if (d === "easy") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (d === "medium" || d === "average" || d === "intermediate") return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-rose-50 text-rose-700 border-rose-200";
  };

  return (
    <div className="grid h-[calc(100vh-285px)] min-h-[580px] lg:grid-cols-12 gap-5 items-stretch overflow-hidden">
      
      {/* Left Column: Problem details, description, example test cases & submissions log */}
      <div className="lg:col-span-5 flex flex-col bg-white border border-slate-200/60 rounded-2xl shadow-xs overflow-hidden min-h-0">
        
        {/* Tab Headers */}
        <div className="flex border-b border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={() => setActiveTab("desc")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-all border-b-2 outline-none cursor-pointer ${
              activeTab === "desc"
                ? "border-violet-600 text-violet-700 bg-white"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/50"
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Description
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("sub")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-all border-b-2 outline-none cursor-pointer ${
              activeTab === "sub"
                ? "border-violet-600 text-violet-700 bg-white"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/50"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            Submissions
          </button>
        </div>

        {/* Tab Content Panels */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0 space-y-4">
          
          {activeTab === "desc" && (
            <>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-[10px] font-bold text-slate-500 bg-slate-50 border-slate-200">
                  Question {questionNumber} of {totalQuestions}
                </Badge>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${getDifficultyColor(question.difficulty)}`}>
                  {question.difficulty || "Medium"}
                </span>
                <Badge variant="outline" className="text-[10px] font-bold text-violet-750 border-violet-200 bg-violet-50">
                  Marks: +{question.marks}
                </Badge>
              </div>

              <h2 className="text-base font-extrabold text-slate-850 tracking-tight">{question.title}</h2>
              
              <div className="text-xs text-slate-650 leading-relaxed whitespace-pre-wrap font-medium">
                {getProblemStatement(question)}
              </div>

              {/* Examples */}
              {exampleCases.length > 0 && (
                <div className="space-y-3.5 pt-2 border-t border-slate-100">
                  {exampleCases.map((testCase, index) => (
                    <div key={index} className="space-y-1.5">
                      <div className="text-xs font-bold text-slate-700">Example {index + 1}:</div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 font-mono text-[10.5px] leading-relaxed text-slate-750">
                        <div className="flex gap-1.5">
                          <span className="font-bold text-slate-900">Input:</span>
                          <span className="whitespace-pre-wrap">{testCase.input || "(empty)"}</span>
                        </div>
                        <div className="flex gap-1.5 mt-1">
                          <span className="font-bold text-slate-900">Output:</span>
                          <span className="whitespace-pre-wrap">{testCase.expected_output || "(empty)"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === "sub" && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-700">Session Submission History</div>
              
              {submissionLogs.length === 0 ? (
                <div className="text-center py-12 text-[11px] text-slate-400 font-semibold border border-dashed border-slate-200 rounded-xl">
                  No execution runs triggered in this session yet. Run or submit code to populate history.
                </div>
              ) : (
                <div className="space-y-2">
                  {submissionLogs.map((log, i) => (
                    <div
                      key={i}
                      className={`flex flex-col p-3 rounded-xl border text-xs gap-1 ${
                        log.status === "Error" || log.status === "Wrong Answer"
                          ? "bg-rose-50/40 border-rose-100 text-rose-800"
                          : log.status.includes("passed") || log.status === "Accepted"
                            ? "bg-emerald-50/40 border-emerald-100 text-emerald-800"
                            : "bg-violet-50/45 border-violet-100 text-violet-850"
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span>{log.type}</span>
                        <span className="text-[10px] text-slate-400 font-normal">{log.time}</span>
                      </div>
                      <div className="font-extrabold text-[11px]">{log.status}</div>
                      {log.error && (
                        <pre className="font-mono text-[9.5px] leading-tight text-rose-600 bg-white/70 p-1.5 rounded border border-rose-100/50 mt-1 whitespace-pre-wrap max-h-20 overflow-y-auto">
                          {log.error}
                        </pre>
                      )}
                      {log.output && !log.error && (
                        <pre className="font-mono text-[9.5px] leading-tight text-slate-700 bg-white/70 p-1.5 rounded border border-slate-100/50 mt-1 whitespace-pre-wrap max-h-20 overflow-y-auto">
                          {log.output}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Right Column: Code Editor, Compile Actions & Verification Drawer */}
      <div className="lg:col-span-7 flex flex-col bg-white border border-slate-200/60 rounded-2xl shadow-xs overflow-hidden min-h-0">
        
        {/* Editor Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/30 shrink-0">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <FileCode2 className="h-4 w-4 text-violet-600" />
            <span>Interactive Console IDE</span>
          </div>
          
          <div className="flex items-center gap-2">
            <select
              value={language}
              onChange={(e) => onCodeChange(code, e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 outline-none focus:border-violet-500 cursor-pointer shadow-xs"
            >
              {languageOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onCodeChange(getStarterCode(question), language);
                toast.success("Starter code template loaded.");
              }}
              className="h-8 border-slate-200 text-slate-600 font-bold text-[11px] rounded-lg bg-white hover:bg-slate-50"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Reset
            </Button>
          </div>
        </div>

        {/* Monaco Editor component */}
        <div className="flex-1 overflow-hidden min-h-0 relative border-b border-slate-100">
          <Editor
            height="100%"
            language={getMonacoLanguage(language)}
            value={code}
            onChange={(value) => onCodeChange(value || "", language)}
            theme="light"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "on",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              wordWrap: "on",
              padding: { top: 12, bottom: 12 },
              smoothScrolling: true,
              cursorBlinking: "smooth",
              fontFamily: "Fira Code, Menlo, Monaco, Consolas, Courier New, monospace",
            }}
          />
        </div>

        {/* Drawer Console Output / Checkpoints Panel */}
        <div className="bg-slate-50/50 p-4 shrink-0 flex flex-col space-y-3 border-t border-slate-100">
          <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)] gap-4 items-stretch">
            
            {/* Console output with tabs: Terminal Output & Custom Input */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-col justify-between min-h-[145px]">
              
              {/* Header Tabs */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConsoleTab("output")}
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded transition ${
                      consoleTab === "output"
                        ? "bg-slate-100 text-slate-800"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    Terminal Output
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsoleTab("custom")}
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded transition ${
                      consoleTab === "custom"
                        ? "bg-slate-100 text-slate-800"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    Custom Input
                  </button>
                </div>

                {consoleTab === "output" && status && (
                  <Badge
                    className={`h-5 text-[9px] font-bold rounded ${
                      status.includes("passed") && !status.startsWith("0/")
                        ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                        : status === "Error" || status.includes("Error") || status.startsWith("0/") || status === "Wrong Answer"
                          ? "bg-rose-600 hover:bg-rose-600 text-white"
                          : "bg-violet-600 hover:bg-violet-600 text-white"
                    }`}
                  >
                    {status}
                  </Badge>
                )}
              </div>

              {/* Tab Display Area */}
              <div className="flex-1 overflow-y-auto max-h-24 py-2 font-mono text-[10px] leading-relaxed text-slate-650">
                {consoleTab === "custom" ? (
                  <Textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="Enter custom stdin inputs for code execution..."
                    className="h-16 min-h-16 resize-none rounded-lg border-slate-200 bg-white text-[10.5px] p-2 focus:border-violet-500 font-mono"
                    maxLength={1000}
                  />
                ) : error ? (
                  <pre className="text-rose-650 whitespace-pre-wrap font-bold bg-rose-50/50 p-2 rounded-lg border border-rose-100/50">
                    {error}
                  </pre>
                ) : output ? (
                  <pre className="text-slate-800 whitespace-pre-wrap bg-slate-50/80 p-2 rounded-lg border border-slate-100">
                    {output}
                  </pre>
                ) : (
                  <div className="text-slate-400 italic">
                    Write code and click Run Code or Submit to evaluate.
                  </div>
                )}
              </div>

            </div>

            {/* Verification Checkpoints list */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 min-h-[145px] flex flex-col justify-between">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5 text-violet-500" />
                test cases checkpoints
              </div>

              <div className="flex-1 overflow-y-auto pt-2 space-y-1.5 max-h-24">
                {!testResults ? (
                  (question.test_cases || []).length === 0 ? (
                    <div className="text-[10px] text-slate-400 italic">
                      No test cases specified for this question.
                    </div>
                  ) : (
                    (question.test_cases || []).map((_, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-bold border border-slate-100 bg-slate-50 text-slate-400"
                      >
                        <div className="flex items-center gap-1.5">
                          <HelpCircle className="h-3.5 w-3.5 text-slate-300" />
                          <span>Case {index + 1}</span>
                        </div>
                        <span className="text-[8px] uppercase font-normal tracking-wide text-slate-350">
                          Pending
                        </span>
                      </div>
                    ))
                  )
                ) : (
                  testResults.map((tr, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition ${
                        tr.passed
                          ? "bg-emerald-500/5 border-emerald-100/70 text-emerald-800"
                          : "bg-rose-500/5 border-rose-100/70 text-rose-800"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {tr.passed ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-rose-600" />
                        )}
                        <span>Case {index + 1}</span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-normal">
                        {tr.passed ? "Success" : "Failed"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* Code run trigger actions buttons */}
          <div className="flex justify-end gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={handleRun}
              disabled={running || submitting}
              className="h-9 px-4 font-bold text-xs rounded-lg border-slate-200 text-slate-650 bg-white hover:bg-slate-50 transition"
            >
              {running ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5" />
              )}
              Run Code
            </Button>
            
            {onSubmit && (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={running || submitting}
                className="h-9 px-4 font-extrabold text-xs rounded-lg bg-gradient-to-r from-violet-650 to-indigo-650 hover:from-violet-700 hover:to-indigo-700 text-white shadow-xs transition"
              >
                {submitting ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                )}
                Submit Code
              </Button>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}

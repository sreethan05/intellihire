import { useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  FileCode2,
  HelpCircle,
  History,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Terminal,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { toast } from "sonner";
import type { CodingQuestion } from "@/types";

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────

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

const difficultyStyles: Record<string, string> = {
  easy: "text-emerald-400",
  medium: "text-amber-400",
  average: "text-amber-400",
  intermediate: "text-amber-400",
  hard: "text-rose-400",
};

function getDifficultyClass(diff: string) {
  return difficultyStyles[(diff || "").toLowerCase()] || "text-amber-400";
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const isAccepted = status === "Accepted" || (status.includes("passed") && !status.startsWith("0/"));
  const isError = status === "Error" || status.includes("Error") || status.startsWith("0/") || status === "Wrong Answer";
  const color = isAccepted
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : isError
      ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
      : "bg-violet-500/15 text-violet-400 border-violet-500/30";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${color}`}>
      {status}
    </span>
  );
}

function TestCaseTabs({
  testCases,
  results,
}: {
  testCases: CodingQuestion["test_cases"];
  results: TestResult[] | null;
}) {
  const [activeCase, setActiveCase] = useState(0);
  const hasResults = results && results.length > 0;
  const count = hasResults ? results.length : (testCases || []).length;

  if (count === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-slate-500">
        No test cases specified for this question.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Case selector pills */}
      <div className="flex flex-wrap gap-1.5 pb-2">
        {Array.from({ length: count }).map((_, i) => {
          const passed = hasResults ? results![i]?.passed : null;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setActiveCase(i)}
              className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] font-bold transition ${
                activeCase === i
                  ? "border-slate-600 bg-slate-700 text-slate-100"
                  : "border-slate-700 bg-slate-800/50 text-slate-400 hover:text-slate-200"
              }`}
            >
              {passed === true && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
              {passed === false && <XCircle className="h-3 w-3 text-rose-500" />}
              Case {i + 1}
            </button>
          );
        })}
      </div>

      {/* Case detail */}
      <div className="flex-1 overflow-y-auto">
        {hasResults ? (
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Input</div>
              <pre className="rounded-md border border-slate-700 bg-slate-900/60 p-2.5 font-mono text-[10.5px] leading-relaxed text-slate-300 whitespace-pre-wrap">
                {results![activeCase]?.input || "(empty)"}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Expected</div>
              <pre className="rounded-md border border-slate-700 bg-slate-900/60 p-2.5 font-mono text-[10.5px] leading-relaxed text-emerald-300/80 whitespace-pre-wrap">
                {results![activeCase]?.expected_output || "(empty)"}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Output</div>
              <pre
                className={`rounded-md border p-2.5 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap ${
                  results![activeCase]?.passed
                    ? "border-emerald-700/50 bg-emerald-950/20 text-emerald-300"
                    : "border-rose-700/50 bg-rose-950/20 text-rose-300"
                }`}
              >
                {results![activeCase]?.actual_output || "(empty)"}
              </pre>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Input</div>
              <pre className="rounded-md border border-slate-700 bg-slate-900/60 p-2.5 font-mono text-[10.5px] leading-relaxed text-slate-300 whitespace-pre-wrap">
                {testCases[activeCase]?.input || "(empty)"}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Expected Output</div>
              <pre className="rounded-md border border-slate-700 bg-slate-900/60 p-2.5 font-mono text-[10.5px] leading-relaxed text-slate-300 whitespace-pre-wrap">
                {testCases[activeCase]?.expected_output || "(empty)"}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

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
  const [leftTab, setLeftTab] = useState<"desc" | "sub">("desc");
  const [bottomTab, setBottomTab] = useState<"testcases" | "custom" | "result">("testcases");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [submissionLogs, setSubmissionLogs] = useState<SubmissionLog[]>([]);

  const exampleCases = useMemo(() => (question.test_cases || []).slice(0, 3), [question.test_cases]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleRun = async () => {
    setRunning(true);
    setOutput("");
    setError("");
    setStatus("Running...");
    setBottomTab("testcases");

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
          { time: timestamp, type: "Run Code", status: statVal, output: outVal || undefined, error: errVal || undefined },
          ...prev,
        ]);
      }
    } catch (runError: unknown) {
      const message = runError instanceof Error ? runError.message : "Unknown error";
      const errText = `Execution failed: ${message}`;
      setError(errText);
      setStatus("Error");

      setSubmissionLogs((prev) => [
        { time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), type: "Run Code", status: "Error", error: errText },
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

    try {
      const result = await onSubmit();
      const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      if (result) {
        setTestResults(result.results || null);
        setBottomTab("result");
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
        { time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), type: "Submit Code", status: "Error", error: errText },
        ...prev,
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (

    <div className="flex h-[calc(100vh-220px)] min-h-[500px] w-full overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900">

      <ResizablePanelGroup orientation="horizontal" className="h-full">

        {/* ── LEFT: Problem Description / Submissions ────────────────────── */}

        <ResizablePanel defaultSize={42} minSize={28} className="flex flex-col bg-slate-900">

          {/* Left tab header */}

          <div className="flex shrink-0 border-b border-slate-700/50">

            <button

              type="button"

              onClick={() => setLeftTab("desc")}

              className={`flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-bold transition-colors ${

                leftTab === "desc"

                  ? "border-b-2 border-violet-500 text-slate-100"

                  : "border-b-2 border-transparent text-slate-500 hover:text-slate-300"

              }`}

            >

              Description

            </button>

            <button

              type="button"

              onClick={() => setLeftTab("sub")}

              className={`flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-bold transition-colors ${

                leftTab === "sub"

                  ? "border-b-2 border-violet-500 text-slate-100"

                  : "border-b-2 border-transparent text-slate-500 hover:text-slate-300"

              }`}

            >

              <History className="h-3 w-3" />

              Submissions

            </button>

          </div>

 

          {/* Left content */}

          <div className="flex-1 overflow-y-auto p-5 min-h-0">

            {leftTab === "desc" ? (

              <div className="space-y-4">

                {/* Title + meta row */}

                <div className="flex flex-wrap items-center gap-2.5">

                  <span className="text-[10px] font-bold text-slate-500">

                    {questionNumber}. Question {questionNumber} of {totalQuestions}

                  </span>

                  <span className={`text-[10px] font-bold ${getDifficultyClass(question.difficulty)}`}>

                    {question.difficulty || "Medium"}

                  </span>

                  <span className="text-[10px] font-bold text-slate-600">·</span>

                  <span className="text-[10px] font-bold text-violet-400">+{question.marks} marks</span>

                </div>

 

                <h2 className="text-lg font-bold text-slate-100">{question.title}</h2>

 

                <div className="text-[12px] leading-relaxed text-slate-400 whitespace-pre-wrap">

                  {getProblemStatement(question)}

                </div>

 

                {/* Examples */}

                {exampleCases.length > 0 && (

                  <div className="space-y-3 border-t border-slate-700/40 pt-4">

                    {exampleCases.map((testCase, index) => (

                      <div key={index} className="space-y-1.5">

                        <div className="text-[11px] font-bold text-slate-300">Example {index + 1}:</div>

                        <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3 font-mono text-[10.5px] leading-relaxed text-slate-300">

                          <div>

                            <span className="font-bold text-slate-200">Input: </span>

                            <span className="whitespace-pre-wrap">{testCase.input || "(empty)"}</span>

                          </div>

                          <div className="mt-1">

                            <span className="font-bold text-slate-200">Output: </span>

                            <span className="whitespace-pre-wrap">{testCase.expected_output || "(empty)"}</span>

                          </div>

                        </div>

                      </div>

                    ))}

                  </div>

                )}

              </div>

            ) : (

              <div className="space-y-3">

                <div className="text-[11px] font-bold text-slate-300">Session Submission History</div>

 

                {submissionLogs.length === 0 ? (

                  <div className="rounded-lg border border-dashed border-slate-700/50 py-10 text-center text-[11px] text-slate-500">

                    No execution runs triggered yet.

                    <br />

                    Run or submit code to populate history.

                  </div>

                ) : (

                  <div className="space-y-2">

                    {submissionLogs.map((log, i) => {

                      const isError = log.status === "Error" || log.status === "Wrong Answer";

                      const isAccepted = log.status === "Accepted" || (log.status.includes("passed") && !log.status.startsWith("0/"));

                      return (

                        <div

                          key={i}

                          className={`rounded-lg border p-2.5 text-[11px] ${

                            isError

                              ? "border-rose-700/40 bg-rose-950/15"

                              : isAccepted

                                ? "border-emerald-700/40 bg-emerald-950/15"

                                : "border-slate-700/40 bg-slate-800/30"

                          }`}

                        >

                          <div className="flex items-center justify-between font-bold text-slate-200">

                            <span>{log.type}</span>

                            <span className="flex items-center gap-1 text-[9px] font-normal text-slate-500">

                              <Clock className="h-2.5 w-2.5" />

                              {log.time}

                            </span>

                          </div>

                          <div className="mt-0.5 text-[10px] font-bold text-slate-400">{log.status}</div>

                          {log.error && (

                            <pre className="mt-1 max-h-16 overflow-y-auto whitespace-pre-wrap rounded border border-rose-900/30 bg-black/20 p-1.5 font-mono text-[9px] leading-tight text-rose-400">

                              {log.error}

                            </pre>

                          )}

                          {log.output && !log.error && (

                            <pre className="mt-1 max-h-16 overflow-y-auto whitespace-pre-wrap rounded border border-slate-700/30 bg-black/20 p-1.5 font-mono text-[9px] leading-tight text-slate-300">

                              {log.output}

                            </pre>

                          )}

                        </div>

                      );

                    })}

                  </div>

                )}

              </div>

            )}

          </div>

        </ResizablePanel>

 

        <ResizableHandle withHandle />

 

        {/* ── RIGHT: Editor + Console ───────────────────────────────────── */}

        <ResizablePanel defaultSize={58} minSize={35} className="flex flex-col bg-slate-900">

          <ResizablePanelGroup orientation="vertical" className="h-full">

            {/* ── Editor section ─────────────────────────────────────────── */}

            <ResizablePanel defaultSize={65} minSize={30} className="flex flex-col">

              {/* Editor toolbar */}

              <div className="flex shrink-0 items-center justify-between border-b border-slate-700/50 bg-slate-800/60 px-3 py-2">

                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">

                  <FileCode2 className="h-3.5 w-3.5 text-violet-500" />

                  <span>Code Editor</span>

                </div>

                <div className="flex items-center gap-2">

                  <div className="relative">

                    <select

                      value={language}

                      onChange={(e) => onCodeChange(code, e.target.value)}

                      className="h-7 cursor-pointer appearance-none rounded-md border border-slate-600 bg-slate-800 pl-2.5 pr-7 text-[10.5px] font-bold text-slate-200 outline-none transition hover:border-slate-500 focus:border-violet-500"

                    >

                      {languageOptions.map((opt) => (

                        <option key={opt.value} value={opt.value}>

                          {opt.label}

                        </option>

                      ))}

                    </select>

                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />

                  </div>

                  <Button

                    variant="ghost"

                    size="sm"

                    onClick={() => {

                      onCodeChange(getStarterCode(question), language);

                      toast.success("Starter code template loaded.");

                    }}

                    className="h-7 px-2 text-[10.5px] font-bold text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"

                  >

                    <RotateCcw className="mr-1 h-3 w-3" />

                    Reset

                  </Button>

                </div>

              </div>

 

              {/* Monaco */}

              <div className="relative flex-1 overflow-hidden">

                <Editor

                  height="100%"

                  language={getMonacoLanguage(language)}

                  value={code}

                  onChange={(value) => onCodeChange(value || "", language)}

                  theme="vs-dark"

                  options={{

                    minimap: { enabled: false },

                    fontSize: 13.5,

                    lineNumbers: "on",

                    automaticLayout: true,

                    scrollBeyondLastLine: false,

                    wordWrap: "on",

                    padding: { top: 10, bottom: 10 },

                    smoothScrolling: true,

                    cursorBlinking: "smooth",

                    fontFamily: "Fira Code, Menlo, Monaco, Consolas, Courier New, monospace",

                    fontLigatures: true,

                    renderLineHighlight: "line",

                    scrollbar: {

                      verticalScrollbarSize: 8,

                      horizontalScrollbarSize: 8,

                    },

                    tabSize: 4,

                    letterSpacing: 0.3,

                  }}

                />

              </div>

            </ResizablePanel>

 

            <ResizableHandle withHandle />

 

            {/* ── Console section ────────────────────────────────────────── */}

            <ResizablePanel defaultSize={35} minSize={18} className="flex flex-col bg-slate-900">

              {/* Console tab header */}

              <div className="flex shrink-0 items-center justify-between border-b border-slate-700/50 bg-slate-800/60 px-3 py-1.5">

                <div className="flex items-center gap-0.5">

                  <button

                    type="button"

                    onClick={() => setBottomTab("testcases")}

                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[10.5px] font-bold transition ${

                      bottomTab === "testcases"

                        ? "bg-slate-700/60 text-slate-100"

                        : "text-slate-500 hover:text-slate-300"

                    }`}

                  >

                    <HelpCircle className="h-3 w-3" />

                    Test Cases

                  </button>

                  <button

                    type="button"

                    onClick={() => setBottomTab("custom")}

                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[10.5px] font-bold transition ${

                      bottomTab === "custom"

                        ? "bg-slate-700/60 text-slate-100"

                        : "text-slate-500 hover:text-slate-300"

                    }`}

                  >

                    <Terminal className="h-3 w-3" />

                    Custom Input

                  </button>

                  {testResults && (

                    <button

                      type="button"

                      onClick={() => setBottomTab("result")}

                      className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[10.5px] font-bold transition ${

                        bottomTab === "result"

                          ? "bg-slate-700/60 text-slate-100"

                          : "text-slate-500 hover:text-slate-300"

                      }`}

                    >

                      <CheckCircle2 className="h-3 w-3" />

                      Results

                    </button>

                  )}

                </div>

 

                {/* Status pill */}

                {bottomTab !== "custom" && status && (

                  <StatusPill status={status} />

                )}

              </div>

 

              {/* Console content */}

              <div className="flex-1 overflow-hidden p-3 min-h-0">

                {bottomTab === "testcases" && (

                  <TestCaseTabs testCases={question.test_cases || []} results={null} />

                )}

 

                {bottomTab === "custom" && (

                  <div className="flex h-full flex-col">

                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">

                      Custom stdin input

                    </div>

                    <textarea

                      value={customInput}

                      onChange={(e) => setCustomInput(e.target.value)}

                      placeholder="Enter custom stdin for code execution..."

                      maxLength={1000}

                      className="flex-1 resize-none rounded-md border border-slate-700 bg-slate-950/50 p-2.5 font-mono text-[10.5px] leading-relaxed text-slate-300 outline-none focus:border-violet-500"

                    />

                  </div>

                )}

 

                {bottomTab === "result" && (

                  <div className="h-full space-y-3 overflow-y-auto">

                    {/* Summary */}

                    <div className="flex items-center gap-2">

                      {testResults && testResults.every((r) => r.passed) ? (

                        <div className="flex items-center gap-2 rounded-md border border-emerald-700/40 bg-emerald-950/20 px-3 py-1.5">

                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />

                          <span className="text-[11px] font-bold text-emerald-400">

                            Accepted — {testResults.filter((r) => r.passed).length}/{testResults.length} test cases passed

                          </span>

                        </div>

                      ) : testResults && testResults.some((r) => !r.passed) ? (

                        <div className="flex items-center gap-2 rounded-md border border-rose-700/40 bg-rose-950/20 px-3 py-1.5">

                          <XCircle className="h-4 w-4 text-rose-500" />

                          <span className="text-[11px] font-bold text-rose-400">

                            Wrong Answer — {testResults.filter((r) => r.passed).length}/{testResults.length} test cases passed

                          </span>

                        </div>

                      ) : null}

                    </div>

 

                    {/* Per-case results */}

                    {testResults && (

                      <TestCaseTabs testCases={[]} results={testResults} />

                    )}

 

                    {/* Error output if any */}

                    {error && (

                      <pre className="whitespace-pre-wrap rounded-md border border-rose-900/40 bg-rose-950/20 p-2.5 font-mono text-[10px] leading-relaxed text-rose-400">

                        {error}

                      </pre>

                    )}

 

                    {/* Stdout */}

                    {output && !error && (

                      <div>

                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">stdout</div>

                        <pre className="whitespace-pre-wrap rounded-md border border-slate-700/50 bg-slate-950/40 p-2.5 font-mono text-[10px] leading-relaxed text-slate-300">

                          {output}

                        </pre>

                      </div>

                    )}

                  </div>

                )}

 

                {/* Show output/error in testcases tab if available */}

                {bottomTab === "testcases" && (error || output) && (

                  <div className="mt-3 border-t border-slate-700/40 pt-3">

                    {error ? (

                      <pre className="whitespace-pre-wrap rounded-md border border-rose-900/40 bg-rose-950/20 p-2.5 font-mono text-[10px] leading-relaxed text-rose-400">

                        {error}

                      </pre>

                    ) : (

                      <div>

                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">stdout</div>

                        <pre className="whitespace-pre-wrap rounded-md border border-slate-700/50 bg-slate-950/40 p-2.5 font-mono text-[10px] leading-relaxed text-slate-300">

                          {output}

                        </pre>

                      </div>

                    )}

                  </div>

                )}

              </div>

 

              {/* ── Action bar ──────────────────────────────────────────── */}

              <div className="flex shrink-0 items-center justify-between border-t border-slate-700/50 bg-slate-800/40 px-3 py-2.5">

                <div className="flex items-center gap-2 text-[10px] text-slate-500">

                  {running || submitting ? (

                    <Loader2 className="h-3 w-3 animate-spin text-violet-400" />

                  ) : status ? (

                    <StatusPill status={status} />

                  ) : (

                    <span>Ready</span>

                  )}

                </div>

                <div className="flex items-center gap-2">

                  <Button

                    type="button"

                    variant="outline"

                    onClick={handleRun}

                    disabled={running || submitting}

                    className="h-8 border-slate-600 bg-slate-800 px-4 text-[11px] font-bold text-slate-300 hover:bg-slate-700 hover:text-white"

                  >

                    {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}

                    Run Code

                  </Button>

                  {onSubmit && (

                    <Button

                      type="button"

                      onClick={handleSubmit}

                      disabled={running || submitting}

                      className="h-8 bg-gradient-to-r from-violet-600 to-indigo-600 px-4 text-[11px] font-extrabold text-white shadow-sm transition hover:from-violet-500 hover:to-indigo-500"

                    >

                      {submitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}

                      Submit

                    </Button>

                  )}

                </div>

              </div>

            </ResizablePanel>

          </ResizablePanelGroup>

        </ResizablePanel>

      </ResizablePanelGroup>

    </div>

  );

}

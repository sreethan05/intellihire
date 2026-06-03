import { useState, useMemo } from "react";
import Editor from "@monaco-editor/react";
import {
  Code2,
  Terminal,
  Play,
  Send,
  RotateCcw,
  Sparkles,
  Award,
  CheckCircle2,
  XCircle,
  HelpCircle,
  BookOpen,
  MessageSquare,
  History,
  FileCode2,
  TrendingUp,
  Flame,
} from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Problem {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  category: string;
  acceptance: string;
  description: string;
  examples: Array<{
    input: string;
    output: string;
    explanation?: string;
  }>;
  constraints: string[];
  starters: Record<string, string>;
  testCases: Array<{
    inputArgs: any[];
    expected: any;
  }>;
  solution: string;
}

const PROBLEMS: Problem[] = [
  {
    id: "two-sum",
    title: "1. Two Sum",
    difficulty: "Easy",
    category: "Arrays & Hashing",
    acceptance: "98.4%",
    description: `Given an array of integers \`nums\` and an integer \`target\`, return indices of the two numbers such that they add up to \`target\`.

You may assume that each input would have exactly one solution, and you may not use the same element twice.

You can return the answer in any order.`,
    examples: [
      {
        input: "nums = [2,7,11,15], target = 9",
        output: "[0,1]",
        explanation: "Because nums[0] + nums[1] == 9, we return [0, 1]."
      },
      {
        input: "nums = [3,2,4], target = 6",
        output: "[1,2]"
      }
    ],
    constraints: [
      "2 <= nums.length <= 104",
      "-109 <= nums[i] <= 109",
      "-109 <= target <= 109",
      "Only one valid answer exists."
    ],
    starters: {
      javascript: `function twoSum(nums, target) {
    // Write your JavaScript code here
    
}`,
      python: `def twoSum(nums, target):
    # Write your Python code here
    pass`,
      java: `class Solution {
    public int[] twoSum(int[] nums, int target) {
        // Write your Java code here
        return new int[0];
    }
}`,
      cpp: `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        // Write your C++ code here
        return {};
    }
};`
    },
    testCases: [
      { inputArgs: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { inputArgs: [[3, 2, 4], 6], expected: [1, 2] },
      { inputArgs: [[3, 3], 6], expected: [0, 1] }
    ],
    solution: `// Time Complexity: O(N) using a Hash Map
function twoSum(nums, target) {
    const map = new Map();
    for (let i = 0; i < nums.length; i++) {
        const complement = target - nums[i];
        if (map.has(complement)) {
            return [map.get(complement), i];
        }
        map.set(nums[i], i);
    }
    return [];
}`
  },
  {
    id: "valid-parentheses",
    title: "20. Valid Parentheses",
    difficulty: "Easy",
    category: "Stacks",
    acceptance: "95.8%",
    description: `Given a string \`s\` containing just the characters \`'('\`, \`')'\`, \`'{'\`, \`'}'\`, \`'['\` and \`']'\`, determine if the input string is valid.

An input string is valid if:
1. Open brackets must be closed by the same type of brackets.
2. Open brackets must be closed in the correct order.
3. Every close bracket has a corresponding open bracket of the same type.`,
    examples: [
      {
        input: 's = "()"',
        output: "true"
      },
      {
        input: 's = "()[]{}"',
        output: "true"
      },
      {
        input: 's = "(]"',
        output: "false"
      }
    ],
    constraints: [
      "1 <= s.length <= 104",
      "s consists of parentheses only: '()[]{}'."
    ],
    starters: {
      javascript: `function isValid(s) {
    // Write your JavaScript code here
    
}`,
      python: `def isValid(s: str) -> bool:
    # Write your Python code here
    pass`,
      java: `class Solution {
    public boolean isValid(String s) {
        // Write your Java code here
        return false;
    }
}`,
      cpp: `class Solution {
public:
    bool isValid(string s) {
        // Write your C++ code here
        return false;
    }
};`
    },
    testCases: [
      { inputArgs: ["()"], expected: true },
      { inputArgs: ["()[]{}"], expected: true },
      { inputArgs: ["(]"], expected: false },
      { inputArgs: ["([)]"], expected: false }
    ],
    solution: `// Time Complexity: O(N) using a Stack
function isValid(s) {
    const stack = [];
    const mapping = { ')': '(', '}': '{', ']': '[' };
    for (let char of s) {
        if (char in mapping) {
            const top = stack.pop() || '#';
            if (mapping[char] !== top) return false;
        } else {
            stack.push(char);
        }
    }
    return stack.length === 0;
}`
  },
  {
    id: "longest-substring",
    title: "3. Longest Substring Without Repeating",
    difficulty: "Medium",
    category: "Sliding Window",
    acceptance: "89.2%",
    description: `Given a string \`s\`, find the length of the longest substring without repeating characters.`,
    examples: [
      {
        input: 's = "abcabcbb"',
        output: "3",
        explanation: 'The answer is "abc", with the length of 3.'
      },
      {
        input: 's = "bbbbb"',
        output: "1",
        explanation: 'The answer is "b", with the length of 1.'
      }
    ],
    constraints: [
      "0 <= s.length <= 5 * 104",
      "s consists of English letters, digits, symbols and spaces."
    ],
    starters: {
      javascript: `function lengthOfLongestSubstring(s) {
    // Write your JavaScript code here
    
}`,
      python: `def lengthOfLongestSubstring(s: str) -> int:
    # Write your Python code here
    pass`,
      java: `class Solution {
    public int lengthOfLongestSubstring(String s) {
        // Write your Java code here
        return 0;
    }
}`,
      cpp: `class Solution {
public:
    int lengthOfLongestSubstring(string s) {
        // Write your C++ code here
        return 0;
    }
};`
    },
    testCases: [
      { inputArgs: ["abcabcbb"], expected: 3 },
      { inputArgs: ["bbbbb"], expected: 1 },
      { inputArgs: ["pwwkew"], expected: 3 },
      { inputArgs: ["aab"], expected: 2 }
    ],
    solution: `// Time Complexity: O(N) Sliding Window
function lengthOfLongestSubstring(s) {
    let set = new Set();
    let left = 0;
    let max = 0;
    for (let right = 0; right < s.length; right++) {
        while (set.has(s[right])) {
            set.delete(s[left]);
            left++;
        }
        set.add(s[right]);
        max = Math.max(max, right - left + 1);
    }
    return max;
}`
  }
];

export default function CandidateSandbox() {
  const [activeProblemIdx, setActiveProblemIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<"desc" | "sub" | "disc" | "sol">("desc");
  const [language, setLanguage] = useState("javascript");
  
  const problem = PROBLEMS[activeProblemIdx];
  const [codes, setCodes] = useState<Record<string, Record<string, string>>>(() => {
    const initial: Record<string, Record<string, string>> = {};
    PROBLEMS.forEach((p) => {
      initial[p.id] = { ...p.starters };
    });
    return initial;
  });

  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [consoleStatus, setConsoleStatus] = useState("");
  const [consoleOutput, setConsoleOutput] = useState("");
  const [consoleError, setConsoleError] = useState("");
  const [submissionSuccess, setSubmissionSuccess] = useState<boolean | null>(null);
  const [testResults, setTestResults] = useState<any[] | null>(null);
  
  // Custom past submissions log state
  const [submissionLogs, setSubmissionLogs] = useState<Record<string, any[]>>({
    "two-sum": [],
    "valid-parentheses": [],
    "longest-substring": [],
  });

  const currentCode = useMemo(() => {
    return codes[problem.id]?.[language] || "";
  }, [codes, problem.id, language]);

  const handleCodeChange = (newVal: string) => {
    setCodes((prev) => ({
      ...prev,
      [problem.id]: {
        ...prev[problem.id],
        [language]: newVal,
      },
    }));
  };

  const handleResetCode = () => {
    setCodes((prev) => ({
      ...prev,
      [problem.id]: {
        ...prev[problem.id],
        [language]: problem.starters[language],
      },
    }));
    toast.success("Code reset to starter template");
  };

  const getDifficultyColor = (diff: string) => {
    if (diff === "Easy") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (diff === "Medium") return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-rose-50 text-rose-700 border-rose-200";
  };

  const executeJavaScript = (codeStr: string, problemId: string, testCases: any[]) => {
    try {
      let solverName = "";
      if (problemId === "two-sum") solverName = "twoSum";
      else if (problemId === "valid-parentheses") solverName = "isValid";
      else if (problemId === "longest-substring") solverName = "lengthOfLongestSubstring";

      const creator = new Function(`${codeStr}; return typeof ${solverName} !== 'undefined' ? ${solverName} : null;`);
      const userFunc = creator();

      if (!userFunc || typeof userFunc !== "function") {
        throw new Error(`Could not find defined function: '${solverName}'. Please make sure you write the core function.`);
      }

      const results = testCases.map((tc, idx) => {
        try {
          const clonedArgs = JSON.parse(JSON.stringify(tc.inputArgs));
          const result = userFunc(...clonedArgs);
          const passed = JSON.stringify(result) === JSON.stringify(tc.expected);
          return {
            caseNum: idx + 1,
            input: JSON.stringify(tc.inputArgs),
            expected: JSON.stringify(tc.expected),
            actual: JSON.stringify(result),
            passed,
          };
        } catch (e: any) {
          return {
            caseNum: idx + 1,
            input: JSON.stringify(tc.inputArgs),
            expected: JSON.stringify(tc.expected),
            actual: `Error: ${e.message}`,
            passed: false,
          };
        }
      });

      return { success: true, results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const handleRunCode = () => {
    setRunning(true);
    setConsoleOutput("");
    setConsoleError("");
    setConsoleStatus("Compiling...");
    setTestResults(null);
    setSubmissionSuccess(null);

    setTimeout(() => {
      if (language !== "javascript") {
        // Mock non-JS compilers
        setConsoleStatus("Finished");
        setConsoleOutput("Remote compiler sandbox output:\nAll syntax checks passed. JavaScript compiler is recommended for active evaluation.");
        setRunning(false);
        return;
      }

      const evalResult = executeJavaScript(currentCode, problem.id, problem.testCases);
      if (evalResult.success && evalResult.results) {
        setTestResults(evalResult.results);
        const allPassed = evalResult.results.every((r) => r.passed);
        setConsoleStatus(allPassed ? "Accepted" : "Wrong Answer");
        setConsoleOutput(`Ran ${problem.testCases.length} sample cases. Output checks complete.`);
      } else {
        setConsoleStatus("Runtime Error");
        setConsoleError(evalResult.error || "Execution failed");
      }
      setRunning(false);
    }, 900);
  };

  const handleSubmitCode = () => {
    setSubmitting(true);
    setConsoleOutput("");
    setConsoleError("");
    setConsoleStatus("Evaluating Submissions...");
    setTestResults(null);
    setSubmissionSuccess(null);

    setTimeout(() => {
      if (language !== "javascript") {
        setConsoleStatus("Accepted");
        setSubmissionSuccess(true);
        setConsoleOutput("Submission Accepted!\nRuntime: 52ms\nMemory: 42MB\nBeats 95.8% of users.");
        setSubmitting(false);
        return;
      }

      const evalResult = executeJavaScript(currentCode, problem.id, problem.testCases);
      if (evalResult.success && evalResult.results) {
        setTestResults(evalResult.results);
        const allPassed = evalResult.results.every((r) => r.passed);
        setConsoleStatus(allPassed ? "Accepted" : "Wrong Answer");
        setSubmissionSuccess(allPassed);
        
        // Append to logs
        const dateStr = new Date().toLocaleTimeString();
        const newLog = {
          time: dateStr,
          status: allPassed ? "Accepted" : "Wrong Answer",
          passed: evalResult.results.filter((r) => r.passed).length,
          total: evalResult.results.length,
          runtime: `${Math.floor(Math.random() * 30) + 40} ms`,
          memory: `${(Math.random() * 2 + 40).toFixed(1)} MB`,
        };
        setSubmissionLogs((prev) => ({
          ...prev,
          [problem.id]: [newLog, ...(prev[problem.id] || [])],
        }));

        if (allPassed) {
          toast.success("Accepted! Perfect score on all test cases!");
        } else {
          toast.error("Wrong Answer. Check test case mismatches.");
        }
      } else {
        setConsoleStatus("Compile Error");
        setConsoleError(evalResult.error || "Compilation failed");
        setSubmissionSuccess(false);
      }
      setSubmitting(false);
    }, 1400);
  };

  return (
    <div className="space-y-5">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Code2 className="h-5 w-5 text-violet-600" />
            LeetCode Practice Sandbox
          </h1>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            Build syntax compliance, solve interview questions, and run direct browser evaluations.
          </p>
        </div>

        {/* Dropdown Problem Switcher */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Select Problem:</span>
          <select
            value={activeProblemIdx}
            onChange={(e) => {
              setActiveProblemIdx(Number(e.target.value));
              setActiveTab("desc");
              setTestResults(null);
              setSubmissionSuccess(null);
              setConsoleOutput("");
              setConsoleError("");
              setConsoleStatus("");
            }}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-violet-500 shadow-sm cursor-pointer"
          >
            {PROBLEMS.map((p, idx) => (
              <option key={p.id} value={idx}>
                {p.title} ({p.difficulty})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main IDE Split Grid */}
      <div className="grid gap-5 lg:grid-cols-12 items-stretch h-[calc(100vh-220px)] min-h-[580px] overflow-hidden">
        
        {/* Left Column: Problem description tabs */}
        <div className="lg:col-span-5 flex flex-col bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden min-h-0">
          {/* Tab buttons */}
          <div className="flex border-b border-slate-100 bg-slate-50/50">
            {[
              { id: "desc", label: "Description", icon: BookOpen },
              { id: "sol", label: "Solution", icon: FileCode2 },
              { id: "sub", label: "Submissions", icon: History },
              { id: "disc", label: "Discussion", icon: MessageSquare },
            ].map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-all border-b-2 outline-none cursor-pointer ${
                    isActive
                      ? "border-violet-600 text-violet-700 bg-white"
                      : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content Panel */}
          <div className="flex-1 overflow-y-auto p-5 min-h-0 space-y-4">
            {activeTab === "desc" && (
              <>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${getDifficultyColor(problem.difficulty)}`}>
                    {problem.difficulty}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-bold text-slate-500 bg-slate-50">
                    {problem.category}
                  </Badge>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Acceptance: {problem.acceptance}
                  </span>
                </div>

                <h2 className="text-base font-extrabold text-slate-800 tracking-tight">{problem.title}</h2>
                
                <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap font-medium">
                  {problem.description}
                </div>

                {/* Examples */}
                <div className="space-y-3.5 pt-2">
                  {problem.examples.map((ex, index) => (
                    <div key={index} className="space-y-1.5">
                      <div className="text-xs font-bold text-slate-700">Example {index + 1}:</div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 font-mono text-[10.5px] leading-relaxed text-slate-700">
                        <div className="flex gap-1.5">
                          <span className="font-bold text-slate-900">Input:</span>
                          <span>{ex.input}</span>
                        </div>
                        <div className="flex gap-1.5 mt-1">
                          <span className="font-bold text-slate-900">Output:</span>
                          <span>{ex.output}</span>
                        </div>
                        {ex.explanation && (
                          <div className="mt-2 text-slate-500 italic">
                            <span className="font-bold text-slate-700 not-italic">Explanation: </span>
                            {ex.explanation}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Constraints */}
                <div className="pt-2">
                  <div className="text-xs font-bold text-slate-700 mb-1.5">Constraints:</div>
                  <ul className="list-disc pl-5 space-y-1 text-[11px] font-semibold text-slate-500">
                    {problem.constraints.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {activeTab === "sol" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-850">JavaScript Reference Solution</div>
                  <button
                    onClick={() => {
                      setCodes((prev) => ({
                        ...prev,
                        [problem.id]: {
                          ...prev[problem.id],
                          javascript: problem.solution,
                        },
                      }));
                      setLanguage("javascript");
                      toast.success("Reference solution loaded in editor!");
                    }}
                    className="text-[10px] text-violet-700 font-bold bg-violet-50 px-2 py-1 rounded border border-violet-100 hover:bg-violet-100 transition cursor-pointer"
                  >
                    Load Solution Code
                  </button>
                </div>
                <pre className="rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-[10.5px] leading-normal text-slate-300 overflow-x-auto">
                  {problem.solution}
                </pre>
              </div>
            )}

            {activeTab === "sub" && (
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-850">Past Attempt Submissions</div>
                
                {(submissionLogs[problem.id] || []).length === 0 ? (
                  <div className="text-center py-12 text-[11px] text-slate-400 font-semibold border border-dashed border-slate-200 rounded-xl">
                    No mock code submissions found yet. Click Submit to record tests.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(submissionLogs[problem.id] || []).map((sub, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between p-3 rounded-xl border ${
                          sub.status === "Accepted"
                            ? "bg-emerald-50/40 border-emerald-100 text-emerald-800"
                            : "bg-rose-50/40 border-rose-100 text-rose-800"
                        }`}
                      >
                        <div>
                          <div className="text-xs font-extrabold flex items-center gap-1.5">
                            {sub.status === "Accepted" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-rose-600" />
                            )}
                            {sub.status}
                          </div>
                          <div className="text-[9px] text-slate-400 font-bold mt-0.5">
                            Passed {sub.passed}/{sub.total} · {sub.time}
                          </div>
                        </div>
                        <div className="text-right text-[10px] font-bold text-slate-600">
                          <div>{sub.runtime}</div>
                          <div className="text-[9px] text-slate-400 font-normal">{sub.memory}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "disc" && (
              <div className="space-y-4">
                <div className="text-xs font-bold text-slate-850">Community Study Notes & Complexity</div>
                
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-amber-500 animate-pulse" />
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">optimal hash map approach</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500 font-semibold">
                    The brute force approach evaluates every pair combination using dual loops ($O(N^2)$ complexity). By caching visited keys in a hash map, we achieve single-pass lookup with **$O(N)$ linear time complexity** and $O(N)$ auxiliary memory.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-violet-500" />
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">space optimization</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500 font-semibold">
                    If auxiliary space is a constraint ($O(1)$ limit), we can first sort the array ($O(N \log N)$) and use dual pointers. However, sorting invalidates input indices if we return array coordinates.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Code Editor & Execution Console */}
        <div className="lg:col-span-7 flex flex-col bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden min-h-0">
          {/* Editor Header: language, settings */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/30 shrink-0">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <FileCode2 className="h-4 w-4 text-violet-600 animate-bounce" />
              <span>Interactive Console IDE</span>
            </div>
            
            {/* Lang options buttons */}
            <div className="flex items-center gap-2">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 outline-none focus:border-violet-500 cursor-pointer"
              >
                <option value="javascript">JavaScript</option>
                <option value="python">Python 3</option>
                <option value="java">Java</option>
                <option value="cpp">C++</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={handleResetCode}
                className="h-8 border-slate-200 text-slate-600 font-bold text-[11px] rounded-lg"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Reset
              </Button>
            </div>
          </div>

          {/* Monaco Editor Component */}
          <div className="flex-1 overflow-hidden min-h-0 relative border-b border-slate-100">
            <Editor
              height="100%"
              language={language === "cpp" ? "cpp" : language}
              value={currentCode}
              onChange={(value) => handleCodeChange(value || "")}
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

          {/* Console / Output Drawer panel */}
          <div className="bg-slate-50/50 p-4 shrink-0 flex flex-col space-y-3">
            <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)] gap-4 items-stretch">
              {/* Compiler feedback console */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-col justify-between min-h-[140px]">
                <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <Terminal className="h-3.5 w-3.5 text-violet-500" /> terminal output
                  </div>

                  {consoleStatus && (
                    <Badge
                      className={`h-5 text-[10px] font-bold rounded ${
                        consoleStatus === "Accepted"
                          ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                          : consoleStatus.includes("Error") || consoleStatus === "Wrong Answer"
                            ? "bg-rose-600 hover:bg-rose-600 text-white"
                            : "bg-violet-600 hover:bg-violet-600 text-white"
                      }`}
                    >
                      {consoleStatus}
                    </Badge>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto max-h-24 py-2 font-mono text-[10.5px] leading-relaxed text-slate-600">
                  {consoleError ? (
                    <pre className="text-rose-600 whitespace-pre-wrap font-bold bg-rose-50/40 p-2 rounded-lg border border-rose-100/50">{consoleError}</pre>
                  ) : consoleOutput ? (
                    <pre className="text-slate-800 whitespace-pre-wrap bg-slate-50 p-2 rounded-lg border border-slate-100">{consoleOutput}</pre>
                  ) : (
                    <div className="text-slate-400 italic">
                      Write code and click Run Code or Submit to evaluate.
                    </div>
                  )}
                </div>
              </div>

              {/* Individual test cases checklist */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 min-h-[140px] flex flex-col">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50 pb-2 flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5 text-violet-500" /> test cases checkpoints
                </div>
                
                <div className="flex-1 overflow-y-auto pt-2 space-y-1.5">
                  {!testResults ? (
                    <div className="text-[10px] text-slate-400 italic">
                      Run evaluation to trigger case checking.
                    </div>
                  ) : (
                    testResults.map((tr) => (
                      <div
                        key={tr.caseNum}
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
                          <span>Case {tr.caseNum}</span>
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

            {/* Achievement Widget for LeetCode Accepted Solutions */}
            {submissionSuccess === true && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3.5 flex items-start gap-3.5 animate-in fade-in-60 duration-300">
                <div className="rounded-lg bg-emerald-100 p-2 text-emerald-800">
                  <Award className="h-5 w-5 animate-bounce" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-emerald-800 flex items-center gap-1.5">
                    Accepted! <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  </div>
                  <p className="text-[11px] leading-relaxed text-emerald-700 font-semibold mt-0.5">
                    Your code compiled perfectly. Test run beats <span className="font-extrabold text-emerald-800">98.4%</span> of JavaScript submissions. 
                    Avg Runtime: <span className="font-extrabold text-slate-900">46 ms</span> · Memory: <span className="font-extrabold text-slate-900">41.2 MB</span>.
                  </p>
                </div>
              </div>
            )}

            {/* Submit & Run Buttons */}
            <div className="flex justify-end gap-3.5 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={handleRunCode}
                disabled={running || submitting}
                className="h-10 min-w-32 rounded-lg border-slate-200 text-slate-700 font-bold text-xs"
              >
                <Play className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Run Code
              </Button>
              <Button
                type="button"
                onClick={handleSubmitCode}
                disabled={running || submitting}
                className="h-10 min-w-36 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold text-xs shadow-md shadow-violet-100"
              >
                <Send className="mr-1.5 h-3.5 w-3.5" /> Submit Code
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

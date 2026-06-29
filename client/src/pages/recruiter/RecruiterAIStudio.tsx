import { useEffect, useState } from "react";
import {
  Bot,
  Code2,
  FileText,
  ListChecks,
  Sparkles,
  Cpu,
  Save,
  Trash2,
  Plus,
  Play,
  Loader2,
  Brain,
  MessageSquare,
  Sliders,
  CheckCircle,
} from "lucide-react";
import { aiApi, examApi, recruiterApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type FewShotExample = {
  question: string;
  answer: string;
  score: number;
  feedback: string;
};

type AIConfig = {
  persona: string;
  instructions: string;
  rubric: string;
  examples: FewShotExample[];
  temperature: number;
};

export default function RecruiterAIStudio() {
  const [activeTab, setActiveTab] = useState<"generator" | "resume" | "train">("generator");

  // --- Questions Generator State ---
  const [topic, setTopic] = useState("data structures");
  const [difficulty, setDifficulty] = useState("medium");
  const [mcq, setMcq] = useState<any[]>([]);
  const [coding, setCoding] = useState<any>(null);
  const [savingMcq, setSavingMcq] = useState(false);
  const [savingCoding, setSavingCoding] = useState(false);

  // --- Resume Parser State ---
  const [resumeText, setResumeText] = useState("");
  const [resumeResult, setResumeResult] = useState<any>(null);

  // --- Train AI Interviewer State ---
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Custom configuration for the selected job's AI model
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    persona: "Tech Lead",
    instructions: "",
    rubric: "",
    examples: [],
    temperature: 0.4,
  });

  const [customPersona, setCustomPersona] = useState("");

  // --- Sandbox State ---
  const [sandboxQuestion, setSandboxQuestion] = useState("Describe how a hash map resolves collisions.");
  const [sandboxAnswer, setSandboxAnswer] = useState("By using separate chaining (linked lists) or open addressing (linear probing).");
  const [testingSandbox, setTestingSandbox] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<{ score: number; feedback: string } | null>(null);

  const [loading, setLoading] = useState("");

  // Fetch jobs for training dropdown
  useEffect(() => {
    if (activeTab === "train") {
      setLoadingJobs(true);
      recruiterApi
        .getDrives()
        .then(({ data }) => {
          setJobs(data.drives || []);
        })
        .catch(() => toast.error("Could not load hiring drives"))
        .finally(() => setLoadingJobs(false));
    }
  }, [activeTab]);

  // Load AI configuration when a job is selected
  const handleJobChange = async (jobId: string) => {
    setSelectedJobId(jobId);
    if (!jobId) {
      setSandboxResult(null);
      return;
    }

    setLoadingConfig(true);
    setSandboxResult(null);
    try {
      const { data } = await recruiterApi.getDriveAiConfig(jobId);
      const config = data.aiConfig || {
        persona: "Tech Lead",
        instructions: "",
        rubric: "",
        examples: [],
        temperature: 0.4,
      };

      setAiConfig(config);

      const standardPersonas = ["Standard HR Recruiter", "Tech Lead", "Socratic Code Coach", "Strict DBMS Evaluator"];
      if (config.persona && !standardPersonas.includes(config.persona)) {
        setCustomPersona(config.persona);
        setAiConfig((prev) => ({ ...prev, persona: "Custom" }));
      } else {
        setCustomPersona("");
      }
    } catch {
      toast.error("Could not load AI configuration for this drive");
    } finally {
      setLoadingConfig(false);
    }
  };

  // Save/Train the custom AI Interview Model
  const handleSaveConfig = async () => {
    if (!selectedJobId) {
      toast.error("Please select a hiring drive first");
      return;
    }

    setSavingConfig(true);
    try {
      const finalPersona = aiConfig.persona === "Custom" ? customPersona : aiConfig.persona;
      const configToSave = {
        ...aiConfig,
        persona: finalPersona || "Tech Lead",
      };

      await recruiterApi.saveDriveAiConfig(selectedJobId, configToSave);
      toast.success("AI Interviewer Model trained and deployed successfully for this drive!");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to train AI model");
    } finally {
      setSavingConfig(false);
    }
  };

  // Test current configuration in Sandbox
  const handleTestSandbox = async () => {
    if (!selectedJobId) {
      toast.error("Please select a hiring drive to test");
      return;
    }
    if (!sandboxQuestion.trim() || !sandboxAnswer.trim()) {
      toast.error("Please provide both a test question and answer");
      return;
    }

    setTestingSandbox(true);
    setSandboxResult(null);
    try {
      const finalPersona = aiConfig.persona === "Custom" ? customPersona : aiConfig.persona;
      const currentConfig = {
        ...aiConfig,
        persona: finalPersona || "Tech Lead",
      };

      const { data } = await recruiterApi.testDriveAiConfig(selectedJobId, {
        question: sandboxQuestion,
        answer: sandboxAnswer,
        aiConfig: currentConfig,
      });

      setSandboxResult({
        score: data.score,
        feedback: data.feedback,
      });
      toast.success("Sandbox evaluation complete!");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Sandbox testing failed");
    } finally {
      setTestingSandbox(false);
    }
  };

  // Few-Shot Example Editor handlers
  const handleAddExample = () => {
    setAiConfig((prev) => ({
      ...prev,
      examples: [
        ...prev.examples,
        { question: "", answer: "", score: 80, feedback: "" },
      ],
    }));
  };

  const handleRemoveExample = (index: number) => {
    setAiConfig((prev) => ({
      ...prev,
      examples: prev.examples.filter((_, idx) => idx !== index),
    }));
  };

  const handleExampleChange = (index: number, field: keyof FewShotExample, value: any) => {
    setAiConfig((prev) => {
      const updated = [...prev.examples];
      updated[index] = {
        ...updated[index],
        [field]: field === "score" ? Number(value) : value,
      };
      return { ...prev, examples: updated };
    });
  };

  // Generator saves
  const saveGeneratedMcqs = async () => {
    if (mcq.length === 0) return;
    setSavingMcq(true);
    try {
      await examApi.saveBankMcqs(mcq);
      toast.success("All 5 MCQs successfully saved to the Question Bank!");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Could not save MCQs to Bank");
    } finally {
      setSavingMcq(false);
    }
  };

  const saveGeneratedCoding = async () => {
    if (!coding) return;
    setSavingCoding(true);
    try {
      await examApi.saveBankCoding(coding);
      toast.success("Coding question successfully saved to the Question Bank!");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Could not save Coding question to Bank");
    } finally {
      setSavingCoding(false);
    }
  };

  const generateMcq = async () => {
    setLoading("mcq");
    try {
      const { data } = await aiApi.generateMcq({ topic, difficulty, count: 5 });
      setMcq(data.questions || []);
    } finally {
      setLoading("");
    }
  };

  const generateCoding = async () => {
    setLoading("coding");
    try {
      const { data } = await aiApi.generateCoding({ topic, difficulty });
      setCoding(data.question);
    } finally {
      setLoading("");
    }
  };

  const parseResume = async () => {
    setLoading("resume");
    try {
      const { data } = await aiApi.parseResume({
        resume_text: resumeText,
        job_skills: ["react", "node", "sql", "python", "java", "typescript", "aws", "docker"],
      });
      setResumeResult(data);
    } finally {
      setLoading("");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-violet-600" />
            AI Studio & Trainer
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Build and custom-train your AI interviewer, parser resumes, and generate assessment questions.
          </p>
        </div>

        {/* Custom Premium Tabs switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50 self-start md:self-center">
          <button
            onClick={() => setActiveTab("generator")}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "generator"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" />
            Questions Generator
          </button>
          <button
            onClick={() => setActiveTab("resume")}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "resume"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Resume Parser
          </button>
          <button
            onClick={() => setActiveTab("train")}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "train"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Brain className="h-3.5 w-3.5" />
            Train AI Interviewer
          </button>
        </div>
      </div>

      {/* TABS CONTENT */}

      {/* TAB 1: GENERATOR */}
      {activeTab === "generator" && (
        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="rounded-2xl border-slate-200/60 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-slate-800">
                <Sliders className="h-4 w-4 text-violet-600" />
                Generator Controls
              </CardTitle>
              <CardDescription>Configure topic and difficulty</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">Topic</Label>
                <Input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="e.g. data structures, sql, react"
                  className="bg-slate-50/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">Difficulty</Label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold focus:border-violet-500 focus:bg-white focus:outline-none"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div className="grid gap-2.5 pt-2">
                <Button
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold"
                  onClick={generateMcq}
                  disabled={!!loading}
                >
                  {loading === "mcq" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      <ListChecks className="mr-2 h-4 w-4" /> Generate 5 MCQs
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-slate-200 text-slate-700 hover:bg-slate-50 font-bold"
                  onClick={generateCoding}
                  disabled={!!loading}
                >
                  {loading === "coding" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Drafting...
                    </>
                  ) : (
                    <>
                      <Code2 className="mr-2 h-4 w-4" /> Draft Coding Question
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5">
            <Card className="rounded-2xl border-slate-200/60 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800">
                    <Bot className="h-4 w-4 text-violet-600" />
                    Generated Questions
                  </CardTitle>
                  <CardDescription>Review and add to your Question Bank</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-2">
                {/* MCQs Preview */}
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>MCQ Set</span>
                    {mcq.length > 0 && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 h-auto transition shadow-sm rounded-lg"
                        onClick={saveGeneratedMcqs}
                        disabled={savingMcq}
                      >
                        {savingMcq ? "Saving..." : "Save to Bank"}
                      </Button>
                    )}
                  </div>
                  {mcq.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
                      Generate MCQs to preview them here.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                      {mcq.map((question, index) => (
                        <div key={index} className="rounded-xl border border-slate-200/60 bg-white p-4 space-y-2 shadow-xs">
                          <div className="text-xs font-bold text-slate-900">
                            {index + 1}. {question.question_text}
                          </div>
                          <div className="grid gap-1.5 pl-2 text-[11px] text-slate-600">
                            <span className={question.correct_option === "A" ? "font-bold text-emerald-600" : ""}>
                              A. {question.option_a}
                            </span>
                            <span className={question.correct_option === "B" ? "font-bold text-emerald-600" : ""}>
                              B. {question.option_b}
                            </span>
                            <span className={question.correct_option === "C" ? "font-bold text-emerald-600" : ""}>
                              C. {question.option_c}
                            </span>
                            <span className={question.correct_option === "D" ? "font-bold text-emerald-600" : ""}>
                              D. {question.option_d}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Coding Challenge Preview */}
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Coding Challenge</span>
                    {coding && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 h-auto transition shadow-sm rounded-lg"
                        onClick={saveGeneratedCoding}
                        disabled={savingCoding}
                      >
                        {savingCoding ? "Saving..." : "Save to Bank"}
                      </Button>
                    )}
                  </div>
                  {!coding ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
                      Draft a coding challenge to preview here.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-xs max-h-[420px] overflow-y-auto pr-1">
                      <div>
                        <div className="text-sm font-bold text-slate-950 leading-tight">{coding.title}</div>
                        <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-violet-50 border border-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 uppercase tracking-wider">
                          {coding.difficulty} · {coding.marks} marks
                        </div>
                      </div>
                      <p className="text-xs leading-5 text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        {coding.description}
                      </p>
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Starter Code (Python)</span>
                        <pre className="overflow-auto rounded-lg bg-slate-900 p-3 text-[10px] text-slate-100 font-mono leading-4">
                          {coding.starter_code}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: RESUME PARSER */}
      {activeTab === "resume" && (
        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-800">
              <FileText className="h-4 w-4 text-violet-600" />
              Resume Parser & Skill Matcher
            </CardTitle>
            <CardDescription>Evaluate candidate suitability and matching index</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700">Paste Full Resume Text</Label>
              <Textarea
                value={resumeText}
                onChange={(event) => setResumeText(event.target.value)}
                placeholder="Paste the raw text of the resume here..."
                className="min-h-56 resize-none leading-5 bg-slate-50/50"
              />
            </div>
            <div className="flex flex-col gap-4 justify-between">
              <div className="space-y-4">
                <Button
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold h-10"
                  onClick={parseResume}
                  disabled={!resumeText.trim() || !!loading}
                >
                  {loading === "resume" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Parsing...
                    </>
                  ) : (
                    <>
                      <Brain className="mr-2 h-4 w-4" /> Parse & Match Skills
                    </>
                  )}
                </Button>

                {resumeResult && (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3.5 shadow-sm text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Fit Score</span>
                      <span className={`text-2xl font-black ${
                        resumeResult.skillMatchScore >= 75 ? "text-emerald-600" :
                        resumeResult.skillMatchScore >= 50 ? "text-amber-500" : "text-rose-500"
                      }`}>
                        {resumeResult.skillMatchScore}%
                      </span>
                    </div>
                    <div className="h-px bg-slate-100" />
                    <div>
                      <span className="font-bold text-slate-800">Match Summary</span>
                      <p className="mt-1 text-slate-600 leading-5">{resumeResult.summary}</p>
                    </div>
                    {resumeResult.skills && resumeResult.skills.length > 0 && (
                      <div>
                        <span className="font-bold text-slate-800">Detected Skills</span>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {resumeResult.skills.map((skill: string) => (
                            <span
                              key={skill}
                              className="rounded-full bg-violet-50 border border-violet-100 px-2.5 py-0.5 text-[9px] font-bold text-violet-700 uppercase tracking-wide"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {resumeResult && resumeResult.improvements && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Parser Improvements Tip</div>
                  <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600">
                    {resumeResult.improvements.map((imp: string, idx: number) => (
                      <li key={idx}>{imp}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 3: TRAIN AI INTERVIEWER */}
      {activeTab === "train" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          {/* Trainer Settings Panel */}
          <Card className="rounded-2xl border-slate-200/60 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-slate-800">
                <Cpu className="h-4 w-4 text-violet-600" />
                Interviewer Training Workshop
              </CardTitle>
              <CardDescription>Select a drive and provide training configurations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Hiring Drive Dropdown */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">Select Hiring Drive / Job</Label>
                {loadingJobs ? (
                  <div className="h-10 rounded-lg border border-slate-200 flex items-center justify-center bg-slate-50 text-xs text-slate-500 font-medium">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-violet-600" /> Loading hiring drives...
                  </div>
                ) : (
                  <select
                    value={selectedJobId}
                    onChange={(e) => handleJobChange(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:border-violet-500 focus:bg-white focus:outline-none"
                  >
                    <option value="">Select a drive to train its AI Interviewer model...</option>
                    {jobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.title} · {job.company_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {!selectedJobId ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center text-sm text-slate-500">
                  <Brain className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                  Please select an active hiring drive to load and train its AI interview model.
                </div>
              ) : loadingConfig ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-xs font-semibold gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
                  Loading model state and parameters...
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Model Persona selection */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-700">Interviewer Persona / Tone</Label>
                      <select
                        value={aiConfig.persona}
                        onChange={(e) => setAiConfig((prev) => ({ ...prev, persona: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 focus:border-violet-500 focus:bg-white focus:outline-none"
                      >
                        <option value="Standard HR Recruiter">Standard HR Recruiter (Professional & Polite)</option>
                        <option value="Tech Lead">Tech Lead (Deep Technical Probe)</option>
                        <option value="Socratic Code Coach">Socratic Code Coach (Collaborative & Helpful)</option>
                        <option value="Strict DBMS Evaluator">Strict DBMS Evaluator (Precise & Demanding)</option>
                        <option value="Custom">Custom Persona...</option>
                      </select>
                    </div>

                    {aiConfig.persona === "Custom" && (
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-700">Custom Persona Name</Label>
                        <Input
                          value={customPersona}
                          onChange={(e) => setCustomPersona(e.target.value)}
                          placeholder="e.g. Senior Security Specialist"
                          className="bg-slate-50/50"
                        />
                      </div>
                    )}
                  </div>

                  {/* Custom Guidelines */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-700">Custom System Instructions & Focus Areas</Label>
                    <Textarea
                      value={aiConfig.instructions}
                      onChange={(e) => setAiConfig((prev) => ({ ...prev, instructions: e.target.value }))}
                      placeholder="e.g. Focus on checking database normalization rules, REST API best practices, and error handling. Make sure candidate explains their reasoning."
                      className="min-h-24 resize-none leading-5 bg-slate-50/50 text-xs"
                    />
                  </div>

                  {/* Custom Grading Rubrics */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-700">Custom Grading Rubric Guidelines</Label>
                    <Textarea
                      value={aiConfig.rubric}
                      onChange={(e) => setAiConfig((prev) => ({ ...prev, rubric: e.target.value }))}
                      placeholder="e.g. Score strictly. If the candidate answers with vague single-sentence descriptions, do not give above 45. Dedicate more weight to runtime and scaling considerations."
                      className="min-h-24 resize-none leading-5 bg-slate-50/50 text-xs"
                    />
                  </div>

                  {/* Few-Shot Examples (Training Examples) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div>
                        <span className="text-xs font-bold text-slate-800">Few-Shot Training Examples</span>
                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                          Provide sample questions and answers to teach the AI your grading standard.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddExample}
                        className="text-[11px] font-bold h-7 border-dashed border-violet-300 text-violet-700 hover:bg-violet-50 px-2 rounded-lg"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Example
                      </Button>
                    </div>

                    {aiConfig.examples.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400 bg-slate-50/50">
                        No training examples added yet. Click "Add Example" to provide few-shot training.
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                        {aiConfig.examples.map((example, idx) => (
                          <div key={idx} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 relative shadow-xs">
                            <button
                              type="button"
                              onClick={() => handleRemoveExample(idx)}
                              className="absolute top-3 right-3 text-slate-400 hover:text-rose-600 transition"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              Example #{idx + 1}
                            </span>
                            <div className="grid gap-2">
                              <div>
                                <Label className="text-[10px] font-bold text-slate-600">Sample Question</Label>
                                <Input
                                  value={example.question}
                                  onChange={(e) => handleExampleChange(idx, "question", e.target.value)}
                                  placeholder="e.g. What are transaction logs in DBMS?"
                                  className="h-8 text-xs mt-0.5"
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] font-bold text-slate-600">Sample Candidate Answer</Label>
                                <Textarea
                                  value={example.answer}
                                  onChange={(e) => handleExampleChange(idx, "answer", e.target.value)}
                                  placeholder="e.g. Logs record changes before database write for crash recovery."
                                  className="min-h-12 text-xs mt-0.5 resize-none"
                                />
                              </div>
                              <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-3">
                                <div>
                                  <Label className="text-[10px] font-bold text-slate-600">Target Score</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={example.score}
                                    onChange={(e) => handleExampleChange(idx, "score", e.target.value)}
                                    className="h-8 text-xs mt-0.5 text-center font-extrabold text-blue-700"
                                  />
                                </div>
                                <div>
                                  <Label className="text-[10px] font-bold text-slate-600">Expected AI Feedback</Label>
                                  <Input
                                    value={example.feedback}
                                    onChange={(e) => handleExampleChange(idx, "feedback", e.target.value)}
                                    placeholder="e.g. Correct and concise. Identifies WAL principles and purpose."
                                    className="h-8 text-xs mt-0.5"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="h-px bg-slate-100" />

                  {/* Deploy/Save button */}
                  <Button
                    onClick={handleSaveConfig}
                    disabled={savingConfig}
                    className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold h-11 shadow-md shadow-violet-100 rounded-xl"
                  >
                    {savingConfig ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Training & Deploying Model...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" /> Save & Deploy AI Interview Model
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Model Sandbox Playground */}
          {selectedJobId && !loadingConfig && (
            <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-slate-50/50 h-fit self-start sticky top-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-slate-800">
                  <Play className="h-4 w-4 text-violet-600" />
                  Model Sandbox Playground
                </CardTitle>
                <CardDescription>
                  Instant sandbox testing. Run candidate answers against your configuration parameters.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700">Sandbox Test Question</Label>
                  <Input
                    value={sandboxQuestion}
                    onChange={(e) => setSandboxQuestion(e.target.value)}
                    placeholder="Enter test question..."
                    className="bg-white text-xs h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700">Sandbox Test Answer</Label>
                  <Textarea
                    value={sandboxAnswer}
                    onChange={(e) => setSandboxAnswer(e.target.value)}
                    placeholder="Enter candidate test answer..."
                    className="bg-white text-xs min-h-20 leading-5 resize-none"
                  />
                </div>

                <Button
                  onClick={handleTestSandbox}
                  disabled={testingSandbox}
                  variant="outline"
                  className="w-full font-bold border-violet-200 text-violet-700 hover:bg-violet-50 h-10 rounded-xl"
                >
                  {testingSandbox ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing Model...
                    </>
                  ) : (
                    <>
                      <Brain className="mr-2 h-4 w-4" /> Run Test Evaluation
                    </>
                  )}
                </Button>

                {/* Sandbox results output */}
                {sandboxResult && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3.5 shadow-sm text-xs mt-3 animate-in fade-in-50 duration-150">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-400 uppercase tracking-wider text-[10px] flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                        Sandbox Output
                      </span>
                      <span className="text-xl font-black text-blue-700">{sandboxResult.score}/100</span>
                    </div>
                    <div className="h-px bg-slate-100" />
                    <div>
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                        AI Feedback
                      </span>
                      <p className="mt-1.5 text-slate-600 leading-5 italic bg-slate-50 p-3 rounded-lg border border-slate-100">
                        "{sandboxResult.feedback}"
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

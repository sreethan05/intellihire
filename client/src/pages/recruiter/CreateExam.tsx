import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { examApi, aiApi, recruiterApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Save, ArrowRight, CheckCircle, Database, PenLine, Sparkles, FileText, Type, Clock, Trophy, ShieldCheck, Calendar, Info } from "lucide-react";
import { toast } from "sonner";

interface MCQQuestion {
  question_text: string; option_a: string; option_b: string;
  option_c: string; option_d: string; correct_option: string; marks: number;
}
interface CodingQuestionForm {
  title: string; description: string; difficulty: string;
  starter_code: string; test_cases: { input: string; expected_output: string }[]; marks: number;
}

const AVAILABLE_TOPICS = [
  "1D Arrays (Static/Dynamic)",
  "2D Arrays / Matrices",
  "Singly Linked List",
  "Doubly Linked List",
  "Circular Linked List",
  "Floyd's Cycle Detection",
  "Stack Implementation",
  "Monotonic Stack",
  "Queue Implementation",
  "Circular Queue",
  "Double-ended Queue (Deque)",
  "Monotonic Queue",
  "Priority Queue & Heaps",
  "Min-Heap & Max-Heap",
  "Hashing & HashMaps",
  "HashSets & Collision Resolution",
  "Binary Trees (Traversals)",
  "Binary Tree Level Order Traversal",
  "Binary Search Tree (BST)",
  "AVL Tree (Balanced BST)",
  "Red-Black Tree",
  "Segment Tree (Range Queries)",
  "Fenwick Tree (Binary Indexed)",
  "Trie (Prefix Tree)",
  "Disjoint Set Union (DSU / Union-Find)",
  "Time & Space Complexity",
  "Recursion",
  "Divide & Conquer",
  "Backtracking (N-Queens, Sudoku)",
  "Bit Manipulation & Bitwise Hacks",
  "Two Pointers Technique",
  "Prefix Sum & Suffix Sum",
  "Kadane's Algorithm (Max Subarray Sum)",
  "Sliding Window (Fixed-size)",
  "Sliding Window (Variable-size)",
  "Linear Search",
  "Binary Search (Standard)",
  "Binary Search (on Search Space)",
  "Binary Search on Rotated Arrays",
  "Ternary Search",
  "Bubble, Selection & Insertion Sort",
  "Merge Sort & Quick Sort",
  "Heap Sort",
  "Radix, Counting & Bucket Sort",
  "Greedy Algorithms",
  "Fractional Knapsack Problem",
  "Activity Selection / Scheduling",
  "Job Sequencing with Deadlines",
  "Huffman Coding",
  "1D Dynamic Programming",
  "2D/Grid Dynamic Programming",
  "0/1 Knapsack Problem",
  "Unbounded Knapsack Problem",
  "Longest Common Subsequence (LCS)",
  "Longest Increasing Subsequence (LIS)",
  "Matrix Chain Multiplication (MCM)",
  "Bitmask Dynamic Programming",
  "Dynamic Programming on Trees",
  "Graph Representation (Adjacency Matrix/List)",
  "Depth First Search (DFS)",
  "Breadth First Search (BFS)",
  "Topological Sorting (DFS-based)",
  "Kahn's Topological Sort Algorithm",
  "Dijkstra's Shortest Path Algorithm",
  "Bellman-Ford Algorithm",
  "Floyd-Warshall Algorithm (All Pairs)",
  "Kruskal's Minimum Spanning Tree",
  "Prim's Minimum Spanning Tree",
  "Strongly Connected Components (SCC)",
  "Kosaraju's SCC Algorithm",
  "Tarjan's SCC Algorithm",
  "Naive Pattern Searching",
  "KMP Algorithm (Knuth-Morris-Pratt)",
  "Rabin-Karp Algorithm",
  "Z-Algorithm"
];

const GENERAL_MCQ_TOPICS = [
  // Languages & Frameworks
  "Python", "JavaScript", "SQL", "C++", "Java", "TypeScript", "C", "C#", "Go", "Rust", "Ruby", "Swift", "PHP", "Kotlin", "HTML", "CSS", "Object-Oriented Programming (OOPs)", "Database Management Systems (DBMS)", "Operating Systems (OS)", "Computer Networks (CN)", "System Design", "Web Development", "Mobile Development", "Software Engineering", "Cloud Computing", "Cybersecurity", "DevOps", "Docker", "Git & Version Control",
  // DSA (Data Structures)
  "Arrays", "Strings", "Linked Lists", "Stacks", "Queues", "Binary Trees", "Binary Search Trees (BST)", "Heaps & Priority Queues", "Hashing & HashMaps", "Graphs", "Tries", "Segment Trees", "Disjoint Set Union (DSU)", "Monotonic Stack",
  // DSA (Algorithms)
  "Binary Search", "Sorting Algorithms", "Recursion", "Backtracking", "Two Pointers", "Sliding Window", "Greedy Algorithms", "Dynamic Programming (DP)", "Divide & Conquer", "Graph Traversals (DFS/BFS)", "Shortest Path Algorithms", "Minimum Spanning Tree (MST)", "Bit Manipulation",
  // Aptitude & Reasoning
  "Quantitative Aptitude", "Logical Reasoning", "Verbal Ability", "Data Interpretation", "Percentages", "Profit and Loss", "Time and Work", "Probability", "Number Series", "Permutations and Combinations",
  // Advanced Tech
  "Machine Learning (ML)", "Artificial Intelligence (AI)", "Deep Learning", "Natural Language Processing (NLP)", "Data Science", "Blockchain"
];

export default function CreateExam() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [examId, setExamId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(30);
  const [totalMarks, setTotalMarks] = useState(100);
  const [passMarks, setPassMarks] = useState(40);
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [examStatus, setExamStatus] = useState<"draft" | "published">("draft");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [negativeMarking, setNegativeMarking] = useState(0);
  const [mcqQuestions, setMcqQuestions] = useState<MCQQuestion[]>([]);
  const [codingQuestions, setCodingQuestions] = useState<CodingQuestionForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Question bank state
  const [bankMcq, setBankMcq] = useState<any[]>([]);
  const [bankCoding, setBankCoding] = useState<any[]>([]);
  const [selectedBankMcq, setSelectedBankMcq] = useState<Set<string>>(new Set());
  const [selectedBankCoding, setSelectedBankCoding] = useState<Set<string>>(new Set());
  const [bankLoading, setBankLoading] = useState(false);

  // Job drive assignment state
  const [drives, setDrives] = useState<any[]>([]);
  const [selectedDriveId, setSelectedDriveId] = useState("");
  const [assigningDrive, setAssigningDrive] = useState(false);

  // AI Generation States & Handlers
  const [searchMcqQuery, setSearchMcqQuery] = useState("");
  const [searchCodingQuery, setSearchCodingQuery] = useState("");
  const [selectedMcqTopics, setSelectedMcqTopics] = useState<{ topic: string; count: number }[]>([]);
  const [selectedCodingTopics, setSelectedCodingTopics] = useState<{ topic: string; count: number }[]>([]);

  // Unified AI Generation States
  const [unifiedMcqTopics, setUnifiedMcqTopics] = useState<string[]>([]);
  const [unifiedMcqSearch, setUnifiedMcqSearch] = useState("");
  const [unifiedCodingTopics, setUnifiedCodingTopics] = useState<string[]>([]);
  const [unifiedCodingSearch, setUnifiedCodingSearch] = useState("");
  const [unifiedMode, setUnifiedMode] = useState<"balanced" | "mcq" | "coding">("balanced");
  const [unifiedDifficulty, setUnifiedDifficulty] = useState("medium");
  const [unifiedLoading, setUnifiedLoading] = useState(false);

  const handleGenerateUnified = async () => {
    if (unifiedMode !== "coding" && unifiedMcqTopics.length === 0) {
      toast.error("Please select at least one MCQ topic");
      return;
    }
    if (unifiedMode !== "mcq" && unifiedCodingTopics.length === 0) {
      toast.error("Please select at least one DSA coding topic");
      return;
    }
    setUnifiedLoading(true);
    setError("");

    try {
      // 1. Calculate target marks for each type
      let codingTarget = 0;
      let mcqTarget = 0;

      if (unifiedMode === "balanced") {
        codingTarget = Math.round(totalMarks * 0.6);
        mcqTarget = totalMarks - codingTarget;
      } else if (unifiedMode === "mcq") {
        mcqTarget = totalMarks;
      } else {
        codingTarget = totalMarks;
      }

      // 2. Determine question counts
      // Assume Coding questions are ~20 marks each
      let codingCount = codingTarget > 0 ? Math.max(1, Math.round(codingTarget / 20)) : 0;
      // MCQs are ~2 marks each
      let mcqCount = mcqTarget > 0 ? Math.max(1, Math.round(mcqTarget / 2)) : 0;

      // Ensure we don't exceed limits
      if (codingCount > 5) codingCount = 5;
      if (mcqCount > 50) mcqCount = 50;

      // 3. Distribute counts across selected topics
      const selectedCodingTopicsList: { topic: string; count: number }[] = [];
      const selectedMcqTopicsList: { topic: string; count: number }[] = [];

      if (codingCount > 0) {
        const topics = unifiedCodingTopics.length > 0 ? unifiedCodingTopics : ["General DSA"];
        for (let i = 0; i < codingCount; i++) {
          const topic = topics[i % topics.length];
          const existing = selectedCodingTopicsList.find(t => t.topic === topic);
          if (existing) {
            existing.count += 1;
          } else {
            selectedCodingTopicsList.push({ topic, count: 1 });
          }
        }
      }

      if (mcqCount > 0) {
        const topics = unifiedMcqTopics.length > 0 ? unifiedMcqTopics : ["General Technical"];
        for (let i = 0; i < mcqCount; i++) {
          const topic = topics[i % topics.length];
          const existing = selectedMcqTopicsList.find(t => t.topic === topic);
          if (existing) {
            existing.count += 1;
          } else {
            selectedMcqTopicsList.push({ topic, count: 1 });
          }
        }
      }

      // 4. Generate in parallel
      let generatedMcqsList: MCQQuestion[] = [];
      let generatedCodingListTemp: CodingQuestionForm[] = [];

      const mcqPromises = selectedMcqTopicsList.map(async (target) => {
        const { data } = await aiApi.generateMcq({
          topic: target.topic,
          difficulty: unifiedDifficulty,
          count: target.count
        });
        return data.questions || [];
      });

      const codingPromises = selectedCodingTopicsList.map(async (target) => {
        const { data } = await aiApi.generateCoding({
          topic: target.topic,
          difficulty: unifiedDifficulty,
          count: target.count
        });
        return data.questions || (data.question ? [data.question] : []);
      });

      const [mcqResults, codingResults] = await Promise.all([
        Promise.all(mcqPromises),
        Promise.all(codingPromises)
      ]);

      generatedMcqsList = mcqResults.flat();
      generatedCodingListTemp = codingResults.flat();

      if (generatedMcqsList.length === 0 && generatedCodingListTemp.length === 0) {
        throw new Error("No questions were generated by the AI engine");
      }

      // 5. Proportional Marks Allocation and Scaling
      // Coding questions base weight = 20, MCQ base weight = 2
      // Difficulty multiplier: easy = 1.0, medium = 1.5, hard = 2.0
      const getMultiplier = (diff: string) => {
        const d = diff.toLowerCase();
        if (d === "easy") return 1.0;
        if (d === "hard") return 2.0;
        return 1.5;
      };

      const qItems: { type: "mcq" | "coding"; index: number; weight: number }[] = [];
      generatedMcqsList.forEach((_, idx) => {
        qItems.push({ type: "mcq", index: idx, weight: 2 * getMultiplier(unifiedDifficulty) });
      });
      generatedCodingListTemp.forEach((q, idx) => {
        qItems.push({ type: "coding", index: idx, weight: 20 * getMultiplier(q.difficulty || unifiedDifficulty) });
      });

      const totalWeight = qItems.reduce((sum, item) => sum + item.weight, 0);

      if (totalWeight > 0) {
        let allocatedSum = 0;
        qItems.forEach((item, idx) => {
          // Proportional share
          let marks = Math.max(1, Math.round((item.weight / totalWeight) * totalMarks));
          
          // Adjust last item to ensure it sums exactly to totalMarks
          if (idx === qItems.length - 1) {
            marks = totalMarks - allocatedSum;
            if (marks <= 0) marks = 1; // Safeguard
          }
          
          allocatedSum += marks;

          if (item.type === "mcq") {
            generatedMcqsList[item.index].marks = marks;
          } else {
            generatedCodingListTemp[item.index].marks = marks;
          }
        });
      }

      // 6. Set active exam questions and switch tabs
      setMcqQuestions(generatedMcqsList);
      setCodingQuestions(generatedCodingListTemp);
      toast.success(`Successfully generated ${generatedMcqsList.length} MCQs and ${generatedCodingListTemp.length} coding questions totaling exactly ${totalMarks} marks!`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to generate complete exam with AI.");
    } finally {
      setUnifiedLoading(false);
    }
  };


  const [aiMcqDifficulty, setAiMcqDifficulty] = useState("medium");
  const [aiMcqCount, setAiMcqCount] = useState(5);
  const [aiMcqLoading, setAiMcqLoading] = useState(false);
  const [generatedMcqs, setGeneratedMcqs] = useState<MCQQuestion[]>([]);
  const [selectedGeneratedMcqIdxs, setSelectedGeneratedMcqIdxs] = useState<Set<number>>(new Set());

  const [aiCodingDifficulty, setAiCodingDifficulty] = useState("medium");
  const [aiCodingCount, setAiCodingCount] = useState(1);
  const [aiCodingLoading, setAiCodingLoading] = useState(false);
  const [generatedCodingList, setGeneratedCodingList] = useState<CodingQuestionForm[]>([]);
  const [selectedGeneratedCodingIdxs, setSelectedGeneratedCodingIdxs] = useState<Set<number>>(new Set());

  const handleGenerateMcq = async () => {
    setAiMcqLoading(true);
    setGeneratedMcqs([]);
    setSelectedGeneratedMcqIdxs(new Set());

    const targets = selectedMcqTopics.length > 0 
      ? selectedMcqTopics 
      : [{ topic: "General Technical", count: aiMcqCount }];

    let allGenerated: MCQQuestion[] = [];

    try {
      const promises = targets.map(async (target) => {
        const { data } = await aiApi.generateMcq({
          topic: target.topic,
          difficulty: aiMcqDifficulty,
          count: target.count
        });
        return data.questions || [];
      });

      const results = await Promise.all(promises);
      allGenerated = results.flat();

      if (allGenerated.length === 0) {
        throw new Error("No questions were generated");
      }

      setGeneratedMcqs(allGenerated);
      setSelectedGeneratedMcqIdxs(new Set(allGenerated.map((_, idx) => idx)));
      toast.success(`Successfully generated ${allGenerated.length} MCQs!`);
    } catch (_err) {
      toast.error("Could not generate MCQs with AI. Using fallbacks.");
    } finally {
      setAiMcqLoading(false);
    }
  };

  const toggleSelectedGeneratedMcq = (idx: number) => {
    const next = new Set(selectedGeneratedMcqIdxs);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelectedGeneratedMcqIdxs(next);
  };

  const addSelectedGeneratedMcqs = () => {
    const toAdd = generatedMcqs.filter((_, idx) => selectedGeneratedMcqIdxs.has(idx));
    if (toAdd.length === 0) { toast.error("Please select at least one question to add"); return; }
    setMcqQuestions([...mcqQuestions, ...toAdd]);
    setGeneratedMcqs([]);
    setSelectedGeneratedMcqIdxs(new Set());
    toast.success(`${toAdd.length} generated questions added to the exam!`);
  };

  const handleGenerateCoding = async () => {
    setAiCodingLoading(true);
    setGeneratedCodingList([]);
    setSelectedGeneratedCodingIdxs(new Set());

    const targets = selectedCodingTopics.length > 0 
      ? selectedCodingTopics 
      : [{ topic: "General DSA", count: aiCodingCount }];

    let allGenerated: CodingQuestionForm[] = [];

    try {
      const promises = targets.map(async (target) => {
        const { data } = await aiApi.generateCoding({
          topic: target.topic,
          difficulty: aiCodingDifficulty,
          count: target.count
        });
        return data.questions || (data.question ? [data.question] : []);
      });

      const results = await Promise.all(promises);
      allGenerated = results.flat();

      if (allGenerated.length === 0) {
        throw new Error("No coding questions were generated");
      }

      setGeneratedCodingList(allGenerated);
      setSelectedGeneratedCodingIdxs(new Set(allGenerated.map((_, idx) => idx)));
      toast.success(`Successfully drafted ${allGenerated.length} coding challenges!`);
    } catch (_err) {
      toast.error("Could not draft coding challenges with AI.");
    } finally {
      setAiCodingLoading(false);
    }
  };

  const toggleSelectedGeneratedCoding = (idx: number) => {
    const next = new Set(selectedGeneratedCodingIdxs);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelectedGeneratedCodingIdxs(next);
  };

  const addSelectedGeneratedCoding = () => {
    const toAdd = generatedCodingList.filter((_, idx) => selectedGeneratedCodingIdxs.has(idx));
    if (toAdd.length === 0) { toast.error("Please select at least one coding question to add"); return; }
    setCodingQuestions([...codingQuestions, ...toAdd]);
    setGeneratedCodingList([]);
    setSelectedGeneratedCodingIdxs(new Set());
    toast.success(`${toAdd.length} coding questions added to the exam!`);
  };


  useEffect(() => {
    if (step === 2) {
      setBankLoading(true);
      Promise.all([
        examApi.getBankMcq(),
        examApi.getBankCoding(),
      ]).then(([m, c]) => {
        setBankMcq(m.data?.questions || []);
        setBankCoding(c.data?.coding_questions || []);
      }).finally(() => setBankLoading(false));
    }
  }, [step]);

  useEffect(() => {
    if (step === 3 && examId) {
      recruiterApi.getDrives().then((res) => {
        setDrives(res.data.drives || []);
      }).catch((_err) => {
        toast.error("Could not load drives");
      });
    }
  }, [step, examId]);

  const handleAssignToDrive = async () => {
    if (!selectedDriveId) {
      toast.error("Please select a job drive");
      return;
    }
    setAssigningDrive(true);
    try {
      await recruiterApi.assignDriveExam(selectedDriveId, examId);
      toast.success("Exam successfully assigned to the Job Drive!");
      navigate("/recruiter/dashboard");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Could not assign exam to drive");
    } finally {
      setAssigningDrive(false);
    }
  };

  const addMcqQuestion = () => setMcqQuestions([...mcqQuestions, { question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "A", marks: 1 }]);
  const updateMcqQuestion = (i: number, f: keyof MCQQuestion, v: string | number) => { const u = [...mcqQuestions]; u[i] = { ...u[i], [f]: v }; setMcqQuestions(u); };
  const removeMcqQuestion = (i: number) => setMcqQuestions(mcqQuestions.filter((_, idx) => idx !== i));
  const addCodingQuestion = () => setCodingQuestions([...codingQuestions, { title: "", description: "", difficulty: "medium", starter_code: "", test_cases: [{ input: "", expected_output: "" }], marks: 10 }]);
  const updateCodingQuestion = (i: number, f: keyof CodingQuestionForm, v: any) => { const u = [...codingQuestions]; u[i] = { ...u[i], [f]: v }; setCodingQuestions(u); };
  const updateTestCase = (qi: number, ti: number, f: string, v: string) => { const u = [...codingQuestions]; u[qi].test_cases[ti] = { ...u[qi].test_cases[ti], [f]: v }; setCodingQuestions(u); };
  const addTestCase = (qi: number) => { const u = [...codingQuestions]; u[qi].test_cases.push({ input: "", expected_output: "" }); setCodingQuestions(u); };
  const removeCodingQuestion = (i: number) => setCodingQuestions(codingQuestions.filter((_, idx) => idx !== i));

  const toggleBankMcq = (id: string) => {
    const next = new Set(selectedBankMcq);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedBankMcq(next);
  };
  const toggleBankCoding = (id: string) => {
    const next = new Set(selectedBankCoding);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedBankCoding(next);
  };

  const handleCreateExam = async () => {
    if (!title || !duration || !totalMarks) { setError("Please fill all required fields"); return; }
    if (duration < 5) { setError("Duration must be at least 5 minutes"); return; }
    if (passMarks > totalMarks) { setError("Pass marks cannot be greater than total marks"); return; }
    if (availableFrom && availableUntil && new Date(availableUntil) <= new Date(availableFrom)) {
      setError("Attempt until time must be after the start time");
      return;
    }
    setError(""); setLoading(true);
    try {
      const { data } = await examApi.createExam({
        title,
        description,
        duration,
        total_marks: totalMarks,
        pass_marks: passMarks,
        available_from: availableFrom ? new Date(availableFrom).toISOString() : undefined,
        available_until: availableUntil ? new Date(availableUntil).toISOString() : undefined,
        status: examStatus,
        shuffle_questions: shuffleQuestions,
        negative_marking: negativeMarking,
      });
      setExamId(data.exam.id); setStep(2);
    } catch (err: any) { setError(err.response?.data?.error || "Failed to create exam"); }
    finally { setLoading(false); }
  };

  const handleAddQuestions = async () => {
    const hasNew = mcqQuestions.length > 0 || codingQuestions.length > 0;
    const hasBank = selectedBankMcq.size > 0 || selectedBankCoding.size > 0;
    if (!hasNew && !hasBank) { setError("Add or select at least one question"); return; }
    setError(""); setLoading(true);
    try {
      if (mcqQuestions.length > 0) await examApi.addQuestions({ exam_id: examId, questions: mcqQuestions });
      if (codingQuestions.length > 0) await examApi.addCodingQuestions({ exam_id: examId, coding_questions: codingQuestions });
      if (selectedBankMcq.size > 0) await examApi.linkBankMcq({ exam_id: examId, question_ids: Array.from(selectedBankMcq) });
      if (selectedBankCoding.size > 0) await examApi.linkBankCoding({ exam_id: examId, coding_question_ids: Array.from(selectedBankCoding) });
      setStep(3);
    } catch (err: any) { setError(err.response?.data?.error || "Failed to add questions"); }
    finally { setLoading(false); }
  };

  const diffColor: any = { easy: "#16a34a", medium: "#d97706", hard: "#dc2626" };

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-4 md:p-6 text-left">
      {/* Header with Icon */}
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-100 text-violet-600 shadow-sm shrink-0">
          <FileText className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 leading-tight">Create Exam</h2>
          <p className="text-sm text-slate-500 mt-0.5">Build an exam with MCQ and coding questions</p>
        </div>
      </div>

      {/* Stepper with dotted lines */}
      <div className="flex items-center justify-start flex-wrap gap-4 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${step >= 1 ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"}`}>
            {step > 1 ? <CheckCircle className="w-5 h-5" /> : "1"}
          </div>
          <div>
            <div className={`text-sm font-bold ${step >= 1 ? "text-slate-900" : "text-slate-400"}`}>Details</div>
            <div className={`text-xs ${step >= 1 ? "text-violet-600 font-medium" : "text-slate-400"}`}>Add exam information</div>
          </div>
        </div>

        <div className="hidden md:block flex-1 max-w-16 border-t-2 border-dashed border-slate-200 mx-2" />

        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${step >= 2 ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"}`}>
            {step > 2 ? <CheckCircle className="w-5 h-5" /> : "2"}
          </div>
          <div>
            <div className={`text-sm font-bold ${step >= 2 ? "text-slate-900" : "text-slate-400"}`}>Questions</div>
            <div className={`text-xs ${step >= 2 ? "text-violet-650 font-medium" : "text-slate-400"}`}>Add MCQ & coding questions</div>
          </div>
        </div>

        <div className="hidden md:block flex-1 max-w-16 border-t-2 border-dashed border-slate-200 mx-2" />

        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${step >= 3 ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"}`}>
            {step > 3 ? <CheckCircle className="w-5 h-5" /> : "3"}
          </div>
          <div>
            <div className={`text-sm font-bold ${step >= 3 ? "text-slate-900" : "text-slate-400"}`}>Complete</div>
            <div className={`text-xs ${step >= 3 ? "text-violet-650 font-medium" : "text-slate-400"}`}>Review and publish</div>
          </div>
        </div>
      </div>

      {error && <div className="mb-4 p-3.5 text-sm text-red-650 bg-red-50 border border-red-100 rounded-xl font-medium">{error}</div>}

      {step === 1 && (
        <div className="space-y-6">
          <Card className="rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] overflow-hidden">
            <CardHeader className="border-b border-slate-50 pb-5">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-50 text-violet-600">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold text-slate-800">Exam Details</CardTitle>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Provide the basic information about your exam</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 md:p-8 space-y-6">
              {/* Title Input */}
              <div className="space-y-1.5 w-full">
                <Label className="text-sm font-semibold text-slate-700">Title <span className="text-red-500">*</span></Label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-violet-50 text-violet-600 shrink-0">
                    <Type className="w-5 h-5" />
                  </div>
                  <Input 
                    value={title} 
                    onChange={e => setTitle(e.target.value)} 
                    placeholder="Enter exam title"
                    className="h-11 rounded-xl border-slate-200 focus:border-violet-400 focus:ring-violet-400 w-full"
                  />
                </div>
              </div>

              {/* Description Textarea */}
              <div className="space-y-1.5 w-full">
                <Label className="text-sm font-semibold text-slate-700">Description</Label>
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-violet-50 text-violet-600 shrink-0 mt-1">
                    <FileText className="w-5 h-5" />
                  </div>
                  <Textarea 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    placeholder="Enter exam description (optional)"
                    rows={4} 
                    className="rounded-xl border-slate-200 focus:border-violet-400 focus:ring-violet-400 resize-none w-full"
                  />
                </div>
              </div>

              {/* 3-Column Grid for Duration, Total Marks, Pass Marks */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Duration */}
                <div className="space-y-1.5 w-full">
                  <Label className="text-sm font-semibold text-slate-700">Duration (min) <span className="text-red-500">*</span></Label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-violet-50 text-violet-600 shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <Input 
                      type="number" 
                      value={duration} 
                      onChange={e => setDuration(Number(e.target.value))} 
                      className="h-11 rounded-xl border-slate-200 focus:border-violet-400 focus:ring-violet-400 w-full"
                    />
                  </div>
                  <p className="text-xs text-slate-400 font-medium ml-14">Total time for the exam</p>
                </div>

                {/* Total Marks */}
                <div className="space-y-1.5 w-full">
                  <Label className="text-sm font-semibold text-slate-700">Total Marks <span className="text-red-500">*</span></Label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-violet-50 text-violet-600 shrink-0">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <Input 
                      type="number" 
                      value={totalMarks} 
                      onChange={e => setTotalMarks(Number(e.target.value))} 
                      className="h-11 rounded-xl border-slate-200 focus:border-violet-400 focus:ring-violet-400 w-full"
                    />
                  </div>
                  <p className="text-xs text-slate-400 font-medium ml-14">Maximum marks for the exam</p>
                </div>

                {/* Pass Marks */}
                <div className="space-y-1.5 w-full">
                  <Label className="text-sm font-semibold text-slate-700">Pass Marks</Label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-violet-50 text-violet-600 shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <Input 
                      type="number" 
                      value={passMarks} 
                      onChange={e => setPassMarks(Number(e.target.value))} 
                      className="h-11 rounded-xl border-slate-200 focus:border-violet-400 focus:ring-violet-400 w-full"
                    />
                  </div>
                  <p className="text-xs text-slate-400 font-medium ml-14">Minimum marks to pass</p>
                </div>
              </div>

              {/* 2-Column Grid for Date Pickers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Start From */}
                <div className="space-y-1.5 w-full">
                  <Label className="text-sm font-semibold text-slate-700">Candidate can start from</Label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-violet-50 text-violet-600 shrink-0">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <Input 
                      type="datetime-local" 
                      value={availableFrom} 
                      onChange={e => setAvailableFrom(e.target.value)} 
                      className="h-11 rounded-xl border-slate-200 focus:border-violet-400 focus:ring-violet-400 w-full"
                    />
                  </div>
                  <p className="text-xs text-slate-400 font-medium ml-14">When candidates can start the exam</p>
                </div>

                {/* Attempt Until */}
                <div className="space-y-1.5 w-full">
                  <Label className="text-sm font-semibold text-slate-700">Candidate can attempt until</Label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-violet-50 text-violet-600 shrink-0">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <Input 
                      type="datetime-local" 
                      value={availableUntil} 
                      onChange={e => setAvailableUntil(e.target.value)} 
                      className="h-11 rounded-xl border-slate-200 focus:border-violet-400 focus:ring-violet-400 w-full"
                    />
                  </div>
                  <p className="text-xs text-slate-400 font-medium ml-14">Last date & time to attempt the exam</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-slate-700">Exam Status</Label>
                  <Select value={examStatus} onValueChange={(value: "draft" | "published") => setExamStatus(value)}>
                    <SelectTrigger className="h-10 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">Use draft while preparing questions.</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-slate-700">Negative Marking</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step={0.25}
                    value={negativeMarking}
                    onChange={(event) => setNegativeMarking(Math.max(0, Number(event.target.value || 0)))}
                    className="h-10 bg-white"
                  />
                  <p className="text-xs text-slate-500">Marks deducted for each wrong MCQ.</p>
                </div>

                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <input
                    type="checkbox"
                    checked={shuffleQuestions}
                    onChange={(event) => setShuffleQuestions(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-violet-600"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-700">Shuffle Questions</span>
                    <span className="block text-xs text-slate-500">Randomize order for candidates.</span>
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                <Button 
                  variant="outline" 
                  onClick={() => navigate("/recruiter/dashboard")}
                  className="rounded-xl border-slate-200 px-6 h-11 font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateExam} 
                  disabled={loading}
                  className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold px-6 h-11 shadow-sm flex items-center gap-2"
                >
                  {loading ? "Creating..." : <>Next <ArrowRight className="w-4 h-4" /></>}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Bottom Info Banner */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2.5 rounded-xl border border-violet-150 bg-violet-50/50 px-4 py-2.5 text-xs font-semibold text-violet-705 shadow-sm">
              <Info className="w-4 h-4 text-violet-600" />
              You can edit all these settings anytime before publishing the exam.
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Tabs defaultValue="unified-ai">
            <TabsList className="w-full">
              <TabsTrigger value="unified-ai" className="flex-1 font-bold">✨ Unified AI Generator</TabsTrigger>
              <TabsTrigger value="mcq" className="flex-1">MCQ ({mcqQuestions.length + selectedBankMcq.size})</TabsTrigger>
              <TabsTrigger value="coding" className="flex-1">Coding ({codingQuestions.length + selectedBankCoding.size})</TabsTrigger>
            </TabsList>

            {/* ── UNIFIED AI GENERATOR TAB ── */}
            <TabsContent value="unified-ai" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base font-extrabold text-violet-700">
                    <Sparkles className="w-4 h-4 text-violet-600 animate-pulse" />
                    Unified AI Exam Architect
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="text-xs text-slate-500 font-semibold leading-relaxed">
                    Select target topics, choose an allocation mode, and click Generate. The system will automatically split your target marks of <span className="font-extrabold text-violet-750">{totalMarks} marks</span> into a balanced set of MCQs and coding questions, distribute them across the chosen topics, and run parallel AI generation.
                  </div>

                  <div className="grid gap-5 lg:grid-cols-3">
                    {/* MCQ Topics Selector */}
                    {unifiedMode !== "coding" ? (
                      <div className="space-y-2 text-left">
                        <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">MCQ Questions Topics</Label>
                        <Input 
                          placeholder="Search MCQ topics..." 
                          value={unifiedMcqSearch} 
                          onChange={e => setUnifiedMcqSearch(e.target.value)} 
                          className="h-9 bg-white"
                        />
                        <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto p-2 border border-slate-200 rounded-lg bg-white">
                          {GENERAL_MCQ_TOPICS.filter(t => t.toLowerCase().includes(unifiedMcqSearch.toLowerCase())).map(topic => {
                            const isSelected = unifiedMcqTopics.includes(topic);
                            return (
                              <button
                                key={topic}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setUnifiedMcqTopics(unifiedMcqTopics.filter(t => t !== topic));
                                  } else {
                                    setUnifiedMcqTopics([...unifiedMcqTopics, topic]);
                                  }
                                }}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-all ${
                                  isSelected 
                                    ? "bg-violet-600 text-white border-violet-600 shadow-sm" 
                                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                }`}
                              >
                                {isSelected ? "✓ " : ""}{topic}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col items-center justify-center text-xs text-slate-400 font-semibold italic text-center min-h-32">
                        MCQ Generation disabled in Coding Only Mode.
                      </div>
                    )}

                    {/* DSA Coding Topics Selector */}
                    {unifiedMode !== "mcq" ? (
                      <div className="space-y-2 text-left">
                        <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">DSA Coding Topics</Label>
                        <Input 
                          placeholder="Search DSA topics..." 
                          value={unifiedCodingSearch} 
                          onChange={e => setUnifiedCodingSearch(e.target.value)} 
                          className="h-9 bg-white"
                        />
                        <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto p-2 border border-slate-200 rounded-lg bg-white">
                          {AVAILABLE_TOPICS.filter(t => t.toLowerCase().includes(unifiedCodingSearch.toLowerCase())).map(topic => {
                            const isSelected = unifiedCodingTopics.includes(topic);
                            return (
                              <button
                                key={topic}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setUnifiedCodingTopics(unifiedCodingTopics.filter(t => t !== topic));
                                  } else {
                                    setUnifiedCodingTopics([...unifiedCodingTopics, topic]);
                                  }
                                }}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-all ${
                                  isSelected 
                                    ? "bg-violet-600 text-white border-violet-600 shadow-sm" 
                                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                }`}
                              >
                                {isSelected ? "✓ " : ""}{topic}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col items-center justify-center text-xs text-slate-400 font-semibold italic text-center min-h-32">
                        Coding Generation disabled in MCQ Only Mode.
                      </div>
                    )}

                    {/* Generator Configurations */}
                    <div className="space-y-4 text-left">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Generation Mode</Label>
                        <Select value={unifiedMode} onValueChange={(v: any) => setUnifiedMode(v)}>
                          <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="balanced">Balanced Mix (60% Coding, 40% MCQ)</SelectItem>
                            <SelectItem value="mcq">MCQ Only (100% MCQs)</SelectItem>
                            <SelectItem value="coding">Coding Only (100% Coding Problems)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Difficulty Level</Label>
                        <Select value={unifiedDifficulty} onValueChange={setUnifiedDifficulty}>
                          <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="easy">Easy (Fundamentals)</SelectItem>
                            <SelectItem value="medium">Medium (Standard Assessments)</SelectItem>
                            <SelectItem value="hard">Hard (Advanced DSA)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {(unifiedMcqTopics.length > 0 || unifiedCodingTopics.length > 0) && (
                        <div className="rounded-lg bg-violet-50/50 border border-violet-100 p-3 space-y-1">
                          <span className="text-[10px] font-extrabold text-violet-750 uppercase tracking-wider">Calculated Distribution Blueprint</span>
                          <div className="text-xs text-violet-800 font-semibold space-y-0.5">
                            {unifiedMode !== "coding" && (
                              <div>· MCQs: ~{unifiedMode === "mcq" ? Math.round(totalMarks / 2) : Math.round((totalMarks * 0.4) / 2)} questions ({unifiedMode === "mcq" ? totalMarks : Math.round(totalMarks * 0.4)} marks)</div>
                            )}
                            {unifiedMode !== "mcq" && (
                              <div>· Coding Challenges: ~{unifiedMode === "coding" ? Math.round(totalMarks / 20) : Math.round((totalMarks * 0.6) / 20)} problems ({unifiedMode === "coding" ? totalMarks : Math.round(totalMarks * 0.6)} marks)</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end pt-3 border-t border-slate-200">
                    <Button 
                      onClick={handleGenerateUnified} 
                      disabled={unifiedLoading || (unifiedMode !== "coding" && unifiedMcqTopics.length === 0) || (unifiedMode !== "mcq" && unifiedCodingTopics.length === 0)} 
                      className="bg-violet-600 hover:bg-violet-700 text-white font-extrabold shadow-sm px-6 h-9 animate-none"
                    >
                      {unifiedLoading ? "Generating Exam Paper..." : "Generate Complete Exam"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>


            {/* ── MCQ TAB ── */}
            <TabsContent value="mcq" className="space-y-4">
              <Tabs defaultValue="new-mcq">
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="new-mcq"><PenLine className="w-3 h-3 mr-1" />Create New</TabsTrigger>
                  <TabsTrigger value="bank-mcq"><Database className="w-3 h-3 mr-1" />Pick from Bank {bankMcq.length > 0 && `(${bankMcq.length})`}</TabsTrigger>
                  <TabsTrigger value="ai-mcq"><Sparkles className="w-3 h-3 mr-1" />Generate with AI</TabsTrigger>
                </TabsList>

                <TabsContent value="new-mcq" className="space-y-4 mt-3">
                  {mcqQuestions.map((q, index) => (
                    <Card key={index}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-medium text-gray-500">Q{index + 1}</span>
                          <Button variant="ghost" size="sm" onClick={() => removeMcqQuestion(index)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </div>
                        <div className="space-y-2"><Label>Question</Label><Textarea value={q.question_text} onChange={e => updateMcqQuestion(index, "question_text", e.target.value)} /></div>
                        <div className="grid grid-cols-2 gap-3">
                          {["a","b","c","d"].map(opt => (
                            <div key={opt} className="space-y-1">
                              <Label className="capitalize">Option {opt}</Label>
                              <Input value={(q as any)[`option_${opt}`]} onChange={e => updateMcqQuestion(index, `option_${opt}` as any, e.target.value)} />
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label>Correct Option</Label>
                            <Select value={q.correct_option} onValueChange={v => updateMcqQuestion(index, "correct_option", v)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>{["A","B","C","D"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1"><Label>Marks</Label><Input type="number" value={q.marks} onChange={e => updateMcqQuestion(index, "marks", Number(e.target.value))} /></div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Button variant="outline" onClick={addMcqQuestion} className="w-full"><Plus className="w-4 h-4 mr-2" />Add MCQ Question</Button>
                </TabsContent>

                <TabsContent value="bank-mcq" className="mt-3">
                  {bankLoading ? (
                    <div className="text-center py-8 text-gray-400">Loading question bank...</div>
                  ) : bankMcq.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>No MCQ questions in bank yet.</p>
                      <p className="text-sm mt-1">Questions you create will be saved here for reuse.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-500 mb-3">Select questions to add to this exam:</p>
                      {bankMcq.map((q: any) => {
                        const checked = selectedBankMcq.has(q.id);
                        return (
                          <div key={q.id} onClick={() => toggleBankMcq(q.id)} className="cursor-pointer"
                            style={{ border: `1.5px solid ${checked ? "#7c3aed" : "#e8ecf0"}`, borderRadius: 10, padding: "12px 16px", background: checked ? "#f5f3ff" : "white", transition: "all 0.15s" }}>
                            <div className="flex items-start gap-3">
                              <div style={{ width: 18, height: 18, borderRadius: 4, border: checked ? "none" : "1.5px solid #d1d5db", background: checked ? "#7c3aed" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                                {checked && <span style={{ color: "white", fontSize: 12, fontWeight: 700 }}>✓</span>}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-800">{q.question_text}</p>
                                <div className="grid grid-cols-2 gap-1 mt-2">
                                  {["a","b","c","d"].map(o => (
                                    <p key={o} className="text-xs text-gray-500">
                                      <span className={`font-semibold ${q.correct_option === o.toUpperCase() ? "text-green-600" : ""}`}>{o.toUpperCase()}.</span> {q[`option_${o}`]}
                                    </p>
                                  ))}
                                </div>
                                <p className="text-xs text-violet-600 mt-1">{q.marks} mark{q.marks !== 1 ? "s" : ""}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="ai-mcq" className="space-y-4 mt-3">
                  <div className="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2 text-left">
                        <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Search & Select Topics</Label>
                        <Input 
                          placeholder="Search topics (e.g., Python, OOPs, Arrays)..." 
                          value={searchMcqQuery} 
                          onChange={e => setSearchMcqQuery(e.target.value)} 
                          className="h-9 bg-white"
                        />
                        {/* Auto-scroll badges selector */}
                        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border border-slate-200 rounded-lg bg-white">
                          {GENERAL_MCQ_TOPICS.filter(t => t.toLowerCase().includes(searchMcqQuery.toLowerCase())).map(topic => {
                            const isSelected = selectedMcqTopics.some(item => item.topic === topic);
                            return (
                              <button
                                key={topic}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedMcqTopics(selectedMcqTopics.filter(item => item.topic !== topic));
                                  } else {
                                    setSelectedMcqTopics([...selectedMcqTopics, { topic, count: 5 }]);
                                  }
                                }}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-all ${
                                  isSelected 
                                    ? "bg-violet-600 text-white border-violet-600 shadow-sm" 
                                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                }`}
                              >
                                {isSelected ? "✓ " : ""}{topic}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-3 text-left">
                        <div className="flex justify-between items-center">
                          <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Configure Topic Counts</Label>
                          {selectedMcqTopics.length > 0 && (
                            <span className="text-xs font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                              Total: {selectedMcqTopics.reduce((acc, curr) => acc + curr.count, 0)} MCQs
                            </span>
                          )}
                        </div>
                        <div className="space-y-2 max-h-44 overflow-y-auto p-1">
                          {selectedMcqTopics.length === 0 ? (
                            <div className="text-center py-4 bg-white border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs font-semibold">
                              No specific topics selected. General technical MCQs will be generated.
                              <div className="mt-2.5 flex items-center justify-center gap-3">
                                <Label className="text-slate-700">Total Count:</Label>
                                <Input 
                                  type="number" 
                                  min={1} 
                                  max={50} 
                                  value={aiMcqCount} 
                                  onChange={e => setAiMcqCount(Math.min(50, Math.max(1, Number(e.target.value || 1))))} 
                                  className="w-16 h-8 bg-white text-center font-bold"
                                />
                              </div>
                            </div>
                          ) : (
                            selectedMcqTopics.map((item, idx) => (
                              <div key={item.topic} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                                <span className="text-xs font-bold text-slate-800">{item.topic}</span>
                                <div className="flex items-center gap-2">
                                  <Input 
                                    type="number" 
                                    min={1} 
                                    max={50} 
                                    value={item.count} 
                                    onChange={e => {
                                      const updated = [...selectedMcqTopics];
                                      updated[idx].count = Math.min(50, Math.max(1, Number(e.target.value || 1)));
                                      setSelectedMcqTopics(updated);
                                    }} 
                                    className="w-14 h-7 text-center text-xs font-bold"
                                  />
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => setSelectedMcqTopics(selectedMcqTopics.filter(t => t.topic !== item.topic))}
                                    className="h-6 w-6 p-0 hover:bg-slate-100"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-end gap-3 pt-3 border-t border-slate-200">
                      <div className="w-full sm:w-48 space-y-1.5 text-left">
                        <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Difficulty Level</Label>
                        <Select value={aiMcqDifficulty} onValueChange={setAiMcqDifficulty}>
                          <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="easy">Easy</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="hard">Hard</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleGenerateMcq} disabled={aiMcqLoading} className="h-9 bg-violet-600 hover:bg-violet-700 text-white font-bold px-6 shadow-sm">
                        {aiMcqLoading ? "Generating..." : "Generate MCQs"}
                      </Button>
                    </div>
                  </div>

                  {generatedMcqs.length > 0 && (
                    <div className="space-y-3 mt-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Preview Generated Questions ({selectedGeneratedMcqIdxs.size} of {generatedMcqs.length} selected)</span>
                        <Button size="sm" onClick={addSelectedGeneratedMcqs} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm">
                          Add Selected to Exam
                        </Button>
                      </div>
                      {generatedMcqs.map((q, idx) => {
                        const isChecked = selectedGeneratedMcqIdxs.has(idx);
                        return (
                          <div key={idx} onClick={() => toggleSelectedGeneratedMcq(idx)} className="cursor-pointer"
                            style={{ border: `1.5px solid ${isChecked ? "#10b981" : "#e8ecf0"}`, borderRadius: 10, padding: "12px 16px", background: isChecked ? "#f0fdf4" : "white", transition: "all 0.15s" }}>
                            <div className="flex items-start gap-3">
                              <div style={{ width: 18, height: 18, borderRadius: 4, border: isChecked ? "none" : "1.5px solid #d1d5db", background: isChecked ? "#10b981" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                                {isChecked && <span style={{ color: "white", fontSize: 12, fontWeight: 700 }}>✓</span>}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-slate-900">{q.question_text}</p>
                                <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-600">
                                  <span>A. {q.option_a}</span>
                                  <span>B. {q.option_b}</span>
                                  <span>C. {q.option_c}</span>
                                  <span>D. {q.option_d}</span>
                                </div>
                                <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mt-2">Correct Answer: Option {q.correct_option} · {q.marks} mark(s)</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* ── CODING TAB ── */}
            <TabsContent value="coding" className="space-y-4">
              <Tabs defaultValue="new-coding">
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="new-coding"><PenLine className="w-3 h-3 mr-1" />Create New</TabsTrigger>
                  <TabsTrigger value="bank-coding"><Database className="w-3 h-3 mr-1" />Pick from Bank {bankCoding.length > 0 && `(${bankCoding.length})`}</TabsTrigger>
                  <TabsTrigger value="ai-coding"><Sparkles className="w-3 h-3 mr-1" />Generate with AI</TabsTrigger>
                </TabsList>

                <TabsContent value="new-coding" className="space-y-4 mt-3">
                  {codingQuestions.map((q, index) => (
                    <Card key={index}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-medium text-gray-500">Problem {index + 1}</span>
                          <Button variant="ghost" size="sm" onClick={() => removeCodingQuestion(index)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </div>
                        <div className="space-y-2"><Label>Title</Label><Input value={q.title} onChange={e => updateCodingQuestion(index, "title", e.target.value)} /></div>
                        <div className="space-y-2"><Label>Description</Label><Textarea value={q.description} onChange={e => updateCodingQuestion(index, "description", e.target.value)} rows={3} /></div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label>Difficulty</Label>
                            <Select value={q.difficulty} onValueChange={v => updateCodingQuestion(index, "difficulty", v)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="easy">Easy</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="hard">Hard</SelectItem></SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1"><Label>Marks</Label><Input type="number" value={q.marks} onChange={e => updateCodingQuestion(index, "marks", Number(e.target.value))} /></div>
                        </div>
                        <div className="space-y-2"><Label>Starter Code</Label><Textarea value={q.starter_code} onChange={e => updateCodingQuestion(index, "starter_code", e.target.value)} rows={3} className="font-mono text-sm" /></div>
                        <div className="space-y-2">
                          <Label>Test Cases</Label>
                          {q.test_cases.map((tc, ti) => (
                            <div key={ti} className="grid grid-cols-2 gap-2">
                              <Input placeholder="Input" value={tc.input} onChange={e => updateTestCase(index, ti, "input", e.target.value)} />
                              <Input placeholder="Expected Output" value={tc.expected_output} onChange={e => updateTestCase(index, ti, "expected_output", e.target.value)} />
                            </div>
                          ))}
                          <Button variant="outline" size="sm" onClick={() => addTestCase(index)}><Plus className="w-3 h-3 mr-1" />Add Test Case</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Button variant="outline" onClick={addCodingQuestion} className="w-full"><Plus className="w-4 h-4 mr-2" />Add Coding Question</Button>
                </TabsContent>

                <TabsContent value="bank-coding" className="mt-3">
                  {bankLoading ? (
                    <div className="text-center py-8 text-gray-400">Loading question bank...</div>
                  ) : bankCoding.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>No coding questions in bank yet.</p>
                      <p className="text-sm mt-1">Coding problems you create will be saved here for reuse.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-500 mb-3">Select problems to add to this exam:</p>
                      {bankCoding.map((q: any) => {
                        const checked = selectedBankCoding.has(q.id);
                        return (
                          <div key={q.id} onClick={() => toggleBankCoding(q.id)} className="cursor-pointer"
                            style={{ border: `1.5px solid ${checked ? "#7c3aed" : "#e8ecf0"}`, borderRadius: 10, padding: "12px 16px", background: checked ? "#f5f3ff" : "white", transition: "all 0.15s" }}>
                            <div className="flex items-start gap-3">
                              <div style={{ width: 18, height: 18, borderRadius: 4, border: checked ? "none" : "1.5px solid #d1d5db", background: checked ? "#7c3aed" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                                {checked && <span style={{ color: "white", fontSize: 12, fontWeight: 700 }}>✓</span>}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-gray-800">{q.title}</p>
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: diffColor[q.difficulty] + "20", color: diffColor[q.difficulty] }}>{q.difficulty}</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{q.description}</p>
                                <p className="text-xs text-violet-600 mt-1">{q.marks} marks · {q.test_cases?.length || 0} test case{q.test_cases?.length !== 1 ? "s" : ""}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="ai-coding" className="space-y-4 mt-3">
                  <div className="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2 text-left">
                        <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Search & Select Coding Topics</Label>
                        <Input 
                          placeholder="Search topics (e.g., Arrays, Dynamic Programming)..." 
                          value={searchCodingQuery} 
                          onChange={e => setSearchCodingQuery(e.target.value)} 
                          className="h-9 bg-white"
                        />
                        {/* Auto-scroll badges selector */}
                        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border border-slate-200 rounded-lg bg-white">
                          {AVAILABLE_TOPICS.filter(t => t.toLowerCase().includes(searchCodingQuery.toLowerCase())).map(topic => {
                            const isSelected = selectedCodingTopics.some(item => item.topic === topic);
                            return (
                              <button
                                key={topic}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedCodingTopics(selectedCodingTopics.filter(item => item.topic !== topic));
                                  } else {
                                    setSelectedCodingTopics([...selectedCodingTopics, { topic, count: 1 }]);
                                  }
                                }}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-all ${
                                  isSelected 
                                    ? "bg-violet-600 text-white border-violet-600 shadow-sm" 
                                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                }`}
                              >
                                {isSelected ? "✓ " : ""}{topic}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-3 text-left">
                        <div className="flex justify-between items-center">
                          <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Configure Problem Counts</Label>
                          {selectedCodingTopics.length > 0 && (
                            <span className="text-xs font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                              Total: {selectedCodingTopics.reduce((acc, curr) => acc + curr.count, 0)} Challenges
                            </span>
                          )}
                        </div>
                        <div className="space-y-2 max-h-44 overflow-y-auto p-1">
                          {selectedCodingTopics.length === 0 ? (
                            <div className="text-center py-4 bg-white border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs font-semibold">
                              No specific topics selected. General DSA challenges will be generated.
                              <div className="mt-2.5 flex items-center justify-center gap-3">
                                <Label className="text-slate-700">Total Count:</Label>
                                <Input 
                                  type="number" 
                                  min={1} 
                                  max={5} 
                                  value={aiCodingCount} 
                                  onChange={e => setAiCodingCount(Math.min(5, Math.max(1, Number(e.target.value || 1))))} 
                                  className="w-16 h-8 bg-white text-center font-bold"
                                />
                              </div>
                            </div>
                          ) : (
                            selectedCodingTopics.map((item, idx) => (
                              <div key={item.topic} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                                <span className="text-xs font-bold text-slate-800">{item.topic}</span>
                                <div className="flex items-center gap-2">
                                  <Input 
                                    type="number" 
                                    min={1} 
                                    max={5} 
                                    value={item.count} 
                                    onChange={e => {
                                      const updated = [...selectedCodingTopics];
                                      updated[idx].count = Math.min(5, Math.max(1, Number(e.target.value || 1)));
                                      setSelectedCodingTopics(updated);
                                    }} 
                                    className="w-14 h-7 text-center text-xs font-bold"
                                  />
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => setSelectedCodingTopics(selectedCodingTopics.filter(t => t.topic !== item.topic))}
                                    className="h-6 w-6 p-0 hover:bg-slate-100"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-end gap-3 pt-3 border-t border-slate-200">
                      <div className="w-full sm:w-48 space-y-1.5 text-left">
                        <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Difficulty Level</Label>
                        <Select value={aiCodingDifficulty} onValueChange={setAiCodingDifficulty}>
                          <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="easy">Easy</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="hard">Hard</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleGenerateCoding} disabled={aiCodingLoading} className="h-9 bg-violet-600 hover:bg-violet-700 text-white font-bold px-6 shadow-sm">
                        {aiCodingLoading ? "Drafting..." : "Draft Questions"}
                      </Button>
                    </div>
                  </div>

                  {generatedCodingList.length > 0 && (
                    <div className="space-y-3 mt-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Preview Generated Coding Questions ({selectedGeneratedCodingIdxs.size} of {generatedCodingList.length} selected)</span>
                        <Button size="sm" onClick={addSelectedGeneratedCoding} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm">
                          Add Selected to Exam
                        </Button>
                      </div>
                      {generatedCodingList.map((q, idx) => {
                        const isChecked = selectedGeneratedCodingIdxs.has(idx);
                        return (
                          <div key={idx} onClick={() => toggleSelectedGeneratedCoding(idx)} className="cursor-pointer text-left"
                            style={{ border: `1.5px solid ${isChecked ? "#10b981" : "#e8ecf0"}`, borderRadius: 10, padding: "12px 16px", background: isChecked ? "#f0fdf4" : "white", transition: "all 0.15s" }}>
                            <div className="flex items-start gap-3">
                              <div style={{ width: 18, height: 18, borderRadius: 4, border: isChecked ? "none" : "1.5px solid #d1d5db", background: isChecked ? "#10b981" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                                {isChecked && <span style={{ color: "white", fontSize: 12, fontWeight: 700 }}>✓</span>}
                              </div>
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-slate-900">{q.title}</p>
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: diffColor[q.difficulty] + "20", color: diffColor[q.difficulty] }} className="uppercase">{q.difficulty}</span>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed">{q.description}</p>
                                <pre className="overflow-auto rounded-md bg-slate-950 p-2.5 text-xs text-slate-100 font-mono max-h-36">{q.starter_code}</pre>
                                <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mt-1">{q.marks} mark(s) · {q.test_cases?.length || 0} test case(s)</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={handleAddQuestions} disabled={loading}>
              {loading ? "Saving..." : <><Save className="w-4 h-4 mr-2" />Save Questions</>}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-emerald-50 p-3">
                <CheckCircle className="w-12 h-12 text-green-500" />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-905">Exam Created Successfully!</h3>
              <p className="text-sm text-gray-500 mt-1">Your exam is ready. You can now link it to an active job drive or assign it to candidates.</p>
            </div>

            {drives.length > 0 && (
              <div className="border-t border-slate-100 pt-5 text-left space-y-3">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Assign to an Active Job Drive</Label>
                <div className="flex gap-2">
                  <Select value={selectedDriveId} onValueChange={setSelectedDriveId}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Select active drive..." /></SelectTrigger>
                    <SelectContent>
                      {drives.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.title} ({d.company_name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={handleAssignToDrive} 
                    disabled={!selectedDriveId || assigningDrive}
                    className="bg-violet-600 hover:bg-violet-700 text-white font-bold h-9"
                  >
                    {assigningDrive ? "Assigning..." : "Assign"}
                  </Button>
                </div>
                <p className="text-[10px] text-slate-400">Assigning the exam will automatically invite all eligible candidates matching the drive's criteria.</p>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
              <Button variant="outline" onClick={() => navigate("/recruiter/dashboard")} className="w-full sm:w-auto h-9">Go to Dashboard</Button>
              <Button onClick={() => navigate("/recruiter/results")} className="w-full sm:w-auto h-9 bg-violet-600 hover:bg-violet-700 text-white">View Results</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import CodeEditor from "./CodeEditor";
import ProblemStatement from "./ProblemStatement";
import TestRunner from "./TestRunner";

export default function CodingSection() {
  const { questionId } = useParams();
  const [problem, setProblem] = useState<any>();
  const [language, setLanguage] = useState("python3");
  const [code, setCode] = useState("# Write your solution here\n");
  const [result, setResult] = useState<any>();
  useEffect(() => { api.get(`/coding/question/${questionId}`).then((res) => setProblem(res.data)); }, [questionId]);
  return (
    <main className="grid h-screen grid-cols-2 gap-4 p-4">
      <ProblemStatement problem={problem} />
      <div className="grid grid-rows-[1fr_auto] gap-4">
        <CodeEditor language={language} code={code} onLanguage={setLanguage} onCode={setCode} />
        <TestRunner attemptId={sessionStorage.getItem("attemptId")} questionId={questionId} language={language} code={code} result={result} setResult={setResult} />
      </div>
    </main>
  );
}


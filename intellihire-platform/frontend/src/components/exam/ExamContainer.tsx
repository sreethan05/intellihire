import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import MCQQuestion from "./MCQQuestion";
import ExamSummary from "./ExamSummary";
import ExamWarmup from "./ExamWarmup";
import ProctoringOverlay from "@/components/proctoring/ProctoringOverlay";
import { useProctoring } from "@/hooks/useProctoring";

export default function ExamContainer() {
  const { examId } = useParams();
  const [attempt, setAttempt] = useState<any>();
  const [questions, setQuestions] = useState<any[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState<any>();
  const proctoring = useProctoring(attempt?.id, submit);

  async function start() {
    const res = await api.get(`/exam/${examId}/start`);
    setAttempt(res.data.attempt);
    setQuestions(res.data.questions);
    setStarted(true);
    proctoring.start();
  }
  async function save(questionId: string, selected: number) {
    setAnswers((old) => ({ ...old, [questionId]: selected }));
    await api.post(`/exam/attempt/${attempt.id}/answer`, { question_id: questionId, selected_option: selected, time_taken_seconds: 0 });
  }
  async function submit() {
    if (!attempt?.id) return;
    const res = await api.post(`/exam/attempt/${attempt.id}/submit`);
    setResult(res.data);
  }

  useEffect(() => {
    if (!attempt?.id) return;
    const id = window.setInterval(() => {
      const q = questions[index];
      if (q && answers[q.id] !== undefined) save(q.id, answers[q.id]);
    }, 30000);
    return () => window.clearInterval(id);
  }, [attempt?.id, answers, index, questions]);

  const progress = useMemo(() => questions.length ? (Object.keys(answers).length / questions.length) * 100 : 0, [answers, questions]);
  if (result) return <ExamSummary result={result} />;
  if (!started) return <ExamWarmup onStart={start} />;
  const current = questions[index];
  return (
    <main className="grid min-h-screen grid-cols-[220px_1fr] gap-6 p-6">
      <aside className="space-y-4">
        <Progress value={progress} />
        <div className="grid grid-cols-5 gap-2">{questions.map((q, i) => <Button key={q.id} variant={i === index ? "default" : answers[q.id] !== undefined ? "outline" : "ghost"} onClick={() => setIndex(i)}>{i + 1}</Button>)}</div>
        <Button className="w-full" onClick={submit}>Submit</Button>
      </aside>
      {current && <MCQQuestion question={current} selected={answers[current.id]} onSelect={(option) => save(current.id, option)} onClear={() => setAnswers(({ [current.id]: _, ...rest }) => rest)} onFlag={() => undefined} />}
      <ProctoringOverlay {...proctoring} />
    </main>
  );
}


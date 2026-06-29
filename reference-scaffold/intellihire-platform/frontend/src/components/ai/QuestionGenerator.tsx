import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export default function QuestionGenerator() {
  const [topic, setTopic] = useState("");
  const [questions, setQuestions] = useState<any[]>([]);
  async function generate() {
    const res = await api.post("/ai/generate-mcqs", { topic, difficulty: "medium", count: 10 });
    setQuestions(res.data.questions ?? []);
  }
  return (
    <div className="space-y-4">
      <div className="flex gap-2"><Input placeholder="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} /><Button onClick={generate}>Generate</Button></div>
      {questions.map((q, i) => <Card key={i}><CardContent><p className="font-medium">{q.question_text ?? q.question}</p><Button variant="outline" className="mt-2">Add to Exam</Button></CardContent></Card>)}
    </div>
  );
}


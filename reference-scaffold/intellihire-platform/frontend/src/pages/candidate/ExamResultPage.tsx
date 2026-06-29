import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function ExamResultPage() {
  const { attemptId } = useParams();
  const [result, setResult] = useState<any>();
  useEffect(() => { api.get(`/candidate/results/${attemptId}`).then((res) => setResult(res.data)); }, [attemptId]);
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <Card><CardHeader><CardTitle>Exam Result</CardTitle></CardHeader><CardContent><p className="text-6xl font-bold">{result?.total_score ?? 0}</p><p>Percentile {result?.percentile ?? "pending"}</p></CardContent></Card>
      <Card><CardHeader><CardTitle>Topic Performance</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={260}><BarChart data={[{ topic: "Aptitude", score: 72 }, { topic: "Coding", score: 81 }]}><XAxis dataKey="topic" /><YAxis /><Tooltip /><Bar dataKey="score" fill="#2563eb" /></BarChart></ResponsiveContainer></CardContent></Card>
      <Card><CardContent><p className="text-sm text-muted-foreground">AI improvement report will appear after analysis.</p></CardContent></Card>
    </main>
  );
}


import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function TestRunner({ attemptId, questionId, language, code, result, setResult }: any) {
  async function submit() {
    const res = await api.post("/coding/submit", { attempt_id: attemptId, question_id: questionId, language, source_code: code });
    setResult(res.data);
  }
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex gap-2"><Button variant="outline">Run Sample Tests</Button><Button onClick={submit}>Submit Solution</Button></div>
        {result?.test_results?.map((test: any, i: number) => <div key={i} className="rounded-md border p-2 text-sm">{test.passed ? "Passed" : "Failed"} - {test.status?.description}</div>)}
      </CardContent>
    </Card>
  );
}


import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ExamSummary({ result }: { result: any }) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Card>
        <CardHeader><CardTitle>Exam Submitted</CardTitle></CardHeader>
        <CardContent>
          <p className="text-4xl font-bold">{result?.total_score ?? 0}</p>
          <p className="text-muted-foreground">Results will be announced after recruiter review.</p>
        </CardContent>
      </Card>
    </main>
  );
}


import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function InterviewFeedback({ feedback }: { feedback: any }) {
  const metrics = [
    ["Technical", feedback?.technical_score],
    ["Communication", feedback?.communication_score],
    ["Problem solving", feedback?.problem_solving_score],
    ["Confidence", feedback?.confidence_score]
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Interview Feedback</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-5xl font-bold">{feedback?.overall_score ?? 0}/10</p>
          <Badge className="capitalize">{String(feedback?.recommendation ?? "pending").replace("_", " ")}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{feedback?.summary ?? "Feedback will appear after AI evaluation."}</p>
        <div className="grid gap-4 md:grid-cols-2">
          {metrics.map(([label, value]) => (
            <div key={label} className="rounded-md border p-3">
              <div className="mb-2 flex justify-between text-sm"><span>{label}</span><b>{value ?? 0}/10</b></div>
              <Progress value={Number(value ?? 0) * 10} />
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><h3 className="font-semibold">Strengths</h3><ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{(feedback?.strengths ?? []).map((item: string) => <li key={item}>{item}</li>)}</ul></div>
          <div><h3 className="font-semibold">Improve</h3><ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{(feedback?.areas_to_improve ?? []).map((item: string) => <li key={item}>{item}</li>)}</ul></div>
        </div>
        <div className="rounded-md bg-muted p-4 text-sm">{feedback?.recommendation_message}</div>
      </CardContent>
    </Card>
  );
}

import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProblemStatement({ problem }: { problem: any }) {
  return (
    <Card className="h-full overflow-auto">
      <CardHeader><CardTitle>{problem?.title}</CardTitle><div className="flex gap-2"><Badge>{problem?.difficulty}</Badge>{problem?.topic_tags?.map((tag: string) => <Badge key={tag}>{tag}</Badge>)}</div></CardHeader>
      <CardContent className="space-y-4">
        <div className="prose dark:prose-invert">
          <ReactMarkdown>{problem?.problem_statement}</ReactMarkdown>
        </div>
        <section><h3 className="font-semibold">Input Format</h3><p>{problem?.input_format}</p></section>
        <section><h3 className="font-semibold">Output Format</h3><p>{problem?.output_format}</p></section>
        <section><h3 className="font-semibold">Constraints</h3><p>{problem?.constraints}</p></section>
      </CardContent>
    </Card>
  );
}

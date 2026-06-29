import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function InterviewStart({
  template,
  candidateName,
  candidateEmail,
  onCandidateName,
  onCandidateEmail,
  onBegin
}: {
  template?: any;
  candidateName: string;
  candidateEmail: string;
  onCandidateName: (value: string) => void;
  onCandidateEmail: (value: string) => void;
  onBegin: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{template?.job_title ?? "AI Interview"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{template?.duration_minutes ?? 15} minute async interview. Answer clearly; two follow-up questions may be generated from your responses.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Full name" value={candidateName} onChange={(event) => onCandidateName(event.target.value)} />
          <Input placeholder="Email" value={candidateEmail} onChange={(event) => onCandidateEmail(event.target.value)} />
        </div>
        <Button disabled={!candidateName || !candidateEmail} onClick={onBegin}>Begin Interview</Button>
      </CardContent>
    </Card>
  );
}

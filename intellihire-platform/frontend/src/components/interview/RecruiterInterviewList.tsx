import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import InterviewFeedback from "./InterviewFeedback";
import { api } from "@/lib/api";

export default function RecruiterInterviewList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedFeedback, setSelectedFeedback] = useState<any>();

  useEffect(() => {
    api.get("/interview/templates").then((res) => setTemplates(res.data.data ?? []));
  }, [refreshKey]);

  return (
    <Card>
      <CardHeader><CardTitle>Interview Links & Reports</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {templates.map((template) => {
          const link = `${window.location.origin}/interview/${template.id}`;
          return (
            <div key={template.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{template.job_title}</h3>
                  <p className="text-sm text-muted-foreground">{template.duration_minutes} min - {template.interviews?.length ?? 0} candidates</p>
                </div>
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Copied"))}>Copy link</Button>
              </div>
              <div className="mt-3 grid gap-2">
                {(template.interviews ?? []).map((session: any) => (
                  <div key={session.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted p-3 text-sm">
                    <span>{session.candidate_name ?? session.candidate_email}</span>
                    <div className="flex items-center gap-2"><Badge>{session.status}</Badge>{session.feedback && <Button variant="ghost" onClick={() => setSelectedFeedback(session.feedback)}>View report</Button>}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {selectedFeedback && <InterviewFeedback feedback={selectedFeedback} />}
      </CardContent>
    </Card>
  );
}

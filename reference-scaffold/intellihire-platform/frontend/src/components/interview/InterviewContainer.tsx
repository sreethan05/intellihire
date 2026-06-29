import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import InterviewFeedback from "./InterviewFeedback";
import InterviewStart from "./InterviewStart";

export default function InterviewContainer() {
  const { templateId } = useParams();
  const [template, setTemplate] = useState<any>();
  const [interview, setInterview] = useState<any>();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<any>();
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/interview/templates/${templateId}`).then((res) => setTemplate(res.data));
  }, [templateId]);

  async function begin() {
    const res = await api.post(`/interview/templates/${templateId}/start`, { candidate_name: candidateName, candidate_email: candidateEmail });
    setInterview(res.data.interview);
    setTemplate(res.data.template);
    setQuestion(res.data.question?.question ?? res.data.question);
  }
  async function next() {
    setSubmitting(true);
    try {
      const res = await api.post(`/interview/${interview.id}/answer`, { index, answer });
      if (res.data.done) {
        const completed = await api.post(`/interview/${interview.id}/complete`);
        setFeedback(completed.data.feedback);
        return;
      }
      setQuestion(res.data.next_question?.question ?? res.data.next_question);
      setIndex(res.data.index);
      setAnswer("");
    } finally {
      setSubmitting(false);
    }
  }

  const progress = useMemo(() => {
    const total = interview?.questions?.length ?? template?.questions?.length ?? 1;
    return Math.round((index / total) * 100);
  }, [index, interview?.questions?.length, template?.questions?.length]);

  if (feedback) return <main className="mx-auto max-w-3xl p-6"><InterviewFeedback feedback={feedback} /></main>;
  if (!interview) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <InterviewStart template={template} candidateName={candidateName} candidateEmail={candidateEmail} onCandidateName={setCandidateName} onCandidateEmail={setCandidateEmail} onBegin={begin} />
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div><p className="text-sm text-muted-foreground">Question {index + 1}</p><h1 className="text-2xl font-semibold">{template?.job_title}</h1></div>
        <Badge>{template?.duration_minutes ?? 15} min</Badge>
      </div>
      <Progress value={progress} />
      <Card>
        <CardContent className="space-y-4">
          <h2 className="text-xl font-semibold">{question}</h2>
          <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer clearly with examples, tradeoffs, and outcomes." />
          <Button disabled={!answer.trim() || submitting} onClick={next}>{submitting ? "Saving..." : "Next"}</Button>
        </CardContent>
      </Card>
    </main>
  );
}

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

const questionTypes = ["technical", "behavioral", "problem_solving", "communication"];

export default function InterviewBuilder({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    job_title: "",
    job_description: "",
    duration_minutes: 15,
    question_types: ["technical", "behavioral"]
  });
  const [created, setCreated] = useState<any>();
  const [loading, setLoading] = useState(false);

  function toggleType(type: string) {
    setForm((old) => ({
      ...old,
      question_types: old.question_types.includes(type)
        ? old.question_types.filter((item) => item !== type)
        : [...old.question_types, type]
    }));
  }

  async function createTemplate() {
    if (!form.job_title || !form.job_description || !form.question_types.length) {
      toast.error("Add job title, description, and at least one question type.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/interview/templates", form);
      setCreated(res.data);
      onCreated();
      toast.success("Interview link created");
    } finally {
      setLoading(false);
    }
  }

  const link = created ? `${window.location.origin}/interview/${created.id}` : "";

  return (
    <Card>
      <CardHeader><CardTitle>Create AI Interview</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <Input placeholder="Job title" value={form.job_title} onChange={(e) => setForm((old) => ({ ...old, job_title: e.target.value }))} />
          <Input type="number" min={5} max={60} value={form.duration_minutes} onChange={(e) => setForm((old) => ({ ...old, duration_minutes: Number(e.target.value) }))} />
        </div>
        <Textarea placeholder="Paste job description, responsibilities, required skills, and seniority." value={form.job_description} onChange={(e) => setForm((old) => ({ ...old, job_description: e.target.value }))} />
        <div className="flex flex-wrap gap-2">
          {questionTypes.map((type) => (
            <label key={type} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Checkbox checked={form.question_types.includes(type)} onChange={() => toggleType(type)} />
              {type.replace("_", " ")}
            </label>
          ))}
        </div>
        <Button disabled={loading} onClick={createTemplate}>{loading ? "Generating..." : "Generate questions and link"}</Button>
        {created && (
          <div className="rounded-md border bg-muted p-3">
            <div className="mb-2 flex flex-wrap gap-2">{created.questions?.map((q: any) => <Badge key={q.id}>{q.type}</Badge>)}</div>
            <div className="flex gap-2"><Input readOnly value={link} /><Button variant="outline" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Copied"))}>Copy</Button></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


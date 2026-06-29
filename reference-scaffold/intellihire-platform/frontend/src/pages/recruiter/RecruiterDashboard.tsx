import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import QuestionGenerator from "@/components/ai/QuestionGenerator";
import InterviewBuilder from "@/components/interview/InterviewBuilder";
import RecruiterInterviewList from "@/components/interview/RecruiterInterviewList";

export default function RecruiterDashboard() {
  const [drives, setDrives] = useState<any[]>([]);
  const [interviewRefresh, setInterviewRefresh] = useState(0);
  const [form, setForm] = useState({ job_title: "", company_name: "", target_college_id: "", min_cgpa: 6, allowed_branches: "CSE,ECE", required_skills: "React,Node", reattempt_policy: "no_reattempt" });
  const load = () => api.get("/recruiter/drives").then((res) => setDrives(res.data));
  useEffect(() => { load(); }, []);
  async function createDrive() {
    await api.post("/recruiter/drives", { ...form, allowed_branches: form.allowed_branches.split(","), required_skills: form.required_skills.split(","), exam_config: { title: form.job_title, duration_minutes: 90, total_marks: 100, sections: [] } });
    load();
  }
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Recruiter Dashboard</h1>
      <Card><CardHeader><CardTitle>Create Drive</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-3">
        {Object.entries(form).map(([key, value]) => <Input key={key} placeholder={key} value={value} onChange={(e) => setForm((old) => ({ ...old, [key]: e.target.value }))} />)}
        <Button onClick={createDrive}>Create draft</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Drives</CardTitle></CardHeader><CardContent className="grid gap-3">{drives.map((d) => <div key={d.id} className="flex items-center justify-between rounded-md border p-3"><span>{d.company_name} - {d.job_title}</span><Badge>{d.status}</Badge></div>)}</CardContent></Card>
      <InterviewBuilder onCreated={() => setInterviewRefresh((value) => value + 1)} />
      <RecruiterInterviewList refreshKey={interviewRefresh} />
      <QuestionGenerator />
    </main>
  );
}

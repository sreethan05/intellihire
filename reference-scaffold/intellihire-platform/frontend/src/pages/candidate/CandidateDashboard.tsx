import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import AIFeedbackPanel from "@/components/ai/AIFeedbackPanel";
import { api } from "@/lib/api";

export default function CandidateDashboard() {
  const [data, setData] = useState<any>({});
  useEffect(() => { api.get("/candidate/dashboard").then((res) => setData(res.data)); }, []);
  const profileComplete = data.profile?.profile_complete ? 100 : 60;
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Candidate Dashboard</h1>
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent><p>Profile</p><Progress value={profileComplete} /></CardContent></Card>
        <Card><CardContent><p>Documents</p><Badge>{data.profile?.document_verified ? "verified" : "pending"}</Badge></CardContent></Card>
        <Card><CardContent><p>Drives</p><p className="text-3xl font-bold">{data.drives?.length ?? 0}</p></CardContent></Card>
        <Card><CardContent><p>Placed</p><Badge>{data.drives?.some((d: any) => d.status === "placed") ? "placed" : "not placed"}</Badge></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Active Drives</CardTitle></CardHeader><CardContent className="grid gap-3">{data.drives?.map((row: any) => <div key={row.id} className="flex items-center justify-between rounded-md border p-3"><span>{row.drives?.company_name} - {row.drives?.job_title}</span><div className="flex gap-2"><Badge>{row.status}</Badge><Button asChild><Link to={`/exam/${row.drives?.exams?.[0]?.id}`}>Take Exam</Link></Button></div></div>)}</CardContent></Card>
      <AIFeedbackPanel sections={{ "Performance Report": "Complete an exam to generate personalized improvement insights.", "Skill Match": "Skill matching appears after drive applications.", Debrief: "Recruiter debrief will appear after evaluation." }} />
    </main>
  );
}


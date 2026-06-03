import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";

export default function CandidateOnboarding() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ phone: "", skills: "", domain_preference: "" });
  const [resume, setResume] = useState<File | null>(null);
  const [marksheet, setMarksheet] = useState<File | null>(null);
  const navigate = useNavigate();
  async function submit() {
    const body = new FormData();
    body.append("phone", form.phone);
    body.append("skills", JSON.stringify(form.skills.split(",").map((s) => s.trim()).filter(Boolean)));
    body.append("domain_preference", form.domain_preference);
    if (resume) body.append("resume", resume);
    if (marksheet) body.append("marksheet", marksheet);
    await api.put("/candidate/profile", body);
    navigate("/candidate");
  }
  return (
    <main className="mx-auto max-w-2xl p-6">
      <Progress value={(step / 5) * 100} />
      <Card className="mt-6">
        <CardHeader><CardTitle>Complete Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {step === 1 && <p>Welcome to IntelliHire. Complete your profile to unlock exams.</p>}
          {step === 2 && <><Input placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /><Input placeholder="Skills comma separated" value={form.skills} onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))} /><Input placeholder="Domain preference" value={form.domain_preference} onChange={(e) => setForm((f) => ({ ...f, domain_preference: e.target.value }))} /></>}
          {step === 3 && <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setResume(e.target.files?.[0] ?? null)} />}
          {step === 4 && <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setMarksheet(e.target.files?.[0] ?? null)} />}
          {step === 5 && <p>Review your details and confirm submission.</p>}
          <div className="flex justify-between"><Button variant="outline" disabled={step === 1} onClick={() => setStep(step - 1)}>Back</Button>{step < 5 ? <Button onClick={() => setStep(step + 1)}>Next</Button> : <Button onClick={submit}>Submit</Button>}</div>
        </CardContent>
      </Card>
    </main>
  );
}


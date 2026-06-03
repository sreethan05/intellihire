import { useEffect, useState } from "react";
import type { ComponentType, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { FileCheck, Lock, Phone, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { candidateApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function CandidateOnboarding() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    password: "",
    phone: "",
    skills: "",
    domain_preference: "",
    marksheet_url: "",
    resume_url: "",
  });

  useEffect(() => {
    candidateApi.getProfile().then(({ data }) => setProfile(data.profile));
  }, []);

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await candidateApi.completeOnboarding({
        password: form.password,
        phone: form.phone,
        skills: form.skills.split(",").map((item) => item.trim()).filter(Boolean),
        domain_preference: form.domain_preference,
        marksheet_url: form.marksheet_url,
        resume_url: form.resume_url,
      });
      if (user) {
        const updatedUser = { ...user, profile_complete: true, must_change_password: false };
        login(localStorage.getItem("token") || "", updatedUser);
      }
      toast.success("Profile completed. Your assigned exams are now available.");
      navigate("/candidate/overview");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Could not complete onboarding");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Complete Your Profile</h1>
        <p className="mt-1 text-sm text-slate-500">Set a new password and add the details required before exams become visible.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-blue-600" />
            Student Record
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <Info label="Roll Number" value={profile?.roll_number || user?.roll_number || "-"} />
          <Info label="Branch" value={profile?.branch || "-"} />
          <Info label="CGPA" value={profile?.cgpa ?? "-"} />
          <Info label="Graduation Year" value={profile?.graduation_year || "-"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCheck className="h-4 w-4 text-blue-600" />
            Onboarding Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="New Password" icon={Lock} type="password" value={form.password} onChange={(value) => update("password", value)} />
              <Field label="Phone" icon={Phone} value={form.phone} onChange={(value) => update("phone", value)} />
              <Field label="Domain Preference" value={form.domain_preference} onChange={(value) => update("domain_preference", value)} placeholder="Frontend, Data, AI, Backend" />
              <Field label="Marksheet URL" value={form.marksheet_url} onChange={(value) => update("marksheet_url", value)} required={false} />
              <div className="md:col-span-2">
                <Field label="Resume URL" value={form.resume_url} onChange={(value) => update("resume_url", value)} required={false} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Skills</Label>
                <Textarea required value={form.skills} onChange={(event) => update("skills", event.target.value)} placeholder="Java, React, SQL, DSA" rows={3} />
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-fit">{loading ? "Saving..." : "Complete Onboarding"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 font-bold text-slate-900">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  icon: Icon,
  type = "text",
  placeholder,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon?: ComponentType<{ className?: string }>;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
        <Input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={Icon ? "pl-9" : ""} />
      </div>
    </div>
  );
}

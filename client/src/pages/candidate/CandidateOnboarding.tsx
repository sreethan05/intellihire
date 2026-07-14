import { useEffect, useState, useRef } from "react";
import type { ComponentType, FormEvent } from "react";
import { useNavigate } from "react-router";
import { 
  FileCheck, Lock, Phone, Sparkles, UploadCloud, 
  FileText, Trash2, Loader2 
} from "lucide-react";
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
  const [uploadingResume, setUploadingResume] = useState(false);
  
  const [form, setForm] = useState({
    password: "",
    phone: "",
    skills: "",
    domain_preference: "",
    marksheet_url: "",
    resume_url: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    candidateApi.getProfile().then(({ data }) => {
      const p = data.profile;
      setProfile(p);
      if (p) {
        setForm((prev) => ({
          ...prev,
          phone: p.phone || "",
          domain_preference: p.domain_preference || "",
          marksheet_url: p.marksheet_url || "",
          resume_url: p.resume_url || "",
          skills: Array.isArray(p.skills) ? p.skills.join(", ") : "",
        }));
      }
    });
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
        login(null, updatedUser);
      }
      toast.success("Profile completed. Your assigned exams are now available.");
      navigate("/candidate/overview");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Could not complete onboarding");
    } finally {
      setLoading(false);
    }
  };

  // Handle Drag & Drop File Upload
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (uploadingResume) return;
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndUpload(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (uploadingResume) return;
    const file = e.target.files?.[0];
    if (file) validateAndUpload(file);
  };

  const validateAndUpload = (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Only PDF format resumes are currently supported.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Resume file size cannot exceed 10MB.");
      return;
    }
    
    setUploadingResume(true);
    candidateApi.uploadResume(file)
      .then(({ data }) => {
        setProfile(data.profile);
        const p = data.profile;
        if (p) {
          setForm((prev) => ({
            ...prev,
            resume_url: p.resume_url || "",
            skills: Array.isArray(p.skills) ? p.skills.join(", ") : prev.skills,
          }));
        }
        toast.success("Resume uploaded and parsed successfully by AI!");
      })
      .catch((err) => {
        console.error("Resume upload error", err);
        toast.error(err.response?.data?.error || "Failed to process and analyze resume");
      })
      .finally(() => setUploadingResume(false));
  };

  const handleDeleteResume = () => {
    if (window.confirm("Are you sure you want to remove your uploaded resume?")) {
      candidateApi.deleteResume()
        .then(({ data }) => {
          setProfile(data.profile);
          setForm((prev) => ({
            ...prev,
            resume_url: "",
          }));
          toast.success("Resume removed successfully.");
        })
        .catch((err) => {
          console.error("Failed to delete resume", err);
          toast.error("Failed to remove resume");
        });
    }
  };

  // Get filename from url
  const getResumeFileName = (url: string) => {
    if (!url) return "";
    const parts = url.split("/");
    const filename = parts[parts.length - 1];
    // Remove the timestamp suffix we added in backend (e.g. filename_123456789.pdf)
    return filename.replace(/_[0-9]+(?=\.[^.]+$)/, "");
  };

  const atsAnalysis = profile?.resume_ats_analysis || {};
  const atsScore = atsAnalysis.atsScore || 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Complete Your Profile</h1>
        <p className="mt-1 text-sm text-slate-500 font-medium">Set a new password and add the details required before exams become visible.</p>
      </div>

      <Card className="rounded-xl border border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-extrabold text-slate-800">
            <Sparkles className="h-4.5 w-4.5 text-violet-600" />
            Student Record
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-xs md:grid-cols-4">
          <Info label="Roll Number" value={profile?.roll_number || user?.roll_number || "-"} />
          <Info label="Branch" value={profile?.branch || "-"} />
          <Info label="CGPA" value={profile?.cgpa ?? "-"} />
          <Info label="Graduation Year" value={profile?.graduation_year || "-"} />
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-extrabold text-slate-800">
            <FileCheck className="h-4.5 w-4.5 text-violet-600" />
            Onboarding Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-6">
            
            {/* Input Details */}
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="New Password" icon={Lock} type="password" value={form.password} onChange={(value) => update("password", value)} />
              <Field label="Phone" icon={Phone} value={form.phone} onChange={(value) => update("phone", value)} />
              <Field label="Domain Preference" value={form.domain_preference} onChange={(value) => update("domain_preference", value)} placeholder="Frontend, Data, AI, Backend" />
              <Field label="Marksheet URL" value={form.marksheet_url} onChange={(value) => update("marksheet_url", value)} required={false} placeholder="E.g., Drive link or file URL" />
            </div>

            {/* Resume Upload Pipeline Area */}
            <div className="space-y-2 text-xs">
              <Label className="text-xs font-bold text-slate-700">Resume Upload &amp; AI Screening</Label>
              
              {uploadingResume ? (
                <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/20 py-10 flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="h-8 w-8 text-violet-600 animate-spin" />
                  <div className="text-center">
                    <div className="font-extrabold text-violet-700">Analyzing Resume...</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">AI is extracting skills and calculating your ATS Score.</div>
                  </div>
                </div>
              ) : form.resume_url ? (
                /* Uploaded resume details and ATS scoreboard card */
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-rose-50 border border-rose-100 rounded-lg flex items-center justify-center text-rose-600">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-extrabold text-slate-800 text-xs truncate max-w-xs">{getResumeFileName(form.resume_url)}</div>
                        <a 
                          href={form.resume_url ? (import.meta.env.VITE_API_URL || "").replace(/\/api$/, "") + form.resume_url : ""} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-[10px] text-violet-600 font-bold hover:underline mt-0.5 inline-block"
                        >
                          View Uploaded PDF
                        </a>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={handleDeleteResume}
                      className="inline-flex h-8 items-center justify-center rounded-lg bg-rose-50 border border-rose-100 px-3 text-[10px] font-bold text-rose-600 hover:bg-rose-100 transition self-start sm:self-center cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </button>
                  </div>

                  {/* ATS Score card */}
                  {atsScore > 0 && (
                    <div className="grid gap-4 sm:grid-cols-12 border-t border-slate-100 pt-4">
                      {/* Left: Score Badge */}
                      <div className="sm:col-span-4 flex flex-col items-center justify-center bg-white border border-slate-100 rounded-xl p-4 text-center">
                        <div className={`text-3xl font-black ${
                          atsScore >= 75 ? "text-emerald-600" : atsScore >= 50 ? "text-amber-600" : "text-rose-600"
                        }`}>{atsScore}%</div>
                        <div className="text-[9px] font-black uppercase text-slate-400 mt-1 select-none leading-none">ATS Match Score</div>
                        
                        {/* Match Indicator Tag */}
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase mt-2.5 ${
                          atsScore >= 85 
                            ? "bg-emerald-50 border border-emerald-100 text-emerald-700" 
                            : atsScore >= 70 
                              ? "bg-blue-50 border border-blue-100 text-blue-700" 
                              : atsScore >= 50
                                ? "bg-amber-50 border border-amber-100 text-amber-700"
                                : "bg-rose-50 border border-rose-100 text-rose-700"
                        }`}>
                          {atsAnalysis.tier || (atsScore >= 85 ? "Excellent" : atsScore >= 70 ? "Good" : atsScore >= 50 ? "Fair" : "Poor")}
                        </span>
                      </div>

                      {/* Right: AI Analysis Gaps & Suggested Roles */}
                      <div className="sm:col-span-8 space-y-3 font-semibold text-slate-600">
                        <div>
                          <div className="text-[10px] font-black uppercase text-slate-400 select-none">AI Summary Feedback</div>
                          <p className="text-slate-700 mt-1 text-[11px] leading-relaxed font-semibold">{atsAnalysis.summary || "Successful parse."}</p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-lg border border-violet-100 bg-violet-50/20 p-2.5">
                            <div className="text-[9px] font-black text-violet-700 uppercase">Suggested Roles</div>
                            <ul className="list-disc pl-3 text-[10px] text-slate-600 mt-1 space-y-0.5 font-normal">
                              {atsAnalysis.suggestedRoles?.map((r: string) => <li key={r}>{r}</li>) || <li>General Engineer</li>}
                            </ul>
                          </div>

                          <div className="rounded-lg border border-rose-100 bg-rose-50/20 p-2.5">
                            <div className="text-[9px] font-black text-rose-700 uppercase">Gaps to Improve</div>
                            <ul className="list-disc pl-3 text-[10px] text-slate-600 mt-1 space-y-0.5 font-normal">
                              {atsAnalysis.gaps?.map((g: string) => <li key={g}>{g}</li>) || <li>No major gaps logged.</li>}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ATS Parameters Audit Breakdown */}
                  {atsScore > 0 && atsAnalysis.breakdown && (
                    <div className="border-t border-slate-100 pt-4 mt-4 space-y-3">
                      <div className="text-[10px] font-black uppercase text-slate-400 select-none tracking-wider">ATS Score Breakdown Parameters</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {Object.entries(atsAnalysis.breakdown).map(([key, data]: [string, any]) => {
                          const labelMap: Record<string, string> = {
                            contactInfo: "Contact Detail Completeness",
                            sectionStructure: "Heading Sections Structure",
                            contentDensity: "Word Density & Volume",
                            actionVerbs: "Active Verbs Density",
                            impactMetrics: "Measurable Impact Stats",
                            skillsDepth: "Technical Skill Breadth",
                            educationDepth: "Education Details Depth",
                            projectQuality: "Project Tech Application",
                            certifications: "Certificates & Achievements",
                            buzzwordScore: "Presentation Style Score",
                            timelineScore: "Chronological Dates Timeline",
                            readabilityScore: "Language & Readability Flow",
                            domainKeywords: "Domain-Specific Keywords",
                            formattingConsistency: "Bullet List Consistency",
                            linkCompleteness: "Hyperlink Completeness",
                            emailProfessionalism: "Email Handle Decency",
                            firstPersonPronouns: "Third-Person Grammar Check",
                            githubQuality: "GitHub Repo Presence",
                            linkedinQuality: "LinkedIn Handle Presence",
                            techBalance: "Tech Skill Balance check",
                            toolsOS: "Workspace Tools & OS exposure",
                            databaseSpecificity: "Database Query Specificity",
                            cloudDevOps: "Cloud Deployment/DevOps",
                            apiComplexity: "Web API Implementations",
                            dsaExposure: "Algorithm Complexity Exposure"
                          };
                          return (
                            <div key={key} className="bg-white border border-slate-200/60 p-3 rounded-xl space-y-1.5 shadow-sm text-xs">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="font-extrabold text-slate-700">{labelMap[key] || key}</span>
                                <span className={`font-black ${
                                  data.score >= 80 ? "text-emerald-600" : data.score >= 50 ? "text-amber-600" : "text-rose-600"
                                }`}>{data.score}%</span>
                              </div>
                              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${
                                    data.score >= 80 ? "bg-emerald-500" : data.score >= 50 ? "bg-amber-500" : "bg-rose-500"
                                  }`} 
                                  style={{ width: `${data.score}%` }}
                                ></div>
                              </div>
                              <p className="text-[9px] text-slate-400 font-semibold leading-normal mt-1">{data.feedback}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Uploader Dropzone */
                <div 
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-dashed border-slate-200 hover:border-violet-400 bg-slate-50/30 hover:bg-violet-50/10 py-8 flex flex-col items-center justify-center space-y-2 cursor-pointer transition-all duration-200"
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    accept=".pdf" 
                    className="hidden" 
                  />
                  <div className="h-10 w-10 bg-violet-50 border border-violet-100 rounded-lg flex items-center justify-center text-violet-600">
                    <UploadCloud className="h-5 w-5" />
                  </div>
                  <div className="text-center">
                    <div className="font-extrabold text-slate-800">Upload PDF Resume</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Drag and drop file here, or click to browse (PDF only, Max 10MB)</div>
                  </div>
                </div>
              )}
            </div>

            {/* Skills Textarea */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700">AI-Extracted Skills</Label>
              <Textarea 
                required 
                value={form.skills} 
                onChange={(event) => update("skills", event.target.value)} 
                placeholder="Auto-populated upon resume upload (e.g. Java, React, SQL)" 
                rows={3} 
                className="font-semibold text-xs leading-relaxed"
              />
              <p className="text-[10px] text-slate-400 font-semibold leading-normal">
                💡 Uploading a resume will extract and format your skills automatically. You can edit them here as comma-separated values.
              </p>
            </div>

            <Button type="submit" disabled={loading} className="w-fit bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-5 py-2.5 rounded-lg shadow-sm">{loading ? "Saving..." : "Complete Onboarding"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 flex flex-col justify-between">
      <div className="text-[10px] font-black uppercase text-slate-400 select-none leading-none">{label}</div>
      <div className="mt-2 font-black text-slate-900 leading-none">{value}</div>
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
    <div className="space-y-1.5 text-xs">
      <Label className="font-bold text-slate-700">{label}</Label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
        <Input 
          required={required} 
          type={type} 
          value={value} 
          onChange={(event) => onChange(event.target.value)} 
          placeholder={placeholder} 
          className={`h-9 font-semibold text-xs border-slate-200 outline-none focus:border-violet-500 rounded-lg shadow-sm ${Icon ? "pl-9" : ""}`} 
        />
      </div>
    </div>
  );
}

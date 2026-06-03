import { useEffect, useState } from "react";
import type { ComponentType, FormEvent } from "react";
import {
  Briefcase,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  IndianRupee,
  ListFilter,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { examApi, recruiterApi } from "@/lib/api";
import { useCollege } from "@/context/CollegeContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { College, Exam, JobDrive } from "@/types";

export default function CreateDrive() {
  const { selectedCollegeId } = useCollege();
  const [colleges, setColleges] = useState<College[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedColleges, setSelectedColleges] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: "",
    company_name: "",
    company_description: "",
    college_id: "",
    min_cgpa: "7.5",
    allowed_branches: "CSE,IT",
    required_skills: "DSA,Java,SQL",
    salary_min: "",
    salary_max: "",
    drive_date: "",
    exam_id: "",
    interview_pass_score: "60",
  });

  // Drives list and matching state
  const [drives, setDrives] = useState<JobDrive[]>([]);
  const [drivesLoading, setDrivesLoading] = useState(true);
  const [selectedDriveId, setSelectedDriveId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const fetchDrives = async () => {
    try {
      const response = await recruiterApi.getDrives();
      setDrives(response.data.drives || []);
    } catch (_err) {
      toast.error("Could not fetch job drives");
    } finally {
      setDrivesLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([recruiterApi.getColleges(), examApi.getExams()]).then(([collegeResponse, examResponse]) => {
      setColleges(collegeResponse.data.colleges || []);
      setExams(examResponse.data.exams || []);
    });
    fetchDrives();
  }, []);

  useEffect(() => {
    if (selectedCollegeId) {
      setSelectedColleges([selectedCollegeId]);
    } else {
      setSelectedColleges([]);
    }
  }, [selectedCollegeId]);

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const createDrive = async (event: FormEvent) => {
    event.preventDefault();
    if (selectedColleges.length === 0) {
      toast.error("Please select at least one target college");
      return;
    }
    setLoading(true);
    setEligibleCount(null);
    try {
      const { data } = await recruiterApi.createDrive({
        title: form.title,
        company_name: form.company_name,
        company_description: form.company_description,
        college_id: selectedColleges[0],
        college_ids: selectedColleges,
        min_cgpa: Number(form.min_cgpa),
        allowed_branches: splitList(form.allowed_branches),
        required_skills: splitList(form.required_skills),
        salary_min: form.salary_min ? Number(form.salary_min) : undefined,
        salary_max: form.salary_max ? Number(form.salary_max) : undefined,
        drive_date: form.drive_date ? new Date(form.drive_date).toISOString() : undefined,
        exam_id: form.exam_id === "none" ? undefined : form.exam_id || undefined,
        interview_pass_score: Number(form.interview_pass_score),
      });
      setEligibleCount(data.eligibleCount || 0);
      toast.success("Drive created and eligible students registered");
      fetchDrives(); // Refresh the list of drives
      setSelectedColleges([]); // Clear colleges selection
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Could not create drive");
    } finally {
      setLoading(false);
    }
  };

  const selectDrive = async (driveId: string) => {
    if (selectedDriveId === driveId) {
      setSelectedDriveId(null);
      setCandidates([]);
      return;
    }
    setSelectedDriveId(driveId);
    setCandidatesLoading(true);
    try {
      const response = await recruiterApi.getDriveEligibleCandidates(driveId);
      setCandidates(response.data.candidates || []);
    } catch (_err) {
      toast.error("Could not fetch eligible candidates for this drive");
    } finally {
      setCandidatesLoading(false);
    }
  };

  const calculateATSScore = (candidateSkills: any, requiredSkills: string[]) => {
    const skills = Array.isArray(candidateSkills) ? candidateSkills : [];
    if (requiredSkills.length === 0) return { score: 100, matched: [], missing: [] };

    const cSkillsLower = skills.map((s: string) => s.toLowerCase());
    const matched: string[] = [];
    const missing: string[] = [];

    requiredSkills.forEach((skill) => {
      if (cSkillsLower.includes(skill.toLowerCase())) {
        const originalSkill = skills.find((s: string) => s.toLowerCase() === skill.toLowerCase()) || skill;
        matched.push(originalSkill);
      } else {
        missing.push(skill);
      }
    });

    const score = Math.round((matched.length / requiredSkills.length) * 100);
    return { score, matched, missing };
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Job Drives & Match Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Create target recruitment drives, analyze student profiles, and calculate ATS Match ratings.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[450px_minmax(0,1fr)]">
        {/* Left column: Create Form */}
        <Card className="rounded-lg h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-4 w-4 text-blue-600" />
              Drive Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createDrive} className="space-y-5">
              <div className="grid gap-4">
                <Field label="Job Title" value={form.title} onChange={(value) => update("title", value)} placeholder="Software Engineer Trainee" />
                <Field label="Company Name" value={form.company_name} onChange={(value) => update("company_name", value)} placeholder="Acme Technologies" />
                <div className="space-y-2">
                  <Label>Company Description</Label>
                  <Textarea value={form.company_description} onChange={(event) => update("company_description", event.target.value)} rows={3} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-slate-800">Target Colleges *</Label>
                  <div className="rounded-md border border-slate-200 bg-white p-3 max-h-36 overflow-y-auto space-y-2">
                    {colleges.length === 0 ? (
                      <span className="text-xs text-slate-400">No colleges available</span>
                    ) : (
                      colleges.map((college) => {
                        const isChecked = selectedColleges.includes(college.id);
                        return (
                          <label key={college.id} className="flex items-center gap-2.5 text-xs text-slate-700 font-semibold cursor-pointer hover:bg-slate-50 p-1 rounded transition">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setSelectedColleges(selectedColleges.filter(id => id !== college.id));
                                } else {
                                  setSelectedColleges([...selectedColleges, college.id]);
                                }
                              }}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                            />
                            <span>{college.name} ({college.code})</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
                <Field label="Minimum CGPA" value={form.min_cgpa} onChange={(value) => update("min_cgpa", value)} type="number" />
                <Field label="Allowed Branches" value={form.allowed_branches} onChange={(value) => update("allowed_branches", value)} placeholder="CSE, IT, ECE" icon={GraduationCap} />
                <Field label="Required Skills (comma-separated)" value={form.required_skills} onChange={(value) => update("required_skills", value)} placeholder="DSA, React, SQL" icon={ListFilter} />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Salary Min" value={form.salary_min} onChange={(value) => update("salary_min", value)} type="number" required={false} icon={IndianRupee} />
                  <Field label="Salary Max" value={form.salary_max} onChange={(value) => update("salary_max", value)} type="number" required={false} icon={IndianRupee} />
                </div>
                <Field label="Drive Date" value={form.drive_date} onChange={(value) => update("drive_date", value)} type="datetime-local" required={false} />
                <div className="space-y-2">
                  <Label>Assign Exam</Label>
                  <Select value={form.exam_id} onValueChange={(value) => update("exam_id", value)}>
                    <SelectTrigger><SelectValue placeholder="Optional exam" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No exam yet</SelectItem>
                      {exams.map((exam) => <SelectItem key={exam.id} value={exam.id}>{exam.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>AI Interview Pass Score (0–100, default 60)</Label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={form.interview_pass_score}
                      onChange={(e) => update("interview_pass_score", e.target.value)}
                      className="flex-1 accent-blue-600"
                    />
                    <span className="w-12 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-center text-sm font-bold text-slate-900">
                      {form.interview_pass_score}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">Candidates scoring at or above this threshold in the AI interview will be marked as <strong>Selected</strong>.</p>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <Button type="submit" disabled={loading} className="w-full">{loading ? "Creating..." : "Create Drive"}</Button>
              </div>
              {eligibleCount !== null && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 font-semibold text-center">
                  🎉 {eligibleCount} eligible student(s) matched and registered!
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Right column: Drives List and ATS Match Panel */}
        <div className="space-y-6">
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                <Briefcase className="h-4 w-4 text-blue-600" />
                Active Job Drives ({drives.length})
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={fetchDrives} disabled={drivesLoading} className="h-8 w-8 p-0">
                <RefreshCw className={`h-4 w-4 ${drivesLoading ? "animate-spin" : ""}`} />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {drivesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-20 animate-pulse rounded-lg bg-slate-100" />
                  ))}
                </div>
              ) : drives.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  No active job drives found. Use the form on the left to create one.
                </div>
              ) : (
                <div className="space-y-3">
                  {drives.map((drive) => {
                    const isSelected = selectedDriveId === drive.id;
                    const driveDateStr = drive.drive_date
                      ? new Date(drive.drive_date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "Not scheduled";
                    return (
                      <div
                        key={drive.id}
                        className={`rounded-lg border transition ${
                          isSelected
                            ? "border-blue-500 bg-blue-50/20 ring-1 ring-blue-500"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div
                          className="flex cursor-pointer items-center justify-between p-4"
                          onClick={() => selectDrive(drive.id)}
                        >
                          <div className="space-y-1">
                            <div className="font-extrabold text-slate-900 text-sm">{drive.title}</div>
                            <div className="text-xs font-semibold text-slate-500">
                              {drive.company_name} · {(drive as any).colleges && (drive as any).colleges.length > 0 ? (drive as any).colleges.map((c: any) => c.name).join(", ") : (drive.college?.name || "Target College")}
                            </div>
                            <div className="flex flex-wrap gap-2 pt-1">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 uppercase">
                                CGPA: ≥{drive.min_cgpa}
                              </span>
                              {drive.required_skills && drive.required_skills.length > 0 && (
                                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                                  {drive.required_skills.length} Skills Required
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-xs font-bold text-slate-800">{driveDateStr}</div>
                              <div className="text-[10px] text-slate-400">Date</div>
                            </div>
                            <ChevronRight
                              className={`h-4 w-4 text-slate-400 transition-transform ${
                                isSelected ? "rotate-90" : ""
                              }`}
                            />
                          </div>
                        </div>

                        {isSelected && (
                          <div className="border-t border-slate-200 bg-slate-50/50 p-4">
                            {candidatesLoading ? (
                              <div className="flex items-center justify-center py-6 text-sm text-slate-500">
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin text-blue-600" />
                                Analyzing matched candidates...
                              </div>
                            ) : candidates.length === 0 ? (
                              <div className="text-center py-4 text-xs text-slate-500">
                                No candidates match the criteria (College, Min CGPA, Allowed Branches) for this drive.
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                  Candidate ATS Match Reports ({candidates.length})
                                </div>
                                <div className="max-h-[400px] space-y-3 overflow-y-auto pr-1">
                                  {candidates.map((candProfile) => {
                                    const candidate = candProfile.user || {};
                                    const { score, matched, missing } = calculateATSScore(
                                      candProfile.skills,
                                      drive.required_skills
                                    );

                                    const matchLabel =
                                      score >= 75 ? "High Match" : score >= 50 ? "Medium Match" : "Low Match";
                                    const matchColor =
                                      score >= 75
                                        ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                                        : score >= 50
                                        ? "bg-amber-50 border border-amber-200 text-amber-700"
                                        : "bg-slate-100 border border-slate-200 text-slate-600";

                                    return (
                                      <div
                                        key={candProfile.id}
                                        className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm"
                                      >
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                          <div>
                                            <div className="font-bold text-slate-900">{candidate.name}</div>
                                            <div className="text-xs text-slate-500">{candidate.email}</div>
                                            <div className="mt-1 flex gap-3 text-xs text-slate-500">
                                              <span>Branch: <strong>{candProfile.branch}</strong></span>
                                              <span>CGPA: <strong>{candProfile.cgpa}</strong></span>
                                            </div>
                                          </div>
                                          <div className="flex flex-col items-end gap-1.5">
                                            <span
                                              className={`rounded px-2 py-0.5 text-[11px] font-bold ${matchColor}`}
                                            >
                                              {score}% · {matchLabel}
                                            </span>
                                            {candProfile.resume_url && (
                                              <a
                                                href={candProfile.resume_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center text-[10px] font-bold text-blue-600 hover:underline"
                                              >
                                                View Resume
                                                <ExternalLink className="ml-1 h-2.5 w-2.5" />
                                              </a>
                                            )}
                                          </div>
                                        </div>

                                        {drive.required_skills && drive.required_skills.length > 0 && (
                                          <div className="mt-3 border-t border-slate-100 pt-3">
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                              Skills Comparison
                                            </div>
                                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                              {matched.map((skill) => (
                                                <span
                                                  key={skill}
                                                  className="inline-flex items-center rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-100"
                                                >
                                                  ✓ {skill}
                                                </span>
                                              ))}
                                              {missing.map((skill) => (
                                                <span
                                                  key={skill}
                                                  className="inline-flex items-center rounded bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600 border border-rose-100 line-through"
                                                >
                                                  ✗ {skill}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = true,
  icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  icon?: ComponentType<{ className?: string }>;
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

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

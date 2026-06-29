import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { FileImage, RefreshCw, ScanLine, ShieldCheck, XCircle, Search, Sparkles, Database, FileSpreadsheet, Check } from "lucide-react";

import { toast } from "sonner";
import { tpoApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Student = {
  id: string;
  roll_number: string;
  branch: string;
  cgpa: number;
  graduation_year: number;
  documents_verified: boolean;
  profile_complete: boolean;
  user?: { name: string; email: string; profile_complete: boolean };
};

type ScannedStudent = {
  roll_number: string;
  name: string;
  branch: string;
  cgpa: number;
  graduation_year: number;
  confidence?: number;
  source_file?: string;
  warnings?: string[];
};

export default function TpoStudents() {
  const [csv, setCsv] = useState("roll_number,name,branch,cgpa,graduation_year,email\n21CSE001,Asha Rao,CSE,8.6,2026,asha@example.com\n21CSE002,Karan Dev,CSE,7.9,2026,karan@example.com\n21ECE045,Sana Khan,ECE,9.1,2026,sana@example.com");
  const [files, setFiles] = useState<File[]>([]);
  const [scannedRows, setScannedRows] = useState<ScannedStudent[]>([]);
  const [scanFailures, setScanFailures] = useState<Array<{ file: string; reason: string }>>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const rows = useMemo(() => parseCsv(csv), [csv]);

  const loadStudents = () => {
    setLoading(true);
    tpoApi.getStudents()
      .then(({ data }) => setStudents(data.students || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const upload = async () => {
    if (rows.length === 0) {
      toast.error("Paste at least one valid student row");
      return;
    }
    setUploading(true);
    try {
      const { data } = await tpoApi.uploadStudents(rows);
      toast.success(data.message || "Students uploaded successfully!");
      loadStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    setFiles(selected);
    setScannedRows([]);
    setScanFailures([]);
  };

  const scanFiles = async () => {
    if (files.length === 0) {
      toast.error("Choose marksheet images or PDFs first");
      return;
    }

    setScanning(true);
    setScannedRows([]);
    setScanFailures([]);
    try {
      const allScanned: ScannedStudent[] = [];
      const allFailed: Array<{ file: string; reason: string }> = [];
      const batchSize = 4;

      for (let index = 0; index < files.length; index += batchSize) {
        const batch = files.slice(index, index + batchSize);
        setScanProgress(`Scanning ${index + 1}-${Math.min(index + batch.length, files.length)} of ${files.length}`);
        const payload = await Promise.all(batch.map(fileToPayload));
        const { data } = await tpoApi.scanMarksheets(payload);
        allScanned.push(...(data.students || []));
        allFailed.push(...((data.failed || []).map((failure: any) => ({
          file: failure.file || failure.row?.roll_number || failure.row?.source_file || "unknown",
          reason: failure.reason || "Needs review",
        }))));
        setScannedRows([...allScanned]);
        setScanFailures([...allFailed]);
      }

      toast.success(`${allScanned.length} marksheet(s) scanned and accounts created`);
      loadStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Marksheet scan failed. Check AI API Key configuration.");
    } finally {
      setScanProgress("");
      setScanning(false);
    }
  };

  const copyScansToCsv = () => {
    const header = "roll_number,name,branch,cgpa,graduation_year,email";
    const body = scannedRows.map((row) => `${row.roll_number},${row.name},${row.branch},${row.cgpa},${row.graduation_year},`).join("\n");
    setCsv(`${header}\n${body}`);
    toast.success("Scanned rows copied to CSV editor");
  };

  const verify = async (student: Student) => {
    try {
      await tpoApi.verifyDocuments(student.id, !student.documents_verified);
      setStudents((current) => current.map((item) => item.id === student.id ? { ...item, documents_verified: !item.documents_verified } : item));
      toast.success(`Verification status updated for ${student.user?.name || student.roll_number}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Verification update failed");
    }
  };

  // Filtered student list
  const filteredStudents = useMemo(() => {
    return students.filter(s =>
      s.roll_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.branch.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.user?.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.user?.email || "").toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [students, searchQuery]);

  const initials = (name: string) => name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const avatarColors = ["bg-blue-50 text-blue-700 border-blue-100", "bg-emerald-50 text-emerald-700 border-emerald-100", "bg-violet-50 text-violet-700 border-violet-100", "bg-amber-50 text-amber-700 border-amber-100", "bg-rose-50 text-rose-700 border-rose-100"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Student Roster & Verification</h1>
          <p className="text-xs text-slate-500 font-semibold mt-1">Onboard student metrics in bulk and verify marksheets using AI OCR.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: CGPA Master Upload & Scanning Controls */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
            <CardHeader className="border-b border-slate-50 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                <FileSpreadsheet className="h-4 w-4 text-violet-600" />
                CGPA Master Roster Upload
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="text-xs text-slate-500 font-semibold leading-relaxed">
                Paste student information below in standard CSV format to provision candidate accounts instantly.
              </div>
              <Textarea
                value={csv}
                onChange={(event) => setCsv(event.target.value)}
                rows={5}
                className="font-mono text-[11px] leading-normal bg-slate-50/50 focus:bg-white border-slate-200 focus:border-violet-500 rounded-lg outline-none"
              />
              <div className="flex flex-col gap-2.5">
                <div className="text-[10px] text-slate-400 font-bold">
                  {rows.length} valid student rows detected.
                </div>
                <Button
                  onClick={upload}
                  disabled={uploading}
                  className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold text-xs h-9 rounded-lg"
                >
                  {uploading ? "Processing CSV Upload..." : "Import CSV Student Roster"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
            <CardHeader className="border-b border-slate-50 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                <ScanLine className="h-4 w-4 text-violet-600" />
                Bulk Marksheet OCR Scanning
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/30 p-5 hover:bg-slate-50/70 transition duration-150">
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 text-center">
                  <div className="rounded-lg bg-violet-50 p-2.5 text-violet-600">
                    <FileImage className="h-6 w-6" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Select Marksheet Files</span>
                  <span className="text-[10px] text-slate-400 max-w-[280px]">
                    Supports JPG, PNG, WEBP, and PDF. Select student documents to match CGPA and roll numbers automatically.
                  </span>
                  <input type="file" multiple accept="image/*,application/pdf" onChange={selectFiles} className="hidden" />
                </label>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200/50 px-2 py-0.5 rounded">
                  {files.length} file(s) selected
                </span>
                <div className="flex gap-2">
                  <Button
                    onClick={scanFiles}
                    disabled={scanning || files.length === 0}
                    size="sm"
                    className="bg-violet-600 hover:bg-violet-700 text-white font-extrabold text-xs h-8 rounded-lg"
                  >
                    {scanning ? scanProgress || "Reading..." : "Scan Files"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyScansToCsv}
                    disabled={scannedRows.length === 0}
                    className="border-slate-200 text-slate-700 font-bold text-xs h-8 rounded-lg"
                  >
                    Push to CSV
                  </Button>
                </div>
              </div>

              {scannedRows.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-slate-200/70 max-h-[220px] overflow-y-auto mt-2">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                      <tr>
                        <th className="px-3 py-2">Roll No</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">CGPA</th>
                        <th className="px-3 py-2">Conf</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {scannedRows.map((row) => (
                        <tr key={`${row.roll_number}-${row.source_file}`}>
                          <td className="px-3 py-2 font-bold text-slate-900">{row.roll_number}</td>
                          <td className="px-3 py-2 font-medium text-slate-700">{row.name}</td>
                          <td className="px-3 py-2 text-slate-800 font-semibold">{row.cgpa}</td>
                          <td className="px-3 py-2 text-emerald-600 font-bold">{Math.round((row.confidence || 0.95) * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {scanFailures.length > 0 && (
                <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 space-y-1">
                  <div className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">Failed scans ({scanFailures.length})</div>
                  <div className="space-y-0.5 text-[10px] text-rose-700 font-medium">
                    {scanFailures.map((failure, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{failure.file}:</span>
                        <span>{failure.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Student Roster Table */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden flex flex-col">
            <CardHeader className="border-b border-slate-50 pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-extrabold text-slate-900">
                Active Student Database
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by name, roll, branch..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 w-44 rounded-lg border border-slate-200 pl-8 pr-3 text-[11px] font-semibold outline-none focus:border-violet-500 bg-slate-50/50 focus:bg-white"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={loadStudents} className="h-8 border-slate-200 text-slate-700 font-bold rounded-lg text-xs">
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 space-y-3">
                  <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
                  <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
                  <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="py-20 text-center text-xs font-semibold text-slate-400">
                  No student records match the search.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-center w-8">
                          <input type="checkbox" className="rounded border-slate-300 text-violet-600 focus:ring-violet-500" readOnly checked />
                        </th>
                        <th className="px-4 py-3">Student Name</th>
                        <th className="px-4 py-3">Branch</th>
                        <th className="px-4 py-3">CGPA</th>
                        <th className="px-4 py-3">Profile Status</th>
                        <th className="px-4 py-3">Documents</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredStudents.map((student, idx) => {
                        const isVerified = student.documents_verified;
                        const hasCompletedProfile = student.profile_complete || student.user?.profile_complete;
                        const avatarStyle = avatarColors[idx % avatarColors.length];
                        const nameString = student.user?.name || student.roll_number;

                        return (
                          <tr key={student.id} className="hover:bg-slate-50/40 transition duration-150">
                            <td className="px-4 py-3 text-center">
                              <input type="checkbox" className="rounded border-slate-300 text-violet-600 focus:ring-violet-500" readOnly checked={isVerified} />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-[10px] border ${avatarStyle}`}>
                                  {student.user?.name ? initials(student.user.name) : student.roll_number.slice(-3)}
                                </div>
                                <div>
                                  <div className="font-extrabold text-slate-800">{nameString}</div>
                                  <div className="text-[10px] text-slate-400 font-bold">{student.roll_number} · {student.user?.email || "No Email Provided"}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center rounded-full bg-slate-50 border border-slate-200 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 uppercase">
                                {student.branch}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-extrabold text-slate-800">{student.cgpa.toFixed(2)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                hasCompletedProfile
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                  : "bg-slate-100 text-slate-500 border border-slate-200"
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${hasCompletedProfile ? "bg-emerald-500" : "bg-slate-400"}`} />
                                {hasCompletedProfile ? "Profile Completed" : "Registration Pending"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                isVerified
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}>
                                {isVerified ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-600" /> Verified
                                  </>
                                ) : (
                                  <>
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" /> Pending Review
                                  </>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => verify(student)}
                                className={`h-7 px-2.5 font-bold text-[10px] rounded-lg transition duration-150 ${
                                  isVerified
                                    ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                                    : "border-violet-200 text-violet-600 hover:bg-violet-50"
                                }`}
                              >
                                {isVerified ? (
                                  <>
                                    <XCircle className="mr-1 h-3 w-3" /> Unverify
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="mr-1 h-3 w-3" /> Verify Record
                                  </>
                                )}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* OCR Intelligent Document Verification Sandbox */}
      <Card className="rounded-2xl border border-slate-200/85 bg-white shadow-sm overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3">
          <CardTitle className="flex items-center justify-between text-sm font-extrabold text-slate-900">
            <div className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-violet-600 animate-pulse" />
              <span>OCR Marksheet Intelligent Extraction Sandbox</span>
            </div>
            <div className="inline-flex items-center gap-1 rounded-full bg-violet-100/70 border border-violet-200/60 px-2.5 py-0.5 text-[9px] font-bold text-violet-700 uppercase tracking-wider">
              <Sparkles className="h-3 w-3 text-violet-600" /> AI Verification Engaged
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid gap-6 md:grid-cols-12">
            {/* Visual Marksheet Representation with Bounding Boxes */}
            <div className="md:col-span-6 bg-slate-900 rounded-xl p-5 text-slate-300 border border-slate-800 relative min-h-[220px] overflow-hidden flex flex-col justify-between group">
              {/* Laser Scan Line Simulation */}
              <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-violet-500 to-transparent animate-[pulse_1.5s_infinite] shadow-lg shadow-violet-500/80" style={{
                animation: 'scan-line 4s linear infinite',
                top: '0%'
              }} />
              
              <style>{`
                @keyframes scan-line {
                  0% { top: 0%; opacity: 0; }
                  5% { opacity: 1; }
                  95% { opacity: 1; }
                  100% { top: 100%; opacity: 0; }
                }
              `}</style>

              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="text-[10px] font-extrabold tracking-wider text-slate-400">STATE TECHNICAL EDUCATION BOARD</div>
                  <div className="text-[9px] font-bold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">DOCUMENT VALID</div>
                </div>

                <div className="space-y-2 text-[10px] font-semibold text-slate-400">
                  <div className="flex items-center gap-2 relative">
                    <span className="text-slate-500">Student Name:</span>
                    <span className="text-white bg-slate-800 px-1 rounded border border-slate-700/50">ASHA RAO</span>
                    <span className="absolute -right-2 top-0 text-[8px] bg-violet-600/20 border border-violet-500/40 text-violet-400 px-1 rounded scale-90">Name bounding box</span>
                  </div>

                  <div className="flex items-center gap-2 relative">
                    <span className="text-slate-500">Roll Number:</span>
                    <span className="text-white bg-slate-800 px-1 rounded border border-slate-700/50">21CSE001</span>
                    <span className="absolute -right-2 top-0 text-[8px] bg-violet-600/20 border border-violet-500/40 text-violet-400 px-1 rounded scale-90">Roll bounding box</span>
                  </div>

                  <div className="flex items-center gap-2 relative">
                    <span className="text-slate-500">Academic CGPA:</span>
                    <span className="text-emerald-400 bg-emerald-500/10 px-1.5 rounded border border-emerald-500/30">8.60</span>
                    <span className="absolute -right-2 top-0 text-[8px] bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 px-1 rounded scale-90">CGPA bounding box</span>
                  </div>

                  <div className="flex items-center gap-2 relative">
                    <span className="text-slate-500">Passing Year:</span>
                    <span className="text-white bg-slate-800 px-1 rounded border border-slate-700/50">2026</span>
                    <span className="absolute -right-2 top-0 text-[8px] bg-violet-600/20 border border-violet-500/40 text-violet-400 px-1 rounded scale-90">Year bounding box</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-slate-850 p-2.5 rounded-lg border border-slate-800/80 mt-4">
                <Sparkles className="h-4 w-4 text-violet-400 animate-bounce" />
                <div className="text-[10px] text-slate-300 leading-normal">
                  <span className="font-bold text-white">AI Extract Status:</span> Coordinates matched. CGPA value parsed at 98.6% parser confidence score.
                </div>
              </div>
            </div>

            {/* Extracted Fields Comparison Table */}
            <div className="md:col-span-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="text-xs font-bold text-slate-700">Database Ground Truth vs OCR Extracted Values</div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/25">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                      <tr>
                        <th className="px-3 py-2.5">Field</th>
                        <th className="px-3 py-2.5">CSV Master value</th>
                        <th className="px-3 py-2.5">OCR Extracted</th>
                        <th className="px-3 py-2.5">Match</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-[11px] font-medium text-slate-700">
                      <tr>
                        <td className="px-3 py-2 font-bold text-slate-500">Student Name</td>
                        <td className="px-3 py-2">Asha Rao</td>
                        <td className="px-3 py-2">Asha Rao</td>
                        <td className="px-3 py-2 text-emerald-600 font-bold flex items-center gap-1"><Check className="h-3 w-3" /> Exact</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold text-slate-500">Roll Number</td>
                        <td className="px-3 py-2">21CSE001</td>
                        <td className="px-3 py-2">21CSE001</td>
                        <td className="px-3 py-2 text-emerald-600 font-bold flex items-center gap-1"><Check className="h-3 w-3" /> Exact</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold text-slate-500">CGPA</td>
                        <td className="px-3 py-2">8.6</td>
                        <td className="px-3 py-2">8.60</td>
                        <td className="px-3 py-2 text-emerald-600 font-bold flex items-center gap-1"><Check className="h-3 w-3" /> Exact</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold text-slate-500">Graduation Year</td>
                        <td className="px-3 py-2">2026</td>
                        <td className="px-3 py-2">2026</td>
                        <td className="px-3 py-2 text-emerald-600 font-bold flex items-center gap-1"><Check className="h-3 w-3" /> Exact</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 mt-4 flex items-start gap-3">
                <Database className="h-5 w-5 text-violet-600 mt-0.5" />
                <div className="text-[10px] text-violet-900 leading-normal font-medium">
                  <span className="font-extrabold block mb-0.5">Automated Credentials Provisioning</span>
                  When the student registers, they upload their marksheet. The AI model extracts the information and compares it with your CSV master sheet. In case of 100% agreement, the student status instantly updates to <span className="bg-emerald-500/15 text-emerald-850 px-1 py-0.5 rounded font-extrabold">Verified</span>.
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

async function fileToPayload(file: File) {
  const dataUrl = await readFileAsDataUrl(file);
  const [, base64 = ""] = dataUrl.split(",");
  return {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    data: base64,
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function parseCsv(input: string) {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const [headerLine, ...body] = lines;
  if (!headerLine) return [];
  const headers = headerLine.split(",").map((item) => item.trim().toLowerCase());

  return body.map((line) => {
    const cells = line.split(",").map((item) => item.trim());
    const record = Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
    return {
      roll_number: record.roll_number,
      name: record.name,
      branch: record.branch,
      cgpa: Number(record.cgpa),
      graduation_year: Number(record.graduation_year),
      email: record.email,
    };
  }).filter((row) => row.roll_number && row.name && row.branch && !Number.isNaN(row.cgpa) && !Number.isNaN(row.graduation_year));
}


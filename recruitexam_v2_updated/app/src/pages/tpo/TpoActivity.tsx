import { useEffect, useState } from "react";
import { Activity, CheckCircle, Clock, Upload, ScanLine } from "lucide-react";
import { tpoApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TpoActivity() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tpoApi.getStudents()
      .then(({ data }) => setStudents(data.students || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-200" />)}
      </div>
    );
  }

  const verified = students.filter((s) => s.documents_verified);
  const pending = students.filter((s) => !s.documents_verified);
  const profileComplete = students.filter((s) => s.profile_complete || s.user?.profile_complete);
  const profilePending = students.filter((s) => !s.profile_complete && !s.user?.profile_complete);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Activity</h1>
        <p className="mt-1 text-sm text-slate-500">
          Student verification status, profile completion, and recent uploads.
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total Students", value: students.length, icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Docs Verified", value: verified.length, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Docs Pending", value: pending.length, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Profile Done", value: profileComplete.length, icon: Upload, color: "text-violet-600", bg: "bg-violet-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div className="text-2xl font-extrabold text-slate-950">{value}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Pending verification */}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-amber-500" />
              Pending Document Verification ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
                All documents verified ✅
              </div>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {pending.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{s.user?.name || s.roll_number}</div>
                      <div className="text-xs text-slate-500">{s.roll_number} · {s.branch}</div>
                    </div>
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-800">Pending</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Profile incomplete */}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanLine className="h-4 w-4 text-rose-500" />
              Profile Incomplete ({profilePending.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profilePending.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
                All profiles complete ✅
              </div>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {profilePending.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{s.user?.name || s.roll_number}</div>
                      <div className="text-xs text-slate-500">{s.roll_number} · {s.branch} · CGPA {s.cgpa}</div>
                    </div>
                    <span className="rounded-full bg-rose-200 px-2 py-0.5 text-xs font-bold text-rose-800">Incomplete</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* All students activity log */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base">All Students</CardTitle>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">No students uploaded yet.</div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">CGPA</th>
                    <th className="px-4 py-3">Profile</th>
                    <th className="px-4 py-3">Documents</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{s.user?.name || s.roll_number}</div>
                        <div className="text-xs text-slate-400">{s.user?.email}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{s.branch}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{s.cgpa}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.profile_complete || s.user?.profile_complete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {s.profile_complete || s.user?.profile_complete ? "Complete" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.documents_verified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {s.documents_verified ? "Verified" : "Pending"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

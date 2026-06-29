import { useEffect, useState } from "react";
import { Building2, Search, Users, Plus, X } from "lucide-react";

import { adminApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import CreateRecruiter from "./CreateRecruiter";
import CreateTpo from "./CreateTpo";
import { toast } from "sonner";

export default function AdminManage() {
  const [recruiters, setRecruiters] = useState<any[]>([]);
  const [tpos, setTpos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and filter states
  const [recruiterSearch, setRecruiterSearch] = useState("");
  const [tpoSearch, setTpoSearch] = useState("");

  // Modals / toggles
  const [showAddRecruiter, setShowAddRecruiter] = useState(false);
  const [showAddTpo, setShowAddTpo] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rRes, tRes] = await Promise.all([
        adminApi.getRecruiters(),
        adminApi.getTpos(),
      ]);
      setRecruiters(rRes.data.recruiters || []);
      setTpos(tRes.data.tpos || []);
    } catch (_err) {
      toast.error("Could not fetch accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredRecruiters = recruiters.filter(r =>
    r.name.toLowerCase().includes(recruiterSearch.toLowerCase()) ||
    r.email.toLowerCase().includes(recruiterSearch.toLowerCase())
  );

  const filteredTpos = tpos.filter(t =>
    t.name.toLowerCase().includes(tpoSearch.toLowerCase()) ||
    t.email.toLowerCase().includes(tpoSearch.toLowerCase()) ||
    (t.college?.name || "").toLowerCase().includes(tpoSearch.toLowerCase())
  );

  const initials = (name: string) => name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const avatarColors = ["bg-blue-50 text-blue-700", "bg-emerald-50 text-emerald-700", "bg-violet-50 text-violet-700", "bg-amber-50 text-amber-700", "bg-rose-50 text-rose-700"];

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <div className="h-[450px] animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-[450px] animate-pulse rounded-2xl bg-slate-200" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Account Management</h1>
          <p className="text-xs text-slate-500 font-semibold mt-1">Manage and provision Recruiter and TPO credentials.</p>
        </div>
      </div>

      {/* Dual Column Layout (matching Screenshot 2) */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recruiter Management Card */}
        <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                <Users className="h-4 w-4 text-violet-600" />
                Recruiter Management
              </CardTitle>
              <Button
                size="sm"
                onClick={() => setShowAddRecruiter(true)}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-lg text-xs"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add New
              </Button>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                {/* Search bar */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search recruiters..."
                    value={recruiterSearch}
                    onChange={(e) => setRecruiterSearch(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-9 pr-4 text-xs font-semibold text-slate-900 outline-none focus:border-violet-500 focus:bg-white"
                  />
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                  Filter ▾
                </div>
              </div>

              {/* Entries count */}
              <div className="flex items-center justify-between pt-1">
                <span className="rounded bg-violet-50 border border-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
                  {filteredRecruiters.length} entries
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Status: Active</span>
              </div>

              {/* Recruiters List */}
              <div className="max-h-[360px] overflow-y-auto space-y-2.5 pr-1 mt-2">
                {filteredRecruiters.length === 0 ? (
                  <div className="text-center py-12 text-xs font-medium text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    No recruiters found
                  </div>
                ) : (
                  filteredRecruiters.map((recruiter, idx) => {
                    const avatarStyle = avatarColors[idx % avatarColors.length];
                    return (
                      <div
                        key={recruiter.id}
                        className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 bg-slate-50/30 hover:border-slate-200 transition"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-full font-bold text-xs ${avatarStyle}`}>
                            {initials(recruiter.name)}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-800">{recruiter.name}</div>
                            <div className="text-[10px] text-slate-400 font-semibold">{recruiter.email}</div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50">
                          Configure
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </div>
        </Card>

        {/* TPO Management Card */}
        <Card className="rounded-2xl border border-slate-200/60 bg-white shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                <Building2 className="h-4 w-4 text-violet-600" />
                TPO Management
              </CardTitle>
              <Button
                size="sm"
                onClick={() => setShowAddTpo(true)}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-lg text-xs"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add New
              </Button>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                {/* Search bar */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search TPOs by name or college..."
                    value={tpoSearch}
                    onChange={(e) => setTpoSearch(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-9 pr-4 text-xs font-semibold text-slate-900 outline-none focus:border-violet-500 focus:bg-white"
                  />
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                  Filter ▾
                </div>
              </div>

              {/* Entries count */}
              <div className="flex items-center justify-between pt-1">
                <span className="rounded bg-violet-50 border border-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
                  {filteredTpos.length} entries
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Status: Active</span>
              </div>

              {/* TPOs List */}
              <div className="max-h-[360px] overflow-y-auto space-y-2.5 pr-1 mt-2">
                {filteredTpos.length === 0 ? (
                  <div className="text-center py-12 text-xs font-medium text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    No TPO accounts found
                  </div>
                ) : (
                  filteredTpos.map((tpo, idx) => {
                    const avatarStyle = avatarColors[(idx + 2) % avatarColors.length];
                    return (
                      <div
                        key={tpo.id}
                        className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 bg-slate-50/30 hover:border-slate-200 transition"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-full font-bold text-xs ${avatarStyle}`}>
                            {initials(tpo.name)}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-800">{tpo.name}</div>
                            <div className="text-[10px] text-slate-500 font-semibold">{tpo.college?.name || "No College Linked"}</div>
                            <div className="text-[9px] text-slate-400 font-medium">{tpo.email}</div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50">
                          Configure
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Recruiter Creation Modal */}
      {showAddRecruiter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150">
            <button
              onClick={() => {
                setShowAddRecruiter(false);
                fetchData(); // refresh
              }}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="max-h-[85vh] overflow-y-auto pr-1">
              <CreateRecruiter />
            </div>
          </div>
        </div>
      )}

      {/* TPO Creation Modal */}
      {showAddTpo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150">
            <button
              onClick={() => {
                setShowAddTpo(false);
                fetchData(); // refresh
              }}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="max-h-[85vh] overflow-y-auto pr-1">
              <CreateTpo />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

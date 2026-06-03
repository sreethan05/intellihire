import { Upload } from "lucide-react";
import { ChangeEvent, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";

export default function TpoDashboard() {
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<any>();
  const load = () => api.get(`/tpo/students?search=${search}`).then((res) => setStudents(res.data.data));
  useEffect(() => { load(); }, []);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    const res = await api.post("/tpo/upload-students", body);
    setSummary(res.data);
    load();
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">TPO Students</h1><Button asChild={false}><Upload className="h-4 w-4" /><label className="cursor-pointer">Upload<input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={upload} /></label></Button></div>
      <div className="grid grid-cols-4 gap-3"><Input placeholder="Search name or roll number" value={search} onChange={(e) => setSearch(e.target.value)} /><Input placeholder="Branch" /><Input placeholder="Year" /><Button onClick={load}>Apply</Button></div>
      {summary && <Card><CardContent>Processed {summary.total}. Successful {summary.successful}. Failed {summary.failed}.</CardContent></Card>}
      <Card>
        <CardHeader><CardTitle>Student List</CardTitle></CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full text-sm"><thead><tr className="border-b"><th>Name</th><th>Roll</th><th>Branch</th><th>CGPA</th><th>Profile</th><th>Docs</th></tr></thead><tbody>
            {students.map((s) => <tr key={s.id} className="border-b"><td>{s.full_name}</td><td>{s.roll_number}</td><td>{s.branch}</td><td>{s.cgpa}</td><td><Progress value={s.profile_complete ? 100 : 60} /></td><td><Badge>{s.document_verified ? "verified" : "pending"}</Badge></td></tr>)}
          </tbody></table>
        </CardContent>
      </Card>
    </main>
  );
}


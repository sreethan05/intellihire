import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export default function AdminDashboard() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [college, setCollege] = useState({ name: "", code: "", address: "" });
  useEffect(() => { api.get("/admin/stats").then((res) => setStats(res.data)); }, []);
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      <div className="grid grid-cols-4 gap-4">{Object.entries(stats).map(([k, v]) => <Card key={k}><CardContent><p className="text-sm text-muted-foreground">{k}</p><p className="text-3xl font-bold">{v}</p></CardContent></Card>)}</div>
      <Card><CardHeader><CardTitle>College Management</CardTitle></CardHeader><CardContent className="grid grid-cols-4 gap-3"><Input placeholder="Name" value={college.name} onChange={(e) => setCollege({ ...college, name: e.target.value })} /><Input placeholder="Code" value={college.code} onChange={(e) => setCollege({ ...college, code: e.target.value })} /><Input placeholder="Address" value={college.address} onChange={(e) => setCollege({ ...college, address: e.target.value })} /><Button onClick={() => api.post("/admin/colleges", college)}>Add College</Button></CardContent></Card>
      <Card><CardHeader><CardTitle>System Health</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-3"><p>Judge0 status</p><p>Supabase storage</p><p>AI usage tracker</p></CardContent></Card>
    </main>
  );
}


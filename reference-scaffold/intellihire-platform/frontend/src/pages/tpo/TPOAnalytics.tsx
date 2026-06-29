import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function TPOAnalytics() {
  const [overview, setOverview] = useState<any>({});
  useEffect(() => { api.get("/analytics/tpo/current/overview").then((res) => setOverview(res.data)).catch(() => undefined); }, []);
  const sample = [{ branch: "CSE", total: 80, placed: 48 }, { branch: "ECE", total: 60, placed: 26 }];
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">College Analytics</h1>
      <div className="grid grid-cols-3 gap-4">{["total_students", "document_verified", "placed"].map((k) => <Card key={k}><CardContent><p className="text-sm text-muted-foreground">{k.replace("_", " ")}</p><p className="text-3xl font-bold">{overview[k] ?? 0}</p></CardContent></Card>)}</div>
      <div className="grid grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle>Branch-wise Placement</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={260}><BarChart data={sample}><CartesianGrid /><XAxis dataKey="branch" /><YAxis /><Tooltip /><Bar dataKey="total" fill="#60a5fa" /><Bar dataKey="placed" fill="#2563eb" /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle>Monthly Trend</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={260}><LineChart data={[{ m: "Jan", v: 4 }, { m: "Feb", v: 12 }]}><XAxis dataKey="m" /><YAxis /><Tooltip /><Line dataKey="v" stroke="#2563eb" /></LineChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle>CGPA Correlation</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={260}><ScatterChart><XAxis dataKey="cgpa" /><YAxis dataKey="score" /><Tooltip /><Scatter data={[{ cgpa: 8.1, score: 72 }]} fill="#2563eb" /></ScatterChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle>Public Placement Stats</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Export-ready stats card for college website.</p></CardContent></Card>
      </div>
    </main>
  );
}


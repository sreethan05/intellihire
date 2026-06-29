import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Pie, PieChart, Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function RecruiterAnalytics() {
  const { driveId } = useParams();
  const [funnel, setFunnel] = useState<any[]>([]);
  useEffect(() => { api.get(`/analytics/recruiter/${driveId}/funnel`).then((res) => setFunnel(res.data)); }, [driveId]);
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Recruiter Analytics</h1>
      <div className="grid grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle>Hiring Funnel</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={260}><BarChart data={funnel}><XAxis dataKey="stage" /><YAxis /><Tooltip /><Bar dataKey="count" fill="#2563eb" /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle>Score Distribution</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={260}><AreaChart data={[{ range: "0-10", count: 2 }, { range: "80-90", count: 8 }]}><XAxis dataKey="range" /><YAxis /><CartesianGrid /><Tooltip /><Area dataKey="count" fill="#93c5fd" stroke="#2563eb" /></AreaChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle>Proctoring Summary</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={260}><PieChart><Pie dataKey="value" data={[{ name: "Clean", value: 70 }, { name: "Warnings", value: 20 }]} fill="#2563eb" label /></PieChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle>Candidate Comparison</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={260}><RadarChart data={[{ metric: "Coding", a: 80, b: 65 }]}><PolarGrid /><PolarAngleAxis dataKey="metric" /><Radar dataKey="a" stroke="#2563eb" fill="#2563eb" fillOpacity={0.4} /></RadarChart></ResponsiveContainer></CardContent></Card>
      </div>
    </main>
  );
}


import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { Award, Target, TrendingUp } from "lucide-react";

export interface SkillMetric {
  subject: string;
  candidateScore: number; // 0-100
  campusAverage: number; // 0-100
}

interface CandidateSkillRadarProps {
  candidateName: string;
  skills?: SkillMetric[];
}

const DEFAULT_SKILLS: SkillMetric[] = [
  { subject: "Algorithms", candidateScore: 85, campusAverage: 65 },
  { subject: "Data Structures", candidateScore: 90, campusAverage: 70 },
  { subject: "System Design", candidateScore: 75, campusAverage: 60 },
  { subject: "Problem Solving", candidateScore: 88, campusAverage: 68 },
  { subject: "Code Quality", candidateScore: 92, campusAverage: 72 },
];

export default function CandidateSkillRadar({
  candidateName,
  skills = DEFAULT_SKILLS,
}: CandidateSkillRadarProps) {
  const candidateAvg = Math.round(
    skills.reduce((acc, curr) => acc + curr.candidateScore, 0) / skills.length
  );

  const campusAvg = Math.round(
    skills.reduce((acc, curr) => acc + curr.campusAverage, 0) / skills.length
  );

  const percentile = Math.min(99, Math.max(50, Math.round(80 + (candidateAvg - campusAvg) * 0.8)));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Header section */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Target className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
            Candidate Competency Skill Radar
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Benchmarking {candidateName}&apos;s profile against overall campus average
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-1.5 dark:border-violet-900/40 dark:bg-violet-950/40">
            <div className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              Campus Percentile
            </div>
            <div className="text-sm font-extrabold text-violet-700 dark:text-violet-300 flex items-center gap-1">
              <Award className="h-4 w-4" /> Top {percentile}%
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-2 gap-4 my-4 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Candidate Score</div>
          <div className="text-xl font-extrabold text-violet-600 dark:text-violet-400">{candidateAvg}%</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Campus Average</div>
          <div className="text-xl font-extrabold text-slate-700 dark:text-slate-300">{campusAvg}%</div>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/30">
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Delta Advantage</div>
          <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
            <TrendingUp className="h-4 w-4" /> +{candidateAvg - campusAvg}%
          </div>
        </div>
      </div>

      {/* Recharts Skill Radar Chart */}
      <div className="h-72 w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={skills}>
            <PolarGrid stroke="#cbd5e1" strokeDasharray="3 3" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: "#64748b", fontSize: 12, fontWeight: 700 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#94a3b8" />
            <Radar
              name={candidateName}
              dataKey="candidateScore"
              stroke="#7c3aed"
              fill="#7c3aed"
              fillOpacity={0.45}
            />
            <Radar
              name="Campus Average"
              dataKey="campusAverage"
              stroke="#94a3b8"
              fill="#94a3b8"
              fillOpacity={0.2}
            />
            <Tooltip />
            <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px", fontWeight: "bold" }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

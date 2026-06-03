import {
  Landmark,
  ArrowRight,
  Award,
  TrendingUp,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCollege } from "@/context/CollegeContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function RecruiterColleges() {
  const { setSelectedCollegeId, collegesSummary } = useCollege();
  const navigate = useNavigate();

  const handleSelectCollege = (collegeId: string) => {
    setSelectedCollegeId(collegeId);
    navigate("/recruiter/overview");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <Landmark className="h-5 w-5 text-violet-600 animate-pulse" />
          Campus Drive & Colleges Hub
        </h1>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          Compare college averages, active candidate lists, hiring pipelines, and enter specific campus drive consoles.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-extrabold uppercase text-slate-400 tracking-wider mb-4">Campuses Comparison</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {collegesSummary.map((college) => {
            const offerRate = college.candidatesCount ? Math.round((college.offersCount / college.candidatesCount) * 100) : 0;
            return (
              <div
                key={college.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md bg-white"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-sm leading-snug">{college.name}</h3>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mt-0.5">{college.code} • {college.location || "Online"}</p>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                      <Landmark className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5 my-4 bg-slate-50/70 border border-slate-100 rounded-xl p-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Drives</p>
                      <p className="text-sm font-black text-slate-800 mt-0.5">{college.drivesCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Candidates</p>
                      <p className="text-sm font-black text-slate-800 mt-0.5">{college.candidatesCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Avg Score</p>
                      <p className="text-sm font-black text-slate-800 mt-0.5">{college.averageScore}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Offers</p>
                      <p className="text-sm font-black text-slate-800 mt-0.5">{college.offersCount}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                      <span>Hiring Success Rate</span>
                      <span>{offerRate}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600"
                        style={{ width: `${offerRate}%` }}
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleSelectCollege(college.id)}
                  className="w-full mt-4 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-100 transition duration-150 cursor-pointer"
                >
                  Enter Campus Console
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {collegesSummary.length === 0 && (
            <div className="col-span-full py-8 text-center text-xs text-slate-400">
              No colleges linked to your drives. Create recruitment drives in Manage tab.
            </div>
          )}
        </div>
      </div>

      {collegesSummary.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-800 mb-4 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-violet-600" />
              Average Exam Scores Comparison
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={collegesSummary} margin={{ left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="code" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="averageScore" name="Avg Score %" fill="#6366f1" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-800 mb-4 flex items-center gap-1.5">
              <Award className="h-4 w-4 text-emerald-600" />
              Total Campus Offers Granted
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={collegesSummary} margin={{ left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="code" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="offersCount" name="Offers count" fill="#10b981" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

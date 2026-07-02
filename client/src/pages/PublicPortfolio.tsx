import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { QRCodeSVG } from "qrcode.react";
import { Briefcase, FileText, CheckCircle, MapPin, QrCode, Github, Linkedin, Globe, Trophy, BarChart3, AlertCircle } from "lucide-react";
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend 
} from "recharts";


export default function PublicPortfolio() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || "/api";
    axios.get(`${apiUrl}/candidate/portfolio/${slug}`)
      .then((res) => {
        setData(res.data);
      })
      .catch((err) => {
        console.error("Public portfolio fetch error:", err);
        setError("Candidate profile or portfolio not found.");
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-3 text-slate-500 font-medium">Loading Placement Passport...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Portfolio Not Found</h2>
          <p className="mt-2 text-sm text-slate-500">{error || "The requested portfolio does not exist."}</p>
        </div>
      </div>
    );
  }

  const { profile, applications } = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8 flex items-center justify-center">
      <div className="w-full max-w-4xl grid gap-6 md:grid-cols-3">
        
        {/* Placement Passport Card */}
        <div className="md:col-span-2 relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl flex flex-col justify-between">
          {/* Decorative Header */}
          <div className="h-3 bg-gradient-to-r from-blue-600 to-indigo-600"></div>
          
          <div className="p-6 flex-1 flex flex-col justify-between gap-6">
            <div className="flex flex-col sm:flex-row gap-5 items-start justify-between">
              
              {/* Profile Image & Meta */}
              <div className="flex gap-4 items-start">
                <div className="h-20 w-20 rounded-full bg-slate-200 border-2 border-slate-300 overflow-hidden shrink-0 flex items-center justify-center text-slate-400 font-bold text-2xl">
                  {profile.photo_url ? (
                    <img src={profile.photo_url} alt={profile.user?.name} className="h-full w-full object-cover" />
                  ) : (
                    profile.user?.name?.charAt(0) || "U"
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-extrabold text-slate-900">{profile.user?.name}</h1>
                    {profile.documents_verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black text-emerald-600 border border-emerald-500/20 shadow-xs backdrop-blur-xs">
                        <CheckCircle className="h-3.5 w-3.5 fill-emerald-600/10" /> TPO VERIFIED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-black text-amber-600 border border-amber-500/20 shadow-xs backdrop-blur-xs">
                        Pending Verification
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-blue-600">{profile.branch} Department</p>
                  <p className="mt-1 text-xs text-slate-400 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {profile.college?.name} ({profile.college?.code})
                  </p>
                  
                  {/* Social Links */}
                  {(profile.github_url || profile.linkedin_url || profile.portfolio_url) && (
                    <div className="flex items-center gap-2 mt-2">
                      {profile.github_url && (
                        <a href={profile.github_url} target="_blank" rel="noreferrer" className="rounded-full bg-slate-50 p-1.5 text-slate-600 hover:bg-slate-100 transition" title="GitHub">
                          <Github className="h-4 w-4" />
                        </a>
                      )}
                      {profile.linkedin_url && (
                        <a href={profile.linkedin_url} target="_blank" rel="noreferrer" className="rounded-full bg-slate-50 p-1.5 text-slate-600 hover:bg-slate-100 transition" title="LinkedIn">
                          <Linkedin className="h-4 w-4" />
                        </a>
                      )}
                      {profile.portfolio_url && (
                        <a href={profile.portfolio_url} target="_blank" rel="noreferrer" className="rounded-full bg-slate-50 p-1.5 text-slate-600 hover:bg-slate-100 transition" title="Portfolio Website">
                          <Globe className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* QR Code Container */}
              <div className="flex flex-col items-center border border-slate-100 bg-slate-50/50 p-2 rounded-lg shrink-0 self-center sm:self-auto">
                <QRCodeSVG value={typeof window !== "undefined" ? window.location.href : ""} size={80} />
                <span className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                  <QrCode className="h-2.5 w-2.5" /> Scan Profile
                </span>
              </div>
            </div>

            {/* Bio Display */}
            {profile.bio && (
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3.5 text-xs text-slate-600 italic">
                "{profile.bio}"
              </div>
            )}

            {/* Academic Matrix Grid */}
            <div className="grid grid-cols-3 gap-4 border-y border-slate-100 py-4">
              <div className="text-center">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">CGPA</div>
                <div className="mt-1 text-lg font-black text-slate-900">{profile.cgpa}</div>
              </div>
              <div className="text-center border-x border-slate-100">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Grad Year</div>
                <div className="mt-1 text-lg font-black text-slate-900">{profile.graduation_year}</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Status</div>
                <div className="mt-1 text-xs font-bold text-green-600 uppercase flex justify-center items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span> Ready
                </div>
              </div>
            </div>

            {/* Skills & Preferences */}
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Core Competencies</h3>
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills && Array.isArray(profile.skills) && profile.skills.length > 0 ? (
                    profile.skills.map((skill: string, index: number) => (
                      <span key={index} className="inline-block rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-400">No skills declared yet.</span>
                  )}
                </div>
              </div>

              {/* Showcase Projects */}
              {profile.projects && Array.isArray(profile.projects) && profile.projects.length > 0 && (
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Showcase Projects</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {profile.projects.map((proj: any, pidx: number) => (
                      <div key={pidx} className="rounded-xl border border-slate-100 bg-slate-50/30 p-3 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start gap-1.5">
                            <h4 className="font-bold text-xs text-slate-900 line-clamp-1">{proj.title}</h4>
                            {proj.url && (
                              <a href={proj.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline font-bold shrink-0 flex items-center gap-0.5">
                                <Globe className="h-2.5 w-2.5" /> Link
                              </a>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{proj.description}</p>
                        </div>
                        {proj.tech_stack && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(typeof proj.tech_stack === "string" ? proj.tech_stack.split(",") : proj.tech_stack).map((tag: string, tidx: number) => (
                              <span key={tidx} className="inline-block rounded bg-blue-50 px-1 py-0.5 text-[8px] font-bold text-blue-600">
                                {tag.trim()}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Academic Timeline Chart */}
              {profile.semester_grades && Array.isArray(profile.semester_grades) && profile.semester_grades.length > 0 && (
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5 text-blue-600" /> Academic Grade Timeline
                  </h3>
                  <div className="h-48 w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={profile.semester_grades} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis 
                          dataKey="semester" 
                          tickFormatter={(val) => `Sem ${val}`}
                          tick={{ fill: '#475569', fontSize: 9, fontWeight: 600 }} 
                        />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} domain={[0, 10]} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 10 }} />
                        <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: 600 }} />
                        <Line name="SGPA" type="monotone" dataKey="sgpa" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} />
                        <Line name="CGPA" type="monotone" dataKey="cgpa" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div className="bg-slate-50 border-t border-slate-100 p-4 flex justify-between items-center">
            <span className="text-xs text-slate-400 font-bold">VERIFIABLE PLACEMENT PASSPORT ID: {profile.id.slice(0, 8).toUpperCase()}</span>
            {profile.resume_url && (
              <a
                href={profile.resume_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow hover:bg-blue-700 transition"
              >
                <FileText className="h-3.5 w-3.5" /> View Resume
              </a>
            )}
          </div>
        </div>

        {/* Side Panel: Drives & History */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl flex flex-col justify-between">
          <div>
            {/* Skill Radar Profile */}
            {data.radarData && data.radarData.length > 0 && (
              <div className="border-b border-slate-100 pb-4 mb-4">
                <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5 text-blue-600" /> Skill Radar Profile
                </h2>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data.radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 8, fontWeight: 600 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 7 }} />
                      <Radar name="Skills" dataKey="score" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.4} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Subject Mastery Insights */}
            {((data.strengths && data.strengths.length > 0) || (data.weaknesses && data.weaknesses.length > 0)) && (
              <div className="border-b border-slate-100 pb-4 mb-4 space-y-3">
                <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5 text-indigo-600" /> Mastery Insights
                </h2>
                
                {/* Strengths */}
                {data.strengths && data.strengths.length > 0 && (
                  <div className="space-y-1.5">
                    {data.strengths.map((str: string, idx: number) => (
                      <div key={idx} className="flex gap-1.5 items-start text-[10px] text-slate-700 bg-emerald-50/50 border border-emerald-100/30 rounded-lg p-2">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{str}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Weaknesses */}
                {data.weaknesses && data.weaknesses.length > 0 && (
                  <div className="space-y-1.5">
                    {data.weaknesses.map((wk: string, idx: number) => (
                      <div key={idx} className="flex gap-1.5 items-start text-[10px] text-slate-700 bg-amber-50/50 border border-amber-100/30 rounded-lg p-2">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span>{wk}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-blue-600" /> Drive Participation
            </h2>
            
            <div className="space-y-3">
              {applications && applications.length > 0 ? (
                applications.map((app: any) => (
                  <div key={app.id} className="rounded-lg border border-slate-100 p-3 bg-slate-50/50 hover:bg-slate-50 transition">
                    <div className="font-bold text-slate-900 text-sm">{app.job?.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{app.job?.company_name}</div>
                    
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        app.status === "offered" ? "bg-green-100 text-green-800" :
                        app.status === "rejected" ? "bg-red-100 text-red-800" :
                        app.status === "shortlisted" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {app.status}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        {new Date(app.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-slate-400 text-sm">
                  No active drive participation logged yet.
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Powered by IntelliHire Verifiable Credentials</p>
          </div>
        </div>
      </div>
    </div>
  );
}

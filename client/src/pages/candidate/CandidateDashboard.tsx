import { useEffect, useState } from "react";
import { 
  BarChart3, Bell, Briefcase, CheckCircle, Loader2, MapPin, QrCode, Trophy, User, AlertCircle,
  Github, Linkedin, Globe, Plus, Trash2, Edit, X, FileText
} from "lucide-react";
import { Link } from "react-router-dom";
import { candidateApi, interviewApi } from "@/lib/api";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend 
} from "recharts";

export default function CandidateDashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [trackers, setTrackers] = useState<any[]>([]);
  const [radarData, setRadarData] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [peerPercentile, setPeerPercentile] = useState<number>(75);
  const [pendingInterview, setPendingInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Dynamic Performance Insights States
  const [strengths, setStrengths] = useState<string[]>([]);
  const [weaknesses, setWeaknesses] = useState<string[]>([]);

  // Activity Feed
  const [activityFeed, setActivityFeed] = useState<any[]>([]);

  // Pending Offers
  const [offers, setOffers] = useState<any[]>([]);
  const [respondingOffer, setRespondingOffer] = useState<string | null>(null);

  // Profile Edit Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState("");
  const [skillsInput, setSkillsInput] = useState("");
  const [domainPreference, setDomainPreference] = useState("");
  const [bio, setBio] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [semesterGrades, setSemesterGrades] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      candidateApi.getProfile(),
      candidateApi.getActionItems(),
      candidateApi.getJourneyTracker(),
      candidateApi.getPerformanceRadar(),
      interviewApi.pending(),
      candidateApi.getActivityFeed(),
      candidateApi.getOffers()
    ])
      .then(([profileRes, actionRes, trackerRes, radarRes, interviewRes, activityRes, offersRes]) => {
        const p = profileRes.data.profile || null;
        setProfile(p);
        if (p) {
          setPhone(p.phone || "");
          setSkillsInput(Array.isArray(p.skills) ? p.skills.join(", ") : "");
          setDomainPreference(p.domain_preference || "");
          setBio(p.bio || "");
          setGithubUrl(p.github_url || "");
          setLinkedinUrl(p.linkedin_url || "");
          setPortfolioUrl(p.portfolio_url || "");
          setProjectsList(Array.isArray(p.projects) ? p.projects : []);
          setSemesterGrades(Array.isArray(p.semester_grades) ? p.semester_grades : []);
        }
        setActionItems(actionRes.data.actionItems || []);
        setTrackers(trackerRes.data.trackers || []);
        setRadarData(radarRes.data.radarData || []);
        setTrendData(radarRes.data.trendData || []);
        setPeerPercentile(radarRes.data.peerPercentile || 75);
        setStrengths(radarRes.data.strengths || []);
        setWeaknesses(radarRes.data.weaknesses || []);
        setPendingInterview(interviewRes.data.interview || null);
        setActivityFeed(activityRes.data.feed || []);
        setOffers(offersRes.data.offers || []);
      })
      .catch(err => console.error("Dashboard fetch error:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-2 text-sm text-slate-500 font-medium">Loading Placement Dashboard...</p>
        </div>
      </div>
    );
  }

  // Derive public URL for portfolio
  const publicSlug = profile?.public_portfolio_slug || profile?.user_id || "";
  const publicPortfolioUrl = `${window.location.origin}/portfolio/${publicSlug}`;

  // Helper to resolve stages matching Kanban columns
  const getKanbanStageName = (currentStage: string) => {
    switch (currentStage) {
      case "registered": return "Applied";
      case "eligible": return "Eligible";
      case "exam_assigned": return "Exam Assigned";
      case "exam_taken": return "Exam Taken";
      case "shortlisted": return "Shortlisted";
      case "interview_scheduled": return "Interview Scheduled";
      case "offered": return "Selected";
      case "rejected": return "Rejected";
      default: return "Applied";
    }
  };

  const handleAddProject = () => {
    setProjectsList([...projectsList, { title: "", description: "", tech_stack: "", url: "" }]);
  };

  const handleRemoveProject = (index: number) => {
    setProjectsList(projectsList.filter((_, idx) => idx !== index));
  };

  const handleProjectChange = (index: number, key: string, value: string) => {
    const updated = [...projectsList];
    updated[index] = { ...updated[index], [key]: value };
    setProjectsList(updated);
  };

  const handleAddSemester = () => {
    setSemesterGrades([...semesterGrades, { semester: semesterGrades.length + 1, sgpa: "", cgpa: "" }]);
  };

  const handleRemoveSemester = (index: number) => {
    setSemesterGrades(semesterGrades.filter((_, idx) => idx !== index));
  };

  const handleSemesterChange = (index: number, key: string, value: string) => {
    const updated = [...semesterGrades];
    updated[index] = { ...updated[index], [key]: value };
    setSemesterGrades(updated);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const skillsArray = skillsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      // Cast grade fields to numbers
      const formattedSemesters = semesterGrades.map(s => ({
        semester: Number(s.semester),
        sgpa: Number(s.sgpa) || 0,
        cgpa: Number(s.cgpa) || 0
      })).sort((a, b) => a.semester - b.semester);

      const response = await candidateApi.updateProfile({
        phone,
        skills: skillsArray,
        domain_preference: domainPreference,
        bio,
        github_url: githubUrl,
        linkedin_url: linkedinUrl,
        portfolio_url: portfolioUrl,
        projects: projectsList,
        semester_grades: formattedSemesters,
      });

      setProfile(response.data.profile);
      setSemesterGrades(Array.isArray(response.data.profile.semester_grades) ? response.data.profile.semester_grades : []);
      toast.success("Placement Passport updated successfully!");
      setShowEditModal(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleRespondToOffer = async (jobId: string, response: string) => {
    const confirmation = window.confirm(
      `Are you sure you want to ${response === "accept" ? "ACCEPT" : "DECLINE"} this job offer?`
    );
    if (!confirmation) return;

    setRespondingOffer(`${jobId}-${response}`);
    try {
      await candidateApi.respondToOffer(jobId, response);
      toast.success(`Successfully ${response === "accept" ? "accepted" : "declined"} the job offer!`);
      
      // Refresh offers and activity feed
      const [offersRes, activityRes] = await Promise.all([
        candidateApi.getOffers(),
        candidateApi.getActivityFeed()
      ]);
      setOffers(offersRes.data.offers || []);
      setActivityFeed(activityRes.data.feed || []);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to respond to offer");
    } finally {
      setRespondingOffer(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Title Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Placement Command Center</h1>
          <p className="text-sm text-slate-500">Track your verified profile, pipeline stage eligibility, and proctored exam performance.</p>
        </div>
        <Button 
          onClick={() => setShowEditModal(true)} 
          className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg px-4 h-9 flex items-center gap-1.5 shadow-sm transition"
        >
          <Edit className="h-3.5 w-3.5" /> Edit Placement Passport
        </Button>
      </div>

      {/* Pending Interview Banner */}
      {pendingInterview && (
        <Link
          to="/candidate/interview"
          className="flex items-center gap-4 rounded-xl border border-blue-200 bg-blue-600 px-5 py-4 text-white shadow-md hover:bg-blue-700 transition"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Bell className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="font-bold">AI Interview Unlocked! 🎉</div>
            <div className="mt-0.5 text-xs text-blue-100">
              {pendingInterview.job?.company_name
                ? `${pendingInterview.job.title} at ${pendingInterview.job.company_name}`
                : "Your face-to-face AI placement interview session is active. Click to start."}
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-white px-4 py-2 text-xs font-bold text-blue-700">
            Start Interview
          </div>
        </Link>
      )}

      {/* Pending Job Offers */}
      {offers.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-extrabold text-slate-950 flex items-center gap-2 mb-2">
            <Trophy className="h-4 w-4 text-emerald-500 animate-bounce" /> Congratulations! You have pending Job Offers
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {offers.map((offer: any) => (
              <div 
                key={offer.id} 
                className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/40 to-white p-6 shadow-sm flex flex-col justify-between gap-4 transition-all duration-200 hover:shadow-md"
              >
                <div className="absolute right-0 top-0 h-16 w-16 overflow-hidden">
                  <div className="absolute transform rotate-45 bg-emerald-500 text-white text-[9px] font-black text-center py-1 w-24 -right-6 top-3 uppercase tracking-wider">
                    New Offer
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-emerald-600" />
                    <h3 className="text-base font-extrabold text-slate-900">{offer.job?.title}</h3>
                  </div>
                  <p className="text-sm font-bold text-emerald-700 mt-1">{offer.job?.company_name}</p>
                  
                  {/* Salary block if specified */}
                  {(offer.job?.salary_min || offer.job?.salary_max) && (
                    <p className="text-xs text-slate-500 mt-2 font-semibold">
                      Package: ₹{offer.job.salary_min ? `${offer.job.salary_min} LPA` : ""} 
                      {offer.job.salary_min && offer.job.salary_max ? " - " : ""} 
                      {offer.job.salary_max ? `${offer.job.salary_max} LPA` : ""}
                    </p>
                  )}

                  {offer.recruiter_notes && (
                    <div className="mt-3 text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-3 italic">
                      " {offer.recruiter_notes} "
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3.5 mt-2">
                  {offer.offer_letter_url && (
                    <a
                      href={offer.offer_letter_url.startsWith("http") ? offer.offer_letter_url : `${import.meta.env.VITE_API_URL?.replace("/api", "") || ""}${offer.offer_letter_url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition"
                    >
                      <FileText className="h-4 w-4 text-red-500" /> View Offer Letter PDF
                    </a>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleRespondToOffer(offer.job_id, "accept")}
                      disabled={respondingOffer !== null}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs h-9 rounded-lg shadow-sm"
                    >
                      {respondingOffer === `${offer.job_id}-accept` ? (
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      ) : (
                        "Accept Offer"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleRespondToOffer(offer.job_id, "decline")}
                      disabled={respondingOffer !== null}
                      className="flex-1 border-red-200 hover:bg-red-50 text-red-700 font-extrabold text-xs h-9 rounded-lg"
                    >
                      {respondingOffer === `${offer.job_id}-decline` ? (
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      ) : (
                        "Decline"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid: Placement Passport & Radar Chart */}
      <div className="grid gap-6 lg:grid-cols-3">
        
        {/* Placement Passport Card */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between">
          <div className="h-2 bg-gradient-to-r from-blue-600 to-indigo-600"></div>
          
          <div className="p-6 flex-1 flex flex-col justify-between gap-6">
            <div className="flex flex-col sm:flex-row gap-5 items-start justify-between">
              
              {/* Profile Details */}
              <div className="flex gap-4 items-start">
                <div className="h-16 w-16 rounded-full bg-slate-200 border-2 border-slate-300 overflow-hidden shrink-0 flex items-center justify-center text-slate-400 font-bold text-xl">
                  {profile?.photo_url ? (
                    <img src={profile.photo_url} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-8 w-8" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-900">{profile?.roll_number ? `Student ID: ${profile.roll_number}` : "Complete Onboarding"}</h2>
                    {profile?.documents_verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black text-emerald-600 border border-emerald-500/20 shadow-xs backdrop-blur-xs">
                        <CheckCircle className="h-3.5 w-3.5 fill-emerald-600/10" /> TPO VERIFIED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-black text-amber-600 border border-amber-500/20 shadow-xs backdrop-blur-xs">
                        Pending Verification
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-blue-600">{profile?.branch || "Department pending"}</p>
                  <p className="mt-0.5 text-xs text-slate-400 flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> IIT Campus Placement
                  </p>
                  
                  {/* Social Links */}
                  {(profile?.github_url || profile?.linkedin_url || profile?.portfolio_url) && (
                    <div className="flex items-center gap-2 mt-2">
                      {profile?.github_url && (
                        <a href={profile.github_url} target="_blank" rel="noreferrer" className="rounded-full bg-slate-50 p-1.5 text-slate-600 hover:bg-slate-100 transition" title="GitHub">
                          <Github className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {profile?.linkedin_url && (
                        <a href={profile.linkedin_url} target="_blank" rel="noreferrer" className="rounded-full bg-slate-50 p-1.5 text-slate-600 hover:bg-slate-100 transition" title="LinkedIn">
                          <Linkedin className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {profile?.portfolio_url && (
                        <a href={profile.portfolio_url} target="_blank" rel="noreferrer" className="rounded-full bg-slate-50 p-1.5 text-slate-600 hover:bg-slate-100 transition" title="Portfolio Website">
                          <Globe className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* QR Code Container */}
              <div className="flex flex-col items-center border border-slate-100 bg-slate-50 p-2 rounded-lg self-center sm:self-auto shrink-0">
                <QRCodeSVG value={publicPortfolioUrl} size={80} />
                <span className="mt-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-0.5">
                  <QrCode className="h-2.5 w-2.5" /> Share Profile
                </span>
              </div>
            </div>

            {/* Bio Display */}
            {profile?.bio && (
              <div className="rounded-lg bg-slate-50/50 border border-slate-100 p-3 text-xs text-slate-600 italic">
                "{profile.bio}"
              </div>
            )}

            {/* Academic stats */}
            <div className="grid grid-cols-3 gap-4 border-y border-slate-100 py-3 text-center">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CGPA</div>
                <div className="mt-0.5 text-md font-black text-slate-900">{profile?.cgpa || "N/A"}</div>
              </div>
              <div className="border-x border-slate-100">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Graduation</div>
                <div className="mt-0.5 text-md font-black text-slate-900">{profile?.graduation_year || "N/A"}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Placement Status</div>
                <div className="mt-0.5 text-xs font-bold text-green-600 uppercase flex justify-center items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500"></span> Ready
                </div>
              </div>
            </div>

            {/* Skills */}
            <div>
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Core Competencies</h3>
              <div className="flex flex-wrap gap-1.5">
                {profile?.skills && Array.isArray(profile.skills) && profile.skills.length > 0 ? (
                  profile.skills.map((skill: string, index: number) => (
                    <span key={index} className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">Complete onboarding to declare skills.</span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border-t border-slate-100 p-4 flex flex-col sm:flex-row gap-3 justify-between items-center text-xs">
            <span className="text-slate-400 font-bold tracking-wider">SHAREABLE PORTFOLIO LINK:</span>
            <a 
              href={publicPortfolioUrl} 
              target="_blank" 
              rel="noreferrer" 
              className="text-blue-600 hover:text-blue-700 font-bold underline break-all"
            >
              {publicPortfolioUrl}
            </a>
          </div>
        </div>

        {/* Radar Skills Evaluation */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-slate-950 flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
              <BarChart3 className="h-4 w-4 text-blue-600" /> Skill Radar Profile
            </h2>
            <div className="h-56">
              {radarData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 10, fontWeight: 600 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 8 }} />
                    <Radar name="Skills" dataKey="score" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.4} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-400">
                  Insufficient evaluation data to generate skill radar.
                </div>
              )}
            </div>
          </div>
          <p className="text-[10px] text-slate-400 text-center font-bold uppercase tracking-wider mt-2">Compiled across proctored exam attempts</p>
        </div>
      </div>

      {/* Grid: Academic Timeline & Subject Mastery Insights */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Academic Timeline Card */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-slate-950 flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
              <BarChart3 className="h-4 w-4 text-blue-600" /> Academic Timeline (SGPA &amp; CGPA Progression)
            </h2>
            <div className="h-64">
              {semesterGrades.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={semesterGrades} margin={{ top: 15, right: 15, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                      dataKey="semester" 
                      tickFormatter={(val) => `Sem ${val}`}
                      tick={{ fill: '#475569', fontSize: 10, fontWeight: 600 }} 
                    />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[0, 10]} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                    <Line name="SGPA" type="monotone" dataKey="sgpa" stroke="#3b82f6" strokeWidth={3} activeDot={{ r: 6 }} dot={{ r: 4 }} />
                    <Line name="CGPA" type="monotone" dataKey="cgpa" stroke="#10b981" strokeWidth={3} activeDot={{ r: 6 }} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-xs text-slate-400 gap-2">
                  <p>No academic timeline data declared yet.</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowEditModal(true)} 
                    className="text-[10px] h-7 border-slate-200 text-slate-600 hover:bg-slate-50 font-bold animate-pulse"
                  >
                    Edit Profile to Add Semesters
                  </Button>
                </div>
              )}
            </div>
          </div>
          <p className="text-[10px] text-slate-400 text-center font-bold uppercase tracking-wider mt-2">Verifiable semester-wise grade sheet indices</p>
        </div>

        {/* AI Performance Insights Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-slate-950 flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
              <Trophy className="h-4 w-4 text-indigo-600" /> Subject Mastery Insights
            </h2>
            
            <div className="space-y-4">
              {/* Strengths */}
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Verified Strengths
                </h3>
                <div className="space-y-2">
                  {strengths.length > 0 ? (
                    strengths.map((str, idx) => (
                      <div key={idx} className="flex gap-2 items-start text-xs text-slate-700 bg-emerald-50/50 border border-emerald-100/50 rounded-lg p-2.5">
                        <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{str}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">No evaluated strengths yet.</p>
                  )}
                </div>
              </div>

              {/* Weaknesses */}
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span> Improvement Areas
                </h3>
                <div className="space-y-2">
                  {weaknesses.length > 0 ? (
                    weaknesses.map((wk, idx) => (
                      <div key={idx} className="flex gap-2 items-start text-xs text-slate-700 bg-amber-50/50 border border-amber-100/50 rounded-lg p-2.5">
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>{wk}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">No evaluated improvement areas yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 text-center font-bold uppercase tracking-wider mt-2">Dynamic performance feedback analytics</p>
        </div>
      </div>

      {/* Grid: Action Items & Peer Percentile */}
      <div className="grid gap-6 md:grid-cols-3">
        
        {/* Action Items List */}
        <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-extrabold text-slate-950 flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
            <AlertCircle className="h-4 w-4 text-red-500" /> High-Priority Actions
          </h2>
          
          <div className="space-y-3">
            {actionItems.length > 0 ? (
              actionItems.map((item, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center rounded-lg border border-slate-100 p-3 bg-slate-50/50 hover:bg-slate-50 transition">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${item.priority === 'urgent' ? 'bg-red-500' : 'bg-amber-500'}`}></span>
                      <h4 className="font-bold text-sm text-slate-900">{item.title}</h4>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{item.description}</p>
                  </div>
                  {item.action_url && (
                    <Link
                      to={item.action_url}
                      className="rounded-md bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-xs font-bold text-white shadow shrink-0 self-end sm:self-auto"
                    >
                      Resolve Action
                    </Link>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-slate-400 text-xs">
                Awesome! You have no pending action items. Your profile is ready.
              </div>
            )}
          </div>
        </div>

        {/* Peer Percentile & Trend */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <h2 className="text-sm font-extrabold text-slate-950 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Trophy className="h-4 w-4 text-amber-500" /> Rank &amp; Percentile
            </h2>
            
            <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-xl p-4 border border-amber-100 text-center">
              <div className="text-xs font-bold text-amber-800 uppercase tracking-wide">College Percentile</div>
              <div className="text-3xl font-black text-amber-900 mt-1">{peerPercentile}%</div>
              <p className="text-[10px] text-amber-700 mt-1 font-semibold">You are scoring higher than {peerPercentile}% of peers in your batch.</p>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">DSA Score Trend</div>
              <div className="h-28">
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 8 }} />
                      <YAxis tick={{ fontSize: 8 }} domain={[0, 100]} />
                      <Tooltip />
                      <Line type="monotone" dataKey="score" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">
                    No score history.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-extrabold text-slate-950 flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
          <Bell className="h-4 w-4 text-blue-600" /> Recent Activity
        </h2>
        <div className="space-y-3">
          {activityFeed.length > 0 ? (
            activityFeed.map((item: any, idx: number) => (
              <div key={idx} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3 bg-slate-50/50 hover:bg-slate-50 transition">
                <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                  item.type?.includes('offer') ? 'bg-emerald-500' :
                  item.type?.includes('exam') ? 'bg-blue-500' :
                  item.type?.includes('interview') ? 'bg-purple-500' :
                  'bg-slate-400'
                }`} />
                <div className="min-w-0">
                  <h4 className="font-bold text-sm text-slate-900">{item.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {item.actorName ? `By ${item.actorName} • ` : ''}
                    {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-slate-400 text-xs">
              No recent activity yet. Your placement journey events will appear here.
            </div>
          )}
        </div>
      </div>

      {/* Visual Journey Pipeline trackers */}
      {trackers.length > 0 && (
        <div className="space-y-5">
          <h2 className="text-sm font-extrabold text-slate-950 flex items-center gap-2 border-b border-slate-100 pb-2">
            <Briefcase className="h-4 w-4 text-blue-600" /> Active Placement Pipelines
          </h2>

          <div className="space-y-6">
            {trackers.map((track, idx) => (
              <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-extrabold text-slate-950 text-md">{track.jobTitle}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{track.companyName}</p>
                  </div>
                  <span className="inline-block rounded-md bg-blue-50 border border-blue-200 px-2.5 py-1 text-[10px] font-black uppercase text-blue-700">
                    Current stage: {getKanbanStageName(track.currentStage)}
                  </span>
                </div>

                {/* Horizontal journey nodes */}
                <div className="relative pt-4 pb-2">
                  <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-1 bg-slate-100 -z-10"></div>
                  <div className="flex justify-between items-center">
                    {track.stages.map((stage: any, sidx: number) => (
                      <div key={sidx} className="flex flex-col items-center text-center">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition ${
                          stage.completed 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm' 
                            : 'bg-white border-slate-200 text-slate-400'
                        }`}>
                          {sidx + 1}
                        </div>
                        <span className={`text-[10px] font-bold mt-2 ${stage.completed ? 'text-slate-900' : 'text-slate-400'}`}>{stage.name}</span>
                        {stage.date && (
                          <span className="text-[8px] text-slate-400 mt-0.5">
                            {new Date(stage.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects Showcase Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <h2 className="text-sm font-extrabold text-slate-950 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-blue-600" /> Featured Projects
          </h2>
          <Button 
            onClick={() => setShowEditModal(true)} 
            variant="outline" 
            className="h-7 text-[10px] font-bold border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1 rounded-md"
          >
            <Plus className="h-3 w-3" /> Manage Projects
          </Button>
        </div>

        {projectsList.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {projectsList.map((proj, pidx) => (
              <div key={pidx} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:shadow-sm transition flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="font-extrabold text-sm text-slate-900 line-clamp-1">{proj.title}</h4>
                    {proj.url && (
                      <a href={proj.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline font-bold shrink-0 flex items-center gap-0.5">
                        <Globe className="h-3 w-3" /> Link
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2 line-clamp-3">{proj.description}</p>
                </div>
                {proj.tech_stack && (
                  <div className="flex flex-wrap gap-1 mt-3.5 pt-2 border-t border-slate-50">
                    {(typeof proj.tech_stack === "string" ? proj.tech_stack.split(",") : proj.tech_stack).map((tag: string, tidx: number) => (
                      <span key={tidx} className="inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-600">
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-xs text-slate-400">
            No projects added yet. Click "Manage Projects" to showcase your developer projects to recruiters.
          </div>
        )}
      </div>

      {/* Drive Application Kanban Board */}
      <div className="space-y-3">
        <h2 className="text-sm font-extrabold text-slate-950 flex items-center gap-2 border-b border-slate-100 pb-2">
          <Briefcase className="h-4 w-4 text-blue-600" /> Drive Status Board (Kanban)
        </h2>
        
        <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6 overflow-x-auto pb-4">
          
          {/* Column definitions mapping Kanban stages */}
          {[
            { title: "Applied", stage: "registered", color: "bg-slate-100 text-slate-800" },
            { title: "Eligible", stage: "eligible", color: "bg-blue-100 text-blue-800" },
            { title: "Exam Assigned", stage: "exam_assigned", color: "bg-purple-100 text-purple-800" },
            { title: "Exam Taken", stage: "exam_taken", color: "bg-indigo-100 text-indigo-800" },
            { title: "Shortlisted", stage: "shortlisted", color: "bg-amber-100 text-amber-800" },
            { title: "Selected", stage: "offered", color: "bg-green-100 text-green-800" }
          ].map((col, cidx) => {
            const drivesInStage = trackers.filter(t => t.currentStage === col.stage);
            return (
              <div key={cidx} className="min-w-[200px] rounded-xl border border-slate-200 bg-slate-50/50 p-4 shrink-0 flex flex-col justify-start">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">{col.title}</h3>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${col.color}`}>
                    {drivesInStage.length}
                  </span>
                </div>

                <div className="space-y-2 flex-1">
                  {drivesInStage.length > 0 ? (
                    drivesInStage.map((d, didx) => (
                      <div key={didx} className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs space-y-2">
                        <div className="font-bold text-xs text-slate-900">{d.jobTitle}</div>
                        <div className="text-[10px] text-slate-400 font-semibold">{d.companyName}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-[10px] text-slate-400 font-medium italic border border-dashed border-slate-200 rounded-lg">
                      Empty stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Edit Placement Passport Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 my-8">
            {/* Close Button */}
            <button
              onClick={() => setShowEditModal(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 transition"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-5 pb-3 border-b border-slate-100">
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Edit Placement Passport</h2>
              <p className="text-[11px] text-slate-400 font-semibold">Update your professional details and showcase projects for recruiter matching.</p>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-bold text-slate-700">Contact Number</Label>
                  <Input 
                    type="text" 
                    value={phone} 
                    onChange={(e) => setPhone(e.target.value)} 
                    placeholder="Enter phone number" 
                    className="mt-1 h-9 text-xs font-semibold"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-700">Domain Preference</Label>
                  <Input 
                    type="text" 
                    value={domainPreference} 
                    onChange={(e) => setDomainPreference(e.target.value)} 
                    placeholder="e.g. Frontend Developer, Data Engineer" 
                    className="mt-1 h-9 text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700">Professional Bio</Label>
                <Textarea 
                  value={bio} 
                  onChange={(e) => setBio(e.target.value)} 
                  placeholder="Tell recruiters about yourself, your career goals, or technical interests..." 
                  className="mt-1 text-xs font-semibold min-h-[60px]"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700">Technical Skills (comma-separated)</Label>
                <Input 
                  type="text" 
                  value={skillsInput} 
                  onChange={(e) => setSkillsInput(e.target.value)} 
                  placeholder="e.g. React, Node.js, Python, PostgreSQL" 
                  className="mt-1 h-9 text-xs font-semibold"
                />
              </div>

              <div className="h-px bg-slate-100" />

              <div className="space-y-3">
                <Label className="text-xs font-extrabold text-slate-900 tracking-tight">Social Profiles</Label>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label className="text-[10px] font-bold text-slate-500">GitHub Profile URL</Label>
                    <div className="relative mt-1">
                      <Github size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input 
                        type="url" 
                        value={githubUrl} 
                        onChange={(e) => setGithubUrl(e.target.value)} 
                        placeholder="https://github.com/..." 
                        className="h-9 pl-8 text-xs font-semibold"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-slate-500">LinkedIn Profile URL</Label>
                    <div className="relative mt-1">
                      <Linkedin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input 
                        type="url" 
                        value={linkedinUrl} 
                        onChange={(e) => setLinkedinUrl(e.target.value)} 
                        placeholder="https://linkedin.com/in/..." 
                        className="h-9 pl-8 text-xs font-semibold"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-slate-500">Personal Website URL</Label>
                    <div className="relative mt-1">
                      <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input 
                        type="url" 
                        value={portfolioUrl} 
                        onChange={(e) => setPortfolioUrl(e.target.value)} 
                        placeholder="https://yourwebsite.com" 
                        className="h-9 pl-8 text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-slate-100" />

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-extrabold text-slate-900 tracking-tight">Academic Timeline (Semester-wise Grades)</Label>
                  <Button 
                    type="button" 
                    onClick={handleAddSemester} 
                    variant="outline" 
                    className="h-7 text-[10px] font-bold border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1 rounded-md"
                  >
                    <Plus className="h-3 w-3" /> Add Semester
                  </Button>
                </div>

                {semesterGrades.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {semesterGrades.map((sem, index) => (
                      <div key={index} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 space-y-3 relative animate-in fade-in zoom-in-95 duration-150 flex flex-col justify-between">
                        <button
                          type="button"
                          onClick={() => handleRemoveSemester(index)}
                          className="absolute right-2 top-2 text-slate-400 hover:text-red-500 transition"
                          title="Remove Semester"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>

                        <div className="grid grid-cols-3 gap-2 pt-2">
                          <div>
                            <Label className="text-[9px] font-bold text-slate-500">Semester</Label>
                            <Input 
                              type="number" 
                              required
                              min="1"
                              max="10"
                              value={sem.semester} 
                              onChange={(e) => handleSemesterChange(index, "semester", e.target.value)} 
                              placeholder="1" 
                              className="mt-1 h-8 text-xs font-semibold bg-white"
                            />
                          </div>
                          <div>
                            <Label className="text-[9px] font-bold text-slate-500">SGPA</Label>
                            <Input 
                              type="number" 
                              required
                              step="0.01"
                              min="0"
                              max="10"
                              value={sem.sgpa} 
                              onChange={(e) => handleSemesterChange(index, "sgpa", e.target.value)} 
                              placeholder="9.00" 
                              className="mt-1 h-8 text-xs font-semibold bg-white"
                            />
                          </div>
                          <div>
                            <Label className="text-[9px] font-bold text-slate-500">CGPA</Label>
                            <Input 
                              type="number" 
                              required
                              step="0.01"
                              min="0"
                              max="10"
                              value={sem.cgpa} 
                              onChange={(e) => handleSemesterChange(index, "cgpa", e.target.value)} 
                              placeholder="9.00" 
                              className="mt-1 h-8 text-xs font-semibold bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No semesters added. Click "Add Semester" to build your academic timeline.</p>
                )}
              </div>

              <div className="h-px bg-slate-100" />

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-extrabold text-slate-900 tracking-tight">Showcase Projects</Label>
                  <Button 
                    type="button" 
                    onClick={handleAddProject} 
                    variant="outline" 
                    className="h-7 text-[10px] font-bold border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1 rounded-md"
                  >
                    <Plus className="h-3 w-3" /> Add Project
                  </Button>
                </div>

                {projectsList.length > 0 ? (
                  <div className="space-y-4">
                    {projectsList.map((proj, index) => (
                      <div key={index} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3 relative animate-in fade-in zoom-in-95 duration-150">
                        <button
                          type="button"
                          onClick={() => handleRemoveProject(index)}
                          className="absolute right-3 top-3 text-slate-400 hover:text-red-500 transition"
                          title="Remove Project"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label className="text-[10px] font-bold text-slate-500">Project Title</Label>
                            <Input 
                              type="text" 
                              required
                              value={proj.title} 
                              onChange={(e) => handleProjectChange(index, "title", e.target.value)} 
                              placeholder="e.g. Portfolio Website, Chat App" 
                              className="mt-1 h-8 text-xs font-semibold bg-white"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] font-bold text-slate-500">Project URL / GitHub Link</Label>
                            <Input 
                              type="url" 
                              value={proj.url || ""} 
                              onChange={(e) => handleProjectChange(index, "url", e.target.value)} 
                              placeholder="https://..." 
                              className="mt-1 h-8 text-xs font-semibold bg-white"
                            />
                          </div>
                        </div>

                        <div>
                          <Label className="text-[10px] font-bold text-slate-500">Project Description</Label>
                          <Textarea 
                            required
                            value={proj.description} 
                            onChange={(e) => handleProjectChange(index, "description", e.target.value)} 
                            placeholder="Briefly describe the purpose of the project, features, and key architecture..." 
                            className="mt-1 text-xs font-semibold min-h-[50px] bg-white"
                          />
                        </div>

                        <div>
                          <Label className="text-[10px] font-bold text-slate-500">Technologies Used (comma-separated)</Label>
                          <Input 
                            type="text" 
                            value={proj.tech_stack || ""} 
                            onChange={(e) => handleProjectChange(index, "tech_stack", e.target.value)} 
                            placeholder="e.g. React, Express, MongoDB" 
                            className="mt-1 h-8 text-xs font-semibold bg-white"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No projects added. Click "Add Project" to display your work.</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3.5 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditModal(false)}
                  className="h-9 text-xs font-bold border-slate-200 text-slate-600 rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="h-9 text-xs font-extrabold bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 shadow-sm"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

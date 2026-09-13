import datetime
import os
import re
import uuid
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
import pdfplumber

from ..auth_router import get_current_user
from ..db import db
from ..upload_validation import read_validated_pdf
from ..utils import storage_root, hash_password
from ..validation import get_password_validation_error

router = APIRouter(prefix="/api/candidate", tags=["candidate_profile"])

class UpdateProfileRequest(BaseModel):
    phone: Optional[str] = None
    skills: Optional[List[str]] = None
    domain_preference: Optional[str] = None
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    bio: Optional[str] = None
    photo_url: Optional[str] = None
    projects: Optional[List[Dict[str, Any]]] = None
    semester_grades: Optional[List[Dict[str, Any]]] = None

class OnboardingRequest(BaseModel):
    password: str
    phone: str
    skills: List[str]
    domain_preference: str
    marksheet_url: Optional[str] = None
    resume_url: Optional[str] = None

def check_ats_parseability(text: str, meta: dict = None) -> dict:
    meta = meta or {}
    issues = []
    lines = text.split("\n")
    non_empty_lines = [l for l in lines if l.strip()]
    if meta.get("numPages") and meta["numPages"] > 0 and len(text) / meta["numPages"] < 400:
        issues.append({"severity": "high", "msg": "Very little extractable text per page — resume may be scanned, image-based, or rely on graphics that ATS can't read."})
    short_fragment_lines = [l for l in non_empty_lines if len(l.strip()) <= 3]
    if non_empty_lines and (len(short_fragment_lines) / len(non_empty_lines)) > 0.25:
        issues.append({"severity": "medium", "msg": "Many short/fragmented lines detected — often indicates a complex multi-column or table layout."})
    non_ascii = [c for c in text if ord(c) > 127]
    if len(non_ascii) / max(1, len(text)) > 0.03:
        issues.append({"severity": "low", "msg": "Noticeable amount of special/non-standard characters detected."})
    if not re.search(r"\b(experience|education|skills|projects|summary)\b", text, re.IGNORECASE):
        issues.append({"severity": "high", "msg": "No standard section headers detected."})
    if text.count("\t") > 20:
        issues.append({"severity": "low", "msg": "Heavy tab key usage detected."})
    penalty = sum(30 if i["severity"] == "high" else 15 if i["severity"] == "medium" else 5 for i in issues)
    return {"score": max(0, 100 - penalty), "issues": issues}

DEGREE_RE = re.compile(r"\b(b\.?tech|m\.?tech|b\.?e|m\.?e|b\.?sc|m\.?sc|bca|mca|mba|ph\.?d|bachelor'?s?|master'?s?|diploma)\b", re.IGNORECASE)
CGPA_RE = re.compile(r"\b(cgpa|gpa)\s*[:-]?\s*(\d\.\d{1,2})\s*(\/\s*(\d+(\.\d+)?))?", re.IGNORECASE)
YEAR_RANGE_RE = re.compile(r"\b((19|20)\d{2})\s?(-|–|to)\s?((19|20)\d{2}|present|current)\b", re.IGNORECASE)
YEAR_ONLY_RE = re.compile(r"\b(19|20)\d{2}\b")

def extract_education(text: str) -> List[dict]:
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    entries = []
    for line in lines:
        if DEGREE_RE.search(line):
            cgpa_m = CGPA_RE.search(line)
            year_m = YEAR_RANGE_RE.search(line) or YEAR_ONLY_RE.search(line)
            deg_m = DEGREE_RE.search(line)
            entries.append({"raw": line, "degree": deg_m.group(0) if deg_m else None, "cgpa": cgpa_m.group(2) if cgpa_m else None, "cgpaScale": cgpa_m.group(4) if cgpa_m and cgpa_m.group(4) else None, "years": year_m.group(0) if year_m else None})
    return entries

def extract_timeline(text: str) -> dict:
    ranges = []
    for match in YEAR_RANGE_RE.finditer(text):
        start_year = int(match.group(1))
        end_raw = match.group(4).lower()
        end_year = datetime.datetime.utcnow().year if "present" in end_raw or "current" in end_raw else int(end_raw)
        ranges.append({"raw": match.group(0), "startYear": start_year, "endYear": end_year})
    ranges.sort(key=lambda x: x["startYear"])
    gaps = []
    for i in range(1, len(ranges)):
        prev_end = ranges[i-1]["endYear"]
        curr_start = ranges[i]["startYear"]
        if curr_start - prev_end >= 1: gaps.append({"from": prev_end, "to": curr_start, "years": curr_start - prev_end})
    return {"ranges": ranges, "gaps": gaps}

PASSIVE_RE = re.compile(r"\b(was|were|been|being|is|are)\s+\w+ed\b", re.IGNORECASE)
def detect_passive_voice(text: str) -> dict:
    matches = PASSIVE_RE.findall(text)
    return {"count": len(matches), "examples": matches[:5]}

def detect_verb_repetition(text: str, verbs: List[str]) -> List[dict]:
    counts = {}
    lower = text.lower()
    for verb in verbs:
        matches = re.findall(rf"\b{re.escape(verb)}\b", lower, re.IGNORECASE)
        if matches: counts[verb] = len(matches)
    return [{"verb": k, "count": v} for k, v in counts.items() if v >= 4]

@router.get("/profile")
async def get_profile(user: Dict[str, Any] = Depends(get_current_user)):
    user_res = await db.from_("users").select("id, name, email, roll_number, college_id, profile_complete, must_change_password").eq("id", user["id"]).single()
    prof_res = await db.from_("candidate_profiles").select("*, college:college_id(id, name, code)").eq("user_id", user["id"]).maybeSingle()
    return {"user": user_res.data, "profile": prof_res.data}

@router.put("/profile")
async def update_profile(req: UpdateProfileRequest, user: Dict[str, Any] = Depends(get_current_user)):
    payload = {}
    for field in ["phone", "skills", "domain_preference", "github_url", "linkedin_url", "portfolio_url", "bio", "photo_url", "projects", "semester_grades"]:
        value = getattr(req, field)
        if value is not None: payload[field] = value
    payload["updated_at"] = datetime.datetime.utcnow().isoformat() + "Z"
    up_res = await db.from_("candidate_profiles").update(payload).eq("user_id", user["id"]).select().single()
    if up_res.error: raise HTTPException(status_code=400, detail=up_res.error.get("message") or "Failed to update profile")
    return up_res.data

@router.post("/onboarding")
async def onboarding(req: OnboardingRequest, user: Dict[str, Any] = Depends(get_current_user)):
    pass_err = get_password_validation_error(req.password)
    if pass_err: raise HTTPException(status_code=400, detail=pass_err)
    pw_hash = hash_password(req.password)
    usr_res = await db.from_("users").update({"password_hash": pw_hash, "must_change_password": False, "profile_complete": True}).eq("id", user["id"]).select().single()
    if usr_res.error: raise HTTPException(status_code=400, detail=usr_res.error.get("message") or "Onboarding failed")
    profile_update = {"phone": req.phone, "skills": req.skills, "domain_preference": req.domain_preference, "marksheet_url": req.marksheet_url or None, "resume_url": req.resume_url or None, "profile_complete": True}
    prof_res = await db.from_("candidate_profiles").update(profile_update).eq("user_id", user["id"]).select().single()
    if prof_res.error: raise HTTPException(status_code=400, detail=prof_res.error.get("message") or "Onboarding failed")
    return prof_res.data

@router.post("/resume/upload")
async def upload_resume(resume: UploadFile = File(...), user: Dict[str, Any] = Depends(get_current_user)):
    file_bytes = await read_validated_pdf(resume)
    unique_name = f"{int(datetime.datetime.utcnow().timestamp())}-{uuid.uuid4().hex[:8]}.pdf"
    file_path = os.path.join(storage_root, "resumes", unique_name)
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "wb") as f: f.write(file_bytes)
    resume_url = f"/api/files/resumes/{unique_name}"
    parsed_text = ""
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages: parsed_text += page.extract_text() or ""
    except Exception as e:
        try: os.remove(file_path)
        except OSError: pass
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")
    if not parsed_text.strip():
        try: os.remove(file_path)
        except OSError: pass
        raise HTTPException(status_code=400, detail="Could not extract text from the PDF file. Please ensure it is not scanned or empty.")
    lower_text = parsed_text.lower()
    SYNONYM_MAP = {"JavaScript":["javascript","js","es6","ecmascript"],"TypeScript":["typescript","ts"],"Python":["python","py"],"Java":["java","jdk","jre"],"C++":["c++","cpp"],"C#":["c#","csharp","dotnet",".net"],"Go":["go","golang"],"Rust":["rust","rustlang"],"Ruby":["ruby","rails","ror"],"PHP":["php"],"Swift":["swift"],"Kotlin":["kotlin"],"SQL":["sql","mysql","postgresql","sqlite","oracle","mariadb"],"NoSQL":["nosql","mongodb","redis","cassandra"],"React":["react","reactjs","react.js"],"Angular":["angular","angularjs"],"Vue":["vue","vuejs"],"Next.js":["next.js","nextjs"],"Node.js":["node.js","nodejs"],"Express":["express","expressjs"],"Django":["django"],"Flask":["flask"],"Spring Boot":["spring boot","springboot"],"Laravel":["laravel"],"HTML":["html","html5"],"CSS":["css","css3","sass","scss"],"Tailwind CSS":["tailwind","tailwindcss"],"Bootstrap":["bootstrap"],"MongoDB":["mongodb","mongo"],"PostgreSQL":["postgresql","postgres"],"MySQL":["mysql"],"Redis":["redis"],"AWS":["aws","amazon web services"],"Azure":["azure"],"GCP":["gcp","google cloud"],"Docker":["docker","dockerfile"],"Kubernetes":["kubernetes","k8s"],"Git":["git","github","gitlab"],"CI/CD":["ci/cd","cicd"],"Machine Learning":["machine learning","ml"],"Deep Learning":["deep learning","dl"],"Data Science":["data science","pandas","numpy","scikit-learn"],"DSA":["dsa","data structures","algorithms"],"System Design":["system design","microservices"],"REST API":["rest api","graphql"]}
    header_patterns = {"experience":r"(experience|employment|work history|professional background|internships)","projects":r"(projects|personal projects|academic projects)","education":r"(education|academic background|university|college|degrees)","skills":r"(skills|technical skills|languages|technologies|proficiencies)"}
    sections = {}
    for key, pat in header_patterns.items():
        m = re.search(pat, lower_text, re.IGNORECASE); sections[key] = m.start() if m else -1
    def get_segment(start_key):
        start_idx = sections[start_key]
        if start_idx == -1: return ""
        end_idx = len(lower_text)
        for idx in sections.values():
            if idx > start_idx and idx < end_idx: end_idx = idx
        return lower_text[start_idx:end_idx]
    exp_seg, proj_seg = get_segment("experience"), get_segment("projects")
    extracted_skills, applied_skills = [], []
    for skill_name, synonyms in SYNONYM_MAP.items():
        is_matched = is_applied = False
        for syn in synonyms:
            esc = re.escape(syn)
            regex = re.compile(esc, re.IGNORECASE) if re.search(r"[^a-zA-Z0-9]", syn) else re.compile(rf"\b{esc}\b", re.IGNORECASE)
            if regex.search(lower_text):
                is_matched = True
                if (exp_seg and regex.search(exp_seg)) or (proj_seg and regex.search(proj_seg)): is_applied = True; break
        if is_matched:
            extracted_skills.append(skill_name)
            if is_applied: applied_skills.append(skill_name)
    has_email = bool(re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", lower_text)); has_phone = bool(re.search(r"\b(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b", lower_text)); has_github = "github.com/" in lower_text; has_linkedin = "linkedin.com/in/" in lower_text
    contact_score = (30 if has_email else 0)+(30 if has_phone else 0)+(20 if has_github else 0)+(20 if has_linkedin else 0)
    struct_score = (30 if sections["experience"] != -1 else 0)+(30 if sections["projects"] != -1 else 0)+(20 if sections["education"] != -1 else 0)+(20 if sections["skills"] != -1 else 0)
    words, word_count = lower_text.split(), len(lower_text.split()); density_score = 100 if 300 <= word_count <= 750 else 80 if 750 < word_count <= 1200 else 50 if word_count < 300 else 40
    verbs_list=["designed","developed","implemented","managed","built","optimized","created","led","architected","analyzed","deployed","spearheaded","engineered","streamlined"]; verb_count=sum(len(re.findall(rf"\b{v}\b",lower_text)) for v in verbs_list); verb_score=100 if verb_count>=8 else 75 if verb_count>=4 else 40
    metrics_count=len(re.findall(r"\b(?:\d{1,3}%|\d+\s*(?:users|requests|percent|seconds|ms|times|GB|MB|pages|students|endpoints))\b",lower_text,re.IGNORECASE)); metrics_score=100 if metrics_count>=3 else 65 if metrics_count>=1 else 30
    skill_depth_norm=min(100,round((min(25,sum(5 if s in applied_skills else 2 for s in extracted_skills))/25)*100))
    edu_score=40
    if sections["education"]!=-1:
        edu_seg=get_segment("education"); has_gpa=bool(re.search(r"\b\d+(?:\.\d+)?\s*(?:%|cgpa|gpa)\b",edu_seg,re.IGNORECASE)); has_deg=bool(re.search(r"\b(b\.?tech|b\.?e|b\.?s|m\.?tech|m\.?s|b\.?sc|mca|mba|bachelor|master)\b",edu_seg,re.IGNORECASE)); edu_score=100 if has_gpa and has_deg else 75 if has_deg or has_gpa else 50
    proj_score=0
    if sections["projects"]!=-1:
        proj_skills=[s for s in extracted_skills if re.search(re.escape(s),proj_seg,re.IGNORECASE)]; proj_score=100 if len(proj_skills)>=4 else 75 if len(proj_skills)>=2 else 50
    certs_cnt=len(re.findall(r"\b(certified|certification|award|scholarship|hackathon|rank|winner)\b",lower_text,re.IGNORECASE)); certs_score=100 if certs_cnt>=2 else 70 if certs_cnt==1 else 40
    buzz_cnt=len(re.findall(r"\b(team player|hard worker|self-motivated|detail-oriented)\b",lower_text,re.IGNORECASE)); buzz_score=100 if buzz_cnt==0 else 75 if buzz_cnt<=2 else 40
    years_cnt=len(set(re.findall(r"\b(201\d|202\d|2030)\b",lower_text))); timeline_score=100 if years_cnt>=3 else 70 if years_cnt>=1 else 30
    sentences=[s.strip() for s in re.split(r"[.!?\n]",parsed_text) if len(s.strip().split())>2]; avg_len=round(word_count/len(sentences)) if sentences else 0; readability_score=100 if 10<=avg_len<=22 else 75 if 22<avg_len<=30 else 50
    formatting_score=100 if lower_text.count("\n•")+lower_text.count("\n*")+lower_text.count("\n-")>=8 else 75; link_score=100 if len(set(re.findall(r"(github\.com|linkedin\.com|http|https)",lower_text)))>=3 else 70; balance_score=100; os_score=100 if any(t in lower_text for t in ["linux","git","docker"]) else 70; db_score=100 if any(d in lower_text for d in ["sql","database"]) else 70; devops_score=100 if any(d in lower_text for d in ["docker","aws","gcp"]) else 70; api_score=100 if any(a in lower_text for a in ["api","rest","graphql"]) else 70; dsa_score=100 if any(d in lower_text for d in ["dsa","complexity","algorithm"]) else 70
    ats_score_computed=round((contact_score*.08)+(struct_score*.08)+(density_score*.04)+(verb_score*.08)+(metrics_score*.08)+(skill_depth_norm*.15)+(edu_score*.04)+(proj_score*.08)+(certs_score*.04)+(buzz_score*.04)+(timeline_score*.04)+(readability_score*.02)+(100*.02)+(formatting_score*.02)+(link_score*.02)+(100*.01)+(100*.01)+(100*.01)+(100*.01)+(balance_score*.02)+(os_score*.01)+(db_score*.01)+(devops_score*.01)+(api_score*.01)+(dsa_score*.01))
    tier="Excellent" if ats_score_computed>=85 else "Good" if ats_score_computed>=70 else "Fair" if ats_score_computed>=50 else "Poor"
    up_res=await db.from_("candidate_profiles").update({"resume_url":resume_url,"skills":extracted_skills if extracted_skills else ["Software Engineering"],"resume_ats_analysis":{"atsScore":ats_score_computed,"tier":tier,"summary":f"Good profile showing matching skills: {', '.join(extracted_skills[:4])}." if ats_score_computed>=70 else "Fair profile setup.","gaps":["Database systems & SQL experience"] if "SQL" not in extracted_skills else ["No major gaps."],"suggestedRoles":["Backend Developer","Software Engineer"]}}).eq("user_id",user["id"]).select().single()
    if up_res.error:
        try: os.remove(file_path)
        except OSError: pass
        raise HTTPException(status_code=400,detail=up_res.error.get("message") or "Failed to update profile resume details")
    return {"message":"Resume parsed successfully","profile":up_res.data}

@router.delete("/resume")
async def delete_resume(user: Dict[str, Any] = Depends(get_current_user)):
    cur_res=await db.from_("candidate_profiles").select("resume_url").eq("user_id",user["id"]).maybeSingle()
    if cur_res.data and cur_res.data.get("resume_url"):
        fn=os.path.basename(cur_res.data["resume_url"]); filePath=os.path.join(storage_root,"resumes",fn)
        try: os.remove(filePath)
        except OSError: pass
    up_res=await db.from_("candidate_profiles").update({"resume_url":None,"resume_ats_analysis":None}).eq("user_id",user["id"]).select().single()
    return {"message":"Resume deleted successfully","profile":up_res.data}

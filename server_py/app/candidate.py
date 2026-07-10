import datetime
import math
import os
import re
import uuid
import shutil
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
import pdfplumber

from .auth_router import get_current_user
from .db import db
from .insights import (
    create_topic_scores,
    feed_mcq_answer,
    feed_coding_submission,
    feed_communication_score,
    generate_insights
)
from .utils import (
    storage_root,
    record_pipeline_stage,
    deserialize_drive_colleges,
    check_password,
    hash_password
)
from .websocket import send_realtime_notification

router = APIRouter(prefix="/api/candidate", tags=["candidate"])

class UpdateProfileRequest(BaseModel):
    phone: Optional[str] = None
    skills: Optional[List[str]] = []
    domain_preference: Optional[str] = None
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    bio: Optional[str] = None
    photo_url: Optional[str] = None
    projects: Optional[List[Dict[str, Any]]] = []
    semester_grades: Optional[List[Dict[str, Any]]] = []

class OnboardingRequest(BaseModel):
    password: str
    phone: str
    skills: List[str]
    domain_preference: str
    marksheet_url: Optional[str] = None
    resume_url: Optional[str] = None

class RespondOfferRequest(BaseModel):
    response: str  # accept, decline, negotiate
    notes: Optional[str] = None

def get_password_validation_error(password: str) -> str:
    if len(password) < 8:
        return "Password must be at least 8 characters long."
    if not any(char.isupper() for char in password):
        return "Password must contain at least one uppercase letter."
    if not any(char.islower() for char in password):
        return "Password must contain at least one lowercase letter."
    if not any(char.isdigit() for char in password):
        return "Password must contain at least one digit."
    return ""

def check_ats_parseability(text: str, meta: dict = None) -> dict:
    meta = meta or {}
    issues = []
    lines = text.split("\n")
    non_empty_lines = [l for l in lines if l.strip()]
    
    # 1. Low text yield
    if meta.get("numPages") and meta["numPages"] > 0:
        chars_per_page = len(text) / meta["numPages"]
        if chars_per_page < 400:
            issues.append({
                "severity": "high",
                "msg": "Very little extractable text per page — resume may be scanned, image-based, or rely on graphics that ATS can't read."
            })
            
    # 2. Fragmented lines (multi-column warning)
    short_fragment_lines = [l for l in non_empty_lines if len(l.strip()) <= 3]
    if non_empty_lines and (len(short_fragment_lines) / len(non_empty_lines)) > 0.25:
        issues.append({
            "severity": "medium",
            "msg": "Many short/fragmented lines detected — often indicates a complex multi-column or table layout which ATS reads out of order. Prefer a clean, single-column layout."
        })
        
    # 3. Special characters ratio
    non_ascii = [c for c in text if ord(c) > 127]
    non_ascii_ratio = len(non_ascii) / max(1, len(text))
    if non_ascii_ratio > 0.03:
        issues.append({
            "severity": "low",
            "msg": "Noticeable amount of special/non-standard characters detected — icons/glyphs used for section headers may not parse properly."
        })
        
    # 4. Missing headings
    has_any_header = bool(re.search(r"\b(experience|education|skills|projects|summary)\b", text, re.IGNORECASE))
    if not has_any_header:
        issues.append({
            "severity": "high",
            "msg": "No standard section headers detected. Ensure you use standard headers like Experience, Education, Skills, and Projects."
        })
        
    # 5. Heavy tab usage
    tab_count = text.count("\t")
    if tab_count > 20:
        issues.append({
            "severity": "low",
            "msg": "Heavy tab key usage detected — often a symptom of table formatting that may scramble on parsing."
        })
        
    penalty = sum(30 if i["severity"] == "high" else 15 if i["severity"] == "medium" else 5 for i in issues)
    score = max(0, 100 - penalty)
    
    return {"score": score, "issues": issues}

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
            entries.append({
                "raw": line,
                "degree": deg_m.group(0) if deg_m else None,
                "cgpa": cgpa_m.group(2) if cgpa_m else None,
                "cgpaScale": cgpa_m.group(4) if cgpa_m and cgpa_m.group(4) else None,
                "years": year_m.group(0) if year_m else None
            })
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
        if curr_start - prev_end >= 1:
            gaps.append({"from": prev_end, "to": curr_start, "years": curr_start - prev_end})
            
    return {"ranges": ranges, "gaps": gaps}

PASSIVE_RE = re.compile(r"\b(was|were|been|being|is|are)\s+\w+ed\b", re.IGNORECASE)
def detect_passive_voice(text: str) -> dict:
    matches = PASSIVE_RE.findall(text)
    return {"count": len(matches), "examples": matches[:5]}

def detect_verb_repetition(text: str, verbs: List[str]) -> List[dict]:
    counts = {}
    lower = text.toLowerCase() if hasattr(text, "toLowerCase") else text.lower()
    for verb in verbs:
        matches = re.findall(rf"\b{verb}\b", lower, re.IGNORECASE)
        if matches:
            counts[verb] = len(matches)
    overused = [{"verb": k, "count": v} for k, v in counts.items() if v >= 4]
    return overused

@router.get("/portfolio/{slug}")
async def get_portfolio(slug: str):
    is_uuid = bool(re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", slug, re.IGNORECASE))
    
    query = db.from_("candidate_profiles").select("id, user_id, photo_url, branch, cgpa, graduation_year, skills, resume_url, documents_verified, public_portfolio_slug, github_url, linkedin_url, portfolio_url, bio, projects, semester_grades, user:user_id(name), college:college_id(name, code)")
    if is_uuid:
        query = query.eq("user_id", slug)
    else:
        query = query.eq("public_portfolio_slug", slug)
        
    profile_res = await query.maybeSingle()
    if not profile_res.data:
        raise HTTPException(status_code=404, detail="Portfolio not found")
        
    profile = profile_res.data
    user_id = profile["user_id"]
    
    # Compile portfolio radar data
    ans_res = await db.from_("answers").select("*, question:question_id(topic), attempt:attempt_id(candidate_id)").eq("attempt.candidate_id", user_id)
    mcq_answers = ans_res.data or []
    
    ivs_res = await db.from_("ai_interviews").select("communication_score").eq("candidate_id", user_id).eq("status", "completed")
    interviews = ivs_res.data or []
    
    coding_res = await db.from_("coding_submissions").select("score, coding_questions(marks), attempt:attempt_id(candidate_id)").eq("attempt.candidate_id", user_id).eq("status", "tested")
    coding_subs = coding_res.data or []
    
    topic_scores = create_topic_scores()
    for iv in interviews:
        feed_communication_score(topic_scores, iv.get("communication_score") or 0)
    for ans in mcq_answers:
        q = ans.get("question") or {}
        feed_mcq_answer(topic_scores, bool(ans.get("is_correct")), q.get("topic"))
    for sub in coding_subs:
        q = sub.get("coding_questions") or {}
        max_m = float(q.get("marks") or 10.0)
        feed_coding_submission(topic_scores, float(sub.get("score") or 0.0), max_m)
        
    insights = generate_insights(topic_scores, "Profile")
    
    apps_res = await db.from_("candidate_status").select("id, status, updated_at, job:job_id(title, company_name)").eq("candidate_id", user_id)
    applications = apps_res.data or []
    
    return {
        "profile": profile,
        "applications": applications,
        "radarData": insights["radarData"],
        "strengths": insights["strengths"],
        "weaknesses": insights["weaknesses"]
    }

@router.get("/profile")
async def get_profile(user: Dict[str, Any] = Depends(get_current_user)):
    user_res = await db.from_("users").select("id, name, email, roll_number, college_id, profile_complete, must_change_password").eq("id", user["id"]).single()
    prof_res = await db.from_("candidate_profiles").select("*, college:college_id(id, name, code)").eq("user_id", user["id"]).maybeSingle()
    
    return {"user": user_res.data, "profile": prof_res.data}

@router.put("/profile")
async def update_profile(req: UpdateProfileRequest, user: Dict[str, Any] = Depends(get_current_user)):
    payload = {
        "phone": req.phone or None,
        "skills": req.skills or [],
        "domain_preference": req.domain_preference or None,
        "github_url": req.github_url or None,
        "linkedin_url": req.linkedin_url or None,
        "portfolio_url": req.portfolio_url or None,
        "bio": req.bio or None,
        "photo_url": req.photo_url or None,
        "projects": req.projects or [],
        "semester_grades": req.semester_grades or [],
        "updated_at": datetime.datetime.utcnow().isoformat() + "Z"
    }
    
    up_res = await db.from_("candidate_profiles").update(payload).eq("user_id", user["id"]).select().single()
    if up_res.error:
        raise HTTPException(status_code=400, detail=up_res.error.get("message") or "Failed to update profile")
    return up_res.data

@router.post("/onboarding")
async def onboarding(req: OnboardingRequest, user: Dict[str, Any] = Depends(get_current_user)):
    pass_err = get_password_validation_error(req.password)
    if pass_err:
        raise HTTPException(status_code=400, detail=pass_err)
        
    pw_hash = hash_password(req.password)
    
    # Update user account
    usr_res = await db.from_("users").update({
        "password_hash": pw_hash,
        "must_change_password": False,
        "profile_complete": True
    }).eq("id", user["id"]).select().single()
    
    # Update profile
    prof_res = await db.from_("candidate_profiles").update({
        "phone": req.phone,
        "skills": req.skills,
        "domain_preference": req.domain_preference,
        "marksheet_url": req.marksheet_url or None,
        "resume_url": req.resume_url or None,
        "profile_complete": True
    }).eq("user_id", user["id"]).select().single()
    
    if prof_res.error:
        raise HTTPException(status_code=400, detail=prof_res.error.get("message") or "Onboarding failed")
    return prof_res.data

@router.get("/dashboard")
async def get_dashboard(user: Dict[str, Any] = Depends(get_current_user)):
    uid = user["id"]
    
    assign_res = await db.from_("exam_assignments").select("*, exam:exam_id(id, title, description, duration, total_marks, pass_marks, available_from, available_until, status, shuffle_questions, negative_marking, created_at)").eq("candidate_id", uid)
    assignments = assign_res.data or []
    exam_ids = [a["exam_id"] for a in assignments if a.get("exam_id")]
    
    attempts = []
    if exam_ids:
        att_res = await db.from_("attempts").select("id, exam_id, status, score, started_at, submitted_at").eq("candidate_id", uid).in_("exam_id", exam_ids).order("started_at", ascending=False)
        attempts = att_res.data or []
        
    enriched = []
    for assign in assignments:
        assign_attempts = [att for att in attempts if att["exam_id"] == assign["exam_id"]]
        enriched.append({
            **assign,
            "attempts": assign_attempts
        })
        
    latest_attempts = [e["attempts"][0] for e in enriched if e.get("attempts")]
    
    completed_attempts = [e for e in enriched if e.get("attempts") and e["attempts"][0]["status"] == "completed"]
    in_progress_attempts = [e for e in enriched if e.get("attempts") and e["attempts"][0]["status"] == "in_progress"]
    pending_assignments = [e for e in enriched if not e.get("attempts")]
    
    performance = []
    for assign in completed_attempts:
        lat = assign["attempts"][0]
        score = float(lat.get("score") or 0.0)
        tot = float(assign["exam"]["total_marks"] or 100.0)
        pass_m = float(assign["exam"]["pass_marks"] or 0.0)
        pct = round((score / tot) * 100, 1) if tot else 0.0
        
        performance.append({
            "examId": assign["exam_id"],
            "title": assign["exam"]["title"],
            "score": score,
            "totalMarks": tot,
            "passMarks": pass_m,
            "percentage": pct,
            "submittedAt": lat.get("submitted_at"),
            "status": "pass" if score >= pass_m else "fail"
        })
        
    avg_score = round(sum(p["score"] for p in performance) / len(performance), 1) if performance else 0.0
    best_score = max(p["score"] for p in performance) if performance else 0.0
    pass_cnt = sum(1 for p in performance if p["status"] == "pass")
    compl_rate = round((len(completed_attempts) / len(enriched)) * 100, 1) if enriched else 0.0
    avg_pct = round(sum(p["percentage"] for p in performance) / len(performance), 1) if performance else 0.0
    
    bands = [
        {"label": "90-100", "min": 90, "max": 101},
        {"label": "75-89", "min": 75, "max": 90},
        {"label": "60-74", "min": 60, "max": 75},
        {"label": "Below 60", "min": 0, "max": 60}
    ]
    score_bands = []
    for b in bands:
        cnt = sum(1 for p in performance if b["min"] <= p["percentage"] < b["max"])
        score_bands.append({"label": b["label"], "exams": cnt})
        
    exam_insights = [{"label": p["title"], "score": p["percentage"], "status": p["status"]} for p in sorted(performance, key=lambda x: x["percentage"], reverse=True)]
    
    now_ms = datetime.datetime.utcnow().timestamp() * 1000
    upcoming_exams = []
    for assign in pending_assignments:
        avail = assign["exam"].get("available_from") or assign.get("assigned_at")
        opens_at = datetime.datetime.fromisoformat(avail.replace("Z", "+00:00")).timestamp() * 1000 if avail else now_ms
        days_left = max(0, int((opens_at - now_ms) / 86400000))
        meta = f"{days_left or 1} Day{'s' if days_left != 1 else ''} Left" if opens_at > now_ms else "Open Now"
        
        upcoming_exams.append({
            "id": assign["id"],
            "examId": assign["exam_id"],
            "title": assign["exam"]["title"],
            "subtitle": f"{avail[:10]} - {assign['exam'].get('duration')} min",
            "meta": meta,
            "tone": "violet" if opens_at > now_ms else "green",
            "date": avail
        })
    upcoming_exams.sort(key=lambda x: x["date"] or "")
    upcoming_exams = upcoming_exams[:5]
    
    recent_results = []
    for p in sorted(performance, key=lambda x: x["submittedAt"] or "", reverse=True)[:5]:
        recent_results.append({
            "id": p["examId"],
            "examId": p["examId"],
            "title": p["title"],
            "subtitle": p["submittedAt"][:10] if p["submittedAt"] else "",
            "meta": f"{p['percentage']}%",
            "tone": "green" if p["status"] == "pass" else "rose",
            "score": p["score"],
            "percentage": p["percentage"],
            "status": p["status"],
            "date": p["submittedAt"]
        })
        
    notifications = []
    for r in recent_results[:3]:
        notifications.append({
            "id": f"result-{r['examId']}",
            "title": f"Your result for {r['title']} has been published.",
            "subtitle": r["subtitle"],
            "tone": r["tone"],
            "date": r["date"]
        })
    for u in upcoming_exams[:3]:
        notifications.append({
            "id": f"exam-{u['examId']}",
            "title": f"New exam scheduled: {u['title']}.",
            "subtitle": u["subtitle"],
            "tone": "blue",
            "date": u["date"]
        })
    notifications.sort(key=lambda x: x["date"] or "", reverse=True)
    notifications = notifications[:4]
    
    leaderboard = []
    if exam_ids:
        lead_res = await db.from_("attempts").select("candidate_id, score, status, submitted_at, users:candidate_id(id, name, email), exams:exam_id(total_marks)").eq("status", "completed").in_("exam_id", exam_ids)
        leaderboard_attempts = lead_res.data or []
        
        lead_map = {}
        for att in leaderboard_attempts:
            cand = att.get("users") or {}
            exam = att.get("exams") or {}
            cid = att.get("candidate_id")
            if cid:
                if cid not in lead_map:
                    lead_map[cid] = {"candidateId": cid, "name": cand.get("name") or "Candidate", "email": cand.get("email") or "", "attempts": 0, "totalPercentage": 0.0}
                tot = float(exam.get("total_marks") or 100.0)
                lead_map[cid]["attempts"] += 1
                lead_map[cid]["totalPercentage"] += (float(att.get("score") or 0.0) / tot) * 100 if tot else 0.0
                
        for k, item in lead_map.items():
            avg_p = round(item["totalPercentage"] / max(1, item["attempts"]), 1)
            leaderboard.append({
                "candidateId": item["candidateId"],
                "name": item["name"],
                "email": item["email"],
                "attempts": item["attempts"],
                "completedAttempts": item["attempts"],
                "averageScore": avg_p,
                "averagePercentage": avg_p
            })
        leaderboard.sort(key=lambda x: x["averagePercentage"], reverse=True)
        
    cand_rank = 0
    for idx, item in enumerate(leaderboard):
        if item["candidateId"] == uid:
            cand_rank = idx + 1
            break
    if cand_rank == 0 and leaderboard:
        cand_rank = len(leaderboard)
        
    return {
        "assignments": enriched,
        "stats": {
            "assigned": len(enriched),
            "completed": len(completed_attempts),
            "inProgress": len(in_progress_attempts),
            "pending": len(pending_assignments),
            "averageScore": avg_score,
            "bestScore": best_score,
            "passCount": pass_cnt,
            "completionRate": compl_rate,
            "averagePercentage": avg_pct,
            "rank": cand_rank,
            "totalRanked": len(leaderboard)
        },
        "performance": performance,
        "latestAttempts": latest_attempts,
        "upcomingExams": upcoming_exams,
        "recentResults": recent_results,
        "performanceTrend": [],  # Optional fallback
        "scoreBands": score_bands,
        "examInsights": exam_insights,
        "notifications": notifications,
        "leaderboard": leaderboard[:10]
    }

@router.get("/exams")
async def get_exams(user: Dict[str, Any] = Depends(get_current_user)):
    res = await db.from_("exam_assignments").select("*, exam:exam_id(*)").eq("candidate_id", user["id"])
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.get("message") or "Query failed")
    return {"exams": res.data or []}

@router.get("/exam/{examId}")
async def get_exam(examId: str, user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    assign_res = await db.from_("exam_assignments").select("*").eq("exam_id", examId).eq("candidate_id", candidate_id).single()
    if assign_res.error or not assign_res.data:
        raise HTTPException(status_code=403, detail="Exam not assigned")
        
    exam_res = await db.from_("exams").select("*").eq("id", examId).single()
    if exam_res.error or not exam_res.data:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    mcq_res = await db.from_("exam_questions").select("*, questions:question_id(*)").eq("exam_id", examId)
    coding_res = await db.from_("exam_coding_questions").select("*, coding_questions:coding_question_id(*)").eq("exam_id", examId)
    
    mcq_mapped = []
    for q in (mcq_res.data or []):
        mcq_mapped.append({
            "id": q["id"],
            "question_id": q["question_id"],
            "marks": q.get("marks"),
            "question": q.get("questions")
        })
        
    coding_mapped = []
    for q in (coding_res.data or []):
        coding_mapped.append({
            "id": q["id"],
            "coding_question_id": q["coding_question_id"],
            "marks": q.get("marks"),
            "question": q.get("coding_questions")
        })
        
    return {
        "exam": exam_res.data,
        "mcqQuestions": mcq_mapped,
        "codingQuestions": coding_mapped
    }

@router.post("/resume/upload")
async def upload_resume(resume: UploadFile = File(...), user: Dict[str, Any] = Depends(get_current_user)):
    if not resume.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF format resumes are supported")
        
    # Read PDF content
    file_bytes = await resume.read()
    
    # Save physical copy locally
    unique_name = f"{int(datetime.datetime.utcnow().timestamp())}-{uuid.uuid4().hex[:8]}.pdf"
    file_path = os.path.join(storage_root, "resumes", unique_name)
    
    with open(file_path, "wb") as f:
        f.write(file_bytes)
        
    resume_url = f"/uploads/resumes/{unique_name}"
    
    # Parse PDF using pdfplumber
    parsed_text = ""
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                parsed_text += page.extract_text() or ""
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")
        
    if not parsed_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from the PDF file. Please ensure it is not scanned or empty.")
        
    lower_text = parsed_text.lower()
    
    # synonym database mapping
    SYNONYM_MAP = {
        "JavaScript": ["javascript", "js", "es6", "ecmascript"],
        "TypeScript": ["typescript", "ts"],
        "Python": ["python", "py"],
        "Java": ["java", "jdk", "jre"],
        "C++": ["c++", "cpp"],
        "C#": ["c#", "csharp", "dotnet", ".net"],
        "Go": ["go", "golang"],
        "Rust": ["rust", "rustlang"],
        "Ruby": ["ruby", "rails", "ror"],
        "PHP": ["php"],
        "Swift": ["swift"],
        "Kotlin": ["kotlin"],
        "SQL": ["sql", "mysql", "postgresql", "sqlite", "oracle", "mariadb"],
        "NoSQL": ["nosql", "mongodb", "redis", "cassandra"],
        "React": ["react", "reactjs", "react.js"],
        "Angular": ["angular", "angularjs"],
        "Vue": ["vue", "vuejs"],
        "Next.js": ["next.js", "nextjs"],
        "Node.js": ["node.js", "nodejs"],
        "Express": ["express", "expressjs"],
        "Django": ["django"],
        "Flask": ["flask"],
        "Spring Boot": ["spring boot", "springboot"],
        "Laravel": ["laravel"],
        "HTML": ["html", "html5"],
        "CSS": ["css", "css3", "sass", "scss"],
        "Tailwind CSS": ["tailwind", "tailwindcss"],
        "Bootstrap": ["bootstrap"],
        "MongoDB": ["mongodb", "mongo"],
        "PostgreSQL": ["postgresql", "postgres"],
        "MySQL": ["mysql"],
        "Redis": ["redis"],
        "AWS": ["aws", "amazon web services"],
        "Azure": ["azure"],
        "GCP": ["gcp", "google cloud"],
        "Docker": ["docker", "dockerfile"],
        "Kubernetes": ["kubernetes", "k8s"],
        "Git": ["git", "github", "gitlab"],
        "CI/CD": ["ci/cd", "cicd"],
        "Machine Learning": ["machine learning", "ml"],
        "Deep Learning": ["deep learning", "dl"],
        "Data Science": ["data science", "pandas", "numpy", "scikit-learn"],
        "DSA": ["dsa", "data structures", "algorithms"],
        "System Design": ["system design", "microservices"],
        "REST API": ["rest api", "graphql"]
    }
    
    header_patterns = {
        "experience": r"(experience|employment|work history|professional background|internships)",
        "projects": r"(projects|personal projects|academic projects)",
        "education": r"(education|academic background|university|college|degrees)",
        "skills": r"(skills|technical skills|languages|technologies|proficiencies)"
    }
    
    sections = {}
    for key, pat in header_patterns.items():
        m = re.search(pat, lower_text, re.IGNORECASE)
        sections[key] = m.start() if m else -1
        
    def get_segment(start_key):
        start_idx = sections[start_key]
        if start_idx == -1:
            return ""
        end_idx = len(lower_text)
        for k, idx in sections.items():
            if idx > start_idx and idx < end_idx:
                end_idx = idx
        return lower_text[start_idx:end_idx]
        
    exp_seg = get_segment("experience")
    proj_seg = get_segment("projects")
    
    extracted_skills = []
    applied_skills = []
    
    for skill_name, synonyms in SYNONYM_MAP.items():
        is_matched = False
        is_applied = False
        
        for syn in synonyms:
            esc = re.escape(syn)
            has_special = bool(re.search(r"[^a-zA-Z0-9]", syn))
            regex = re.compile(esc, re.IGNORECASE) if has_special else re.compile(rf"\b{esc}\b", re.IGNORECASE)
            
            if regex.search(lower_text):
                is_matched = True
                if (exp_seg and regex.search(exp_seg)) or (proj_seg and regex.search(proj_seg)):
                    is_applied = True
                    break
        if is_matched:
            extracted_skills.append(skill_name)
            if is_applied:
                applied_skills.append(skill_name)
                
    # Contacts
    has_email = bool(re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", lower_text))
    has_phone = bool(re.search(r"\b(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b", lower_text))
    has_github = "github.com/" in lower_text
    has_linkedin = "linkedin.com/in/" in lower_text
    
    contact_score = (30 if has_email else 0) + (30 if has_phone else 0) + (20 if has_github else 0) + (20 if has_linkedin else 0)
    
    # Structure
    struct_score = (30 if sections["experience"] != -1 else 0) + (30 if sections["projects"] != -1 else 0) + (20 if sections["education"] != -1 else 0) + (20 if sections["skills"] != -1 else 0)
    
    # Words
    words = lower_text.split()
    word_count = len(words)
    density_score = 100 if 300 <= word_count <= 750 else 80 if 750 < word_count <= 1200 else 50 if word_count < 300 else 40
    
    # Verbs
    verbs_list = ["designed", "developed", "implemented", "managed", "built", "optimized", "created", "led", "architected", "analyzed", "deployed", "spearheaded", "engineered", "streamlined"]
    verb_count = sum(len(re.findall(rf"\b{v}\b", lower_text)) for v in verbs_list)
    verb_score = 100 if verb_count >= 8 else 75 if verb_count >= 4 else 40
    
    # Metrics
    metrics_matches = re.findall(r"\b(?:\d{1,3}%|\d+\s*(?:users|requests|percent|seconds|ms|times|GB|MB|pages|students|endpoints))\b", lower_text, re.IGNORECASE)
    metrics_count = len(metrics_matches)
    metrics_score = 100 if metrics_count >= 3 else 65 if metrics_count >= 1 else 30
    
    # Normalized skill depth
    skill_depth_val = sum(5 if s in applied_skills else 2 for s in extracted_skills)
    skill_depth_norm = min(100, round((min(25, skill_depth_val) / 25) * 100))
    
    # Education depth
    edu_score = 40
    if sections["education"] != -1:
        edu_seg = get_segment("education")
        has_gpa = bool(re.search(r"\b\d+(?:\.\d+)?\s*(?:%|cgpa|gpa)\b", edu_seg, re.IGNORECASE))
        has_deg = bool(re.search(r"\b(b\.?tech|b\.?e|b\.?s|m\.?tech|m\.?s|b\.?sc|mca|mba|bachelor|master)\b", edu_seg, re.IGNORECASE))
        edu_score = 100 if has_gpa and has_deg else 75 if has_deg or has_gpa else 50
        
    # Project richness
    proj_score = 0
    if sections["projects"] != -1:
        proj_skills = [s for s in extracted_skills if re.search(re.escape(s), proj_seg, re.IGNORECASE)]
        proj_score = 100 if len(proj_skills) >= 4 else 75 if len(proj_skills) >= 2 else 50
        
    # Certs
    certs_cnt = len(re.findall(r"\b(certified|certification|award|scholarship|hackathon|rank|winner)\b", lower_text, re.IGNORECASE))
    certs_score = 100 if certs_cnt >= 2 else 70 if certs_cnt == 1 else 40
    
    # Buzzwords
    buzz_cnt = len(re.findall(r"\b(team player|hard worker|self-motivated|detail-oriented)\b", lower_text, re.IGNORECASE))
    buzz_score = 100 if buzz_cnt == 0 else 75 if buzz_cnt <= 2 else 40
    
    # Timeline
    years_cnt = len(set(re.findall(r"\b(201\d|202\d|2030)\b", lower_text)))
    timeline_score = 100 if years_cnt >= 3 else 70 if years_cnt >= 1 else 30
    
    # Readability
    sentences = [s.strip() for s in re.split(r"[.!?\n]", parsed_text) if len(s.strip().split()) > 2]
    avg_len = round(word_count / len(sentences)) if sentences else 0
    readability_score = 100 if 10 <= avg_len <= 22 else 75 if 22 < avg_len <= 30 else 50
    
    # Formatting, links, balance, os, db, devops, api, dsa
    formatting_score = 100 if lower_text.count("\n•") + lower_text.count("\n*") + lower_text.count("\n-") >= 8 else 75
    link_score = 100 if len(set(re.findall(r"(github\.com|linkedin\.com|http|https)", lower_text))) >= 3 else 70
    balance_score = 100
    os_score = 100 if any(t in lower_text for t in ["linux", "git", "docker"]) else 70
    db_score = 100 if any(d in lower_text for d in ["sql", "database"]) else 70
    devops_score = 100 if any(d in lower_text for d in ["docker", "aws", "gcp"]) else 70
    api_score = 100 if any(a in lower_text for a in ["api", "rest", "graphql"]) else 70
    dsa_score = 100 if any(d in lower_text for d in ["dsa", "complexity", "algorithm"]) else 70
    
    ats_score_computed = round(
        (contact_score * 0.08) +
        (struct_score * 0.08) +
        (density_score * 0.04) +
        (verb_score * 0.08) +
        (metrics_score * 0.08) +
        (skill_depth_norm * 0.15) +
        (edu_score * 0.04) +
        (proj_score * 0.08) +
        (certs_score * 0.04) +
        (buzz_score * 0.04) +
        (timeline_score * 0.04) +
        (readability_score * 0.02) +
        (100 * 0.02) + # domain keywords mock
        (formatting_score * 0.02) +
        (link_score * 0.02) +
        (100 * 0.01) + # email professional
        (100 * 0.01) + # pronoun avoidance
        (100 * 0.01) + # github link
        (100 * 0.01) + # linkedin link
        (balance_score * 0.02) +
        (os_score * 0.01) +
        (db_score * 0.01) +
        (devops_score * 0.01) +
        (api_score * 0.01) +
        (dsa_score * 0.01)
    )
    
    tier = "Excellent" if ats_score_computed >= 85 else "Good" if ats_score_computed >= 70 else "Fair" if ats_score_computed >= 50 else "Poor"
    
    # Save back to database
    up_res = await db.from_("candidate_profiles").update({
        "resume_url": resume_url,
        "skills": extracted_skills if extracted_skills else ["Software Engineering"],
        "resume_ats_analysis": {
            "atsScore": ats_score_computed,
            "tier": tier,
            "summary": f"Good profile showing matching skills: {', '.join(extracted_skills[:4])}." if ats_score_computed >= 70 else "Fair profile setup.",
            "gaps": ["Database systems & SQL experience"] if "SQL" not in extracted_skills else ["No major gaps."],
            "suggestedRoles": ["Backend Developer", "Software Engineer"]
        }
    }).eq("user_id", user["id"]).select().single()
    
    if up_res.error:
        raise HTTPException(status_code=400, detail=up_res.error.get("message") or "Failed to update profile resume details")
        
    return {"message": "Resume parsed successfully", "profile": up_res.data}

@router.delete("/resume")
async def delete_resume(user: Dict[str, Any] = Depends(get_current_user)):
    cur_res = await db.from_("candidate_profiles").select("resume_url").eq("user_id", user["id"]).maybeSingle()
    if cur_res.data and cur_res.data.get("resume_url"):
        fn = os.path.basename(cur_res.data["resume_url"])
        filePath = os.path.join(storage_root, "resumes", fn)
        try:
            os.remove(filePath)
        except Exception:
            pass
            
    up_res = await db.from_("candidate_profiles").update({
        "resume_url": None,
        "resume_ats_analysis": None
    }).eq("user_id", user["id"]).select().single()
    
    return {"message": "Resume deleted successfully", "profile": up_res.data}

@router.get("/action-items")
async def get_action_items(user: Dict[str, Any] = Depends(get_current_user)):
    uid = user["id"]
    items = []
    
    prof_res = await db.from_("candidate_profiles").select("profile_complete, resume_url, marksheet_url, documents_verified").eq("user_id", uid).maybeSingle()
    profile = prof_res.data
    
    if not profile or not profile.get("profile_complete"):
        items.append({
            "id": "profile_incomplete",
            "type": "profile_incomplete",
            "title": "Complete your profile",
            "description": "Fill in onboarding details to start applying to drives.",
            "priority": "urgent",
            "action_url": "/candidate/onboarding"
        })
    else:
        if not profile.get("resume_url"):
            items.append({
                "id": "resume_missing",
                "type": "resume_missing",
                "title": "Upload your resume",
                "description": "A resume is required by 3 active placement drives.",
                "priority": "high",
                "action_url": "/candidate/profile"
            })
        if not profile.get("marksheet_url"):
            items.append({
                "id": "marksheet_missing",
                "type": "marksheet_missing",
                "title": "Upload your marksheet",
                "description": "Pending verification marksheet for active drive eligibility.",
                "priority": "high",
                "action_url": "/candidate/profile"
            })
            
    assign_res = await db.from_("exam_assignments").select("*, exam:exam_id(title, available_until)").eq("candidate_id", uid)
    assignments = assign_res.data or []
    
    completed_res = await db.from_("attempts").select("exam_id, status").eq("candidate_id", uid).eq("status", "completed")
    completed_ids = {c["exam_id"] for c in (completed_res.data or []) if c.get("exam_id")}
    
    for assign in assignments:
        exam_id = assign.get("exam_id")
        if exam_id and exam_id not in completed_ids:
            exam = assign.get("exam") or {}
            items.append({
                "id": f"exam_{exam_id}",
                "type": "exam_deadline",
                "title": f"Exam: {exam.get('title') or 'Assigned Exam'}",
                "description": "Assigned assessment is pending. Complete before the deadline.",
                "priority": "urgent",
                "action_url": "/candidate/exams",
                "entity_id": exam_id,
                "entity_type": "exam",
                "due_at": exam.get("available_until")
            })
            
    db_items_res = await db.from_("action_items").select("*").eq("user_id", uid).eq("role", "candidate").is_("read_at", None).is_("dismissed_at", None)
    if db_items_res.data:
        items.extend(db_items_res.data)
        
    return {"actionItems": items}

@router.get("/journey-tracker")
async def get_journey_tracker(user: Dict[str, Any] = Depends(get_current_user)):
    uid = user["id"]
    
    app_res = await db.from_("candidate_status").select("*, job:job_id(*, exam:exam_id(title))").eq("candidate_id", uid)
    app_statuses = app_res.data or []
    
    trackers = []
    for app in app_statuses:
        job = app.get("job") or {}
        stages = [
            {"name": "Registered", "completed": True, "date": app.get("updated_at")},
            {"name": "Assigned Exam", "completed": False},
            {"name": "Exam Taken", "completed": False},
            {"name": "Shortlisted", "completed": False},
            {"name": "Interview Scheduled", "completed": False},
            {"name": "Offered", "completed": False}
        ]
        
        exam_id = job.get("exam_id")
        if exam_id:
            assign_res = await db.from_("exam_assignments").select("assigned_at").eq("candidate_id", uid).eq("exam_id", exam_id).maybeSingle()
            if assign_res.data:
                stages[1]["completed"] = True
                stages[1]["date"] = assign_res.data["assigned_at"]
                
            att_res = await db.from_("attempts").select("submitted_at, score, status").eq("candidate_id", uid).eq("exam_id", exam_id).maybeSingle()
            if att_res.data and att_res.data.get("status") == "completed":
                stages[2]["completed"] = True
                stages[2]["date"] = att_res.data["submitted_at"]
                
        if app.get("status") in ["passed", "shortlisted", "offered"]:
            stages[3]["completed"] = True
            stages[3]["date"] = app.get("updated_at")
            
        iv_res = await db.from_("ai_interviews").select("scheduled_start, status").eq("candidate_id", uid).eq("job_id", job.get("id")).maybeSingle()
        if iv_res.data and iv_res.data.get("status") in ["scheduled", "completed"]:
            stages[4]["completed"] = True
            stages[4]["date"] = iv_res.data.get("scheduled_start")
            
        if app.get("status") == "offered":
            stages[5]["completed"] = True
            stages[5]["date"] = app.get("updated_at")
            
        pipe_res = await db.from_("candidate_pipeline").select("*").eq("candidate_id", uid).eq("job_id", job.get("id")).order("entered_at", ascending=True)
        
        trackers.append({
            "jobId": job.get("id"),
            "jobTitle": job.get("title"),
            "companyName": job.get("company_name"),
            "currentStage": app.get("status"),
            "stages": stages,
            "pipelineLogs": pipe_res.data or []
        })
        
    return {"trackers": trackers}

@router.get("/performance-radar")
async def get_performance_radar(user: Dict[str, Any] = Depends(get_current_user)):
    uid = user["id"]
    
    ans_res = await db.from_("answers").select("*, question:question_id(topic), attempt:attempt_id(candidate_id)").eq("attempt.candidate_id", uid)
    mcq_answers = ans_res.data or []
    
    topic_scores = create_topic_scores()
    
    ivs_res = await db.from_("ai_interviews").select("communication_score").eq("candidate_id", uid).eq("status", "completed")
    for iv in (ivs_res.data or []):
        feed_communication_score(topic_scores, iv.get("communication_score") or 0)
        
    for ans in mcq_answers:
        q = ans.get("question") or {}
        feed_mcq_answer(topic_scores, bool(ans.get("is_correct")), q.get("topic"))
        
    coding_res = await db.from_("coding_submissions").select("score, coding_questions(marks), attempt:attempt_id(candidate_id)").eq("attempt.candidate_id", uid).eq("status", "tested")
    for sub in (coding_res.data or []):
        q = sub.get("coding_questions") or {}
        feed_coding_submission(topic_scores, float(sub.get("score") or 0.0), float(q.get("marks") or 10.0))
        
    insights = generate_insights(topic_scores, "Profile")
    
    prof_res = await db.from_("candidate_profiles").select("college_id, cgpa").eq("user_id", uid).maybeSingle()
    peer_percentile = 0
    if prof_res.data:
        peers_res = await db.from_("candidate_profiles").select("cgpa").eq("college_id", prof_res.data["college_id"])
        peers = peers_res.data or []
        if peers:
            lower = sum(1 for p in peers if float(p.get("cgpa") or 0.0) <= float(prof_res.data.get("cgpa") or 0.0))
            peer_percentile = round((lower / len(peers)) * 100)
            
    attempts_res = await db.from_("attempts").select("*, exam:exam_id(title)").eq("candidate_id", uid).eq("status", "completed").order("submitted_at", ascending=True)
    trend = [{"name": (a.get("exam") or {}).get("title") or "Exam", "score": a.get("score") or 0} for a in (attempts_res.data or [])]
    
    return {
        "radarData": insights["radarData"],
        "peerPercentile": peer_percentile,
        "trendData": trend,
        "strengths": insights["strengths"],
        "weaknesses": insights["weaknesses"]
    }

@router.post("/offers/{jobId}/respond")
async def respond_offer(jobId: str, req: RespondOfferRequest, user: Dict[str, Any] = Depends(get_current_user)):
    uid = user["id"]
    resp = req.response
    notes = req.notes or ""
    
    up_fields = {"recruiter_notes": notes}
    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    
    if resp == "accept":
        up_fields["offer_accepted_at"] = now_str
    elif resp == "decline":
        up_fields["offer_declined_at"] = now_str
    else:
        up_fields["status"] = "on_hold"
        
    up_res = await db.from_("candidate_status").update(up_fields).eq("candidate_id", uid).eq("job_id", jobId).select().single()
    if up_res.error:
        raise HTTPException(status_code=400, detail=up_res.error.get("message") or "Failed to update offer response")
        
    stage = "offered" if resp == "accept" else "rejected" if resp == "decline" else "on_hold"
    notes_txt = "Offer accepted by candidate" if resp == "accept" else "Offer declined by candidate" if resp == "decline" else "Negotiation requested by candidate"
    
    await record_pipeline_stage(uid, jobId, stage, notes_txt, uid)
    
    await db.from_("activity_feed").insert({
        "actor_id": uid,
        "actor_role": "candidate",
        "target_user_id": uid,
        "type": f"offer_{resp}",
        "title": f"Offer {'Accepted' if resp == 'accept' else 'Declined' if resp == 'decline' else 'Negotiation Initiated'}",
        "description": f"Candidate responded with {resp.upper()} to the job offer."
    })
    
    return {"message": f"Successfully responded to the offer with: {resp}", "status": up_res.data}

@router.get("/activity")
async def get_activity(user: Dict[str, Any] = Depends(get_current_user)):
    res = await db.from_("activity_feed").select("*, actor:actor_id(name)").eq("target_user_id", user["id"]).order("created_at", ascending=False).limit(20)
    feed = []
    for a in (res.data or []):
        feed.append({
            "id": a["id"],
            "type": a["type"],
            "title": a["title"],
            "description": a["description"],
            "actorName": (a.get("actor") or {}).get("name"),
            "actorRole": a["actor_role"],
            "metadata": a.get("metadata"),
            "createdAt": a["created_at"]
        })
    return {"feed": feed}

@router.get("/offers")
async def get_offers(user: Dict[str, Any] = Depends(get_current_user)):
    res = await db.from_("candidate_status").select("*, job:job_id(title, company_name, salary_min, salary_max)").eq("candidate_id", user["id"]).eq("status", "offered").is_("offer_accepted_at", None).is_("offer_declined_at", None).order("updated_at", ascending=False)
    return {"offers": res.data or []}

@router.get("/topic-mastery")
async def get_topic_mastery(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    att_res = await db.from_("attempts").select("id").eq("candidate_id", candidate_id).eq("status", "completed")
    attempt_ids = [a["id"] for a in (att_res.data or [])]
    if not attempt_ids:
        return {"topics": [], "strongest": None, "weakest": None, "peerAverage": []}
        
    ans_res = await db.from_("answers").select("id, question_id, is_correct, marks_obtained").in_("attempt_id", attempt_ids)
    answers = ans_res.data or []
    
    q_ids = [a["question_id"] for a in answers if a.get("question_id")]
    questions = []
    if q_ids:
        q_res = await db.from_("questions").select("id, topic_tags, question_text").in_("id", q_ids)
        questions = q_res.data or []
        
    topic_map = {}
    for a in answers:
        q = next((q for q in questions if q["id"] == a["question_id"]), None)
        tags = q.get("topic_tags") if q and q.get("topic_tags") else []
        if not isinstance(tags, list):
            tags = []
        if not tags:
            tags = ["General"]
        for tag in tags:
            if tag not in topic_map:
                topic_map[tag] = {"total": 0, "correct": 0, "marks": 0.0}
            topic_map[tag]["total"] += 1
            if a.get("is_correct"):
                topic_map[tag]["correct"] += 1
            topic_map[tag]["marks"] += float(a.get("marks_obtained") or 0.0)
            
    topics = []
    for topic, stats in topic_map.items():
        topics.append({
            "topic": topic,
            "accuracy": round((stats["correct"] / stats["total"]) * 100) if stats["total"] else 0,
            "total": stats["total"],
            "correct": stats["correct"],
            "avgMarks": round(stats["marks"] / stats["total"], 1) if stats["total"] else 0.0
        })
    topics.sort(key=lambda x: x["accuracy"], reverse=True)
    
    # Peer average
    peer_avg = []
    if q_ids:
        all_ans_res = await db.from_("answers").select("is_correct, question_id, attempts:attempt_id(status)").in_("question_id", q_ids)
        all_answers = all_ans_res.data or []
        
        peer_map = {}
        for a in all_answers:
            att = a.get("attempts") or {}
            if att.get("status") != "completed":
                continue
            q = next((q for q in questions if q["id"] == a["question_id"]), None)
            tags = q.get("topic_tags") if q and q.get("topic_tags") else ["General"]
            if not isinstance(tags, list):
                tags = ["General"]
            for tag in tags:
                if tag not in peer_map:
                    peer_map[tag] = {"total": 0, "correct": 0}
                peer_map[tag]["total"] += 1
                if a.get("is_correct"):
                    peer_map[tag]["correct"] += 1
                    
        for topic, stats in peer_map.items():
            peer_avg.append({
                "topic": topic,
                "accuracy": round((stats["correct"] / stats["total"]) * 100) if stats["total"] else 0
            })
            
    return {
        "topics": topics,
        "strongest": topics[0]["topic"] if topics else None,
        "weakest": topics[-1]["topic"] if topics else None,
        "peerAverage": peer_avg
    }

@router.get("/coding-analytics")
async def get_coding_analytics(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    att_res = await db.from_("attempts").select("id").eq("candidate_id", candidate_id).eq("status", "completed")
    attempt_ids = [a["id"] for a in (att_res.data or [])]
    if not attempt_ids:
        return {"languages": [], "difficulty": [], "problemTypes": []}
        
    subs_res = await db.from_("coding_submissions").select("*, coding_questions:coding_question_id(difficulty, topic_tags, marks)").in_("attempt_id", attempt_ids)
    submissions = subs_res.data or []
    
    lang_map = {}
    diff_map = {}
    type_map = {}
    
    for s in submissions:
        lang = s.get("language") or "unknown"
        if lang not in lang_map:
            lang_map[lang] = {"submissions": 0, "success": 0, "totalScore": 0.0, "count": 0}
        lang_map[lang]["submissions"] += 1
        if float(s.get("score") or 0.0) > 0.0:
            lang_map[lang]["success"] += 1
        lang_map[lang]["totalScore"] += float(s.get("score") or 0.0)
        lang_map[lang]["count"] += 1
        
        q = s.get("coding_questions") or {}
        diff = q.get("difficulty") or "unknown"
        if diff not in diff_map:
            diff_map[diff] = {"total": 0, "success": 0, "totalScore": 0.0}
        diff_map[diff]["total"] += 1
        if float(s.get("score") or 0.0) > 0.0:
            diff_map[diff]["success"] += 1
        diff_map[diff]["totalScore"] += float(s.get("score") or 0.0)
        
        tags = q.get("topic_tags") if q.get("topic_tags") else ["General"]
        if not isinstance(tags, list):
            tags = ["General"]
        for tag in tags:
            if tag not in type_map:
                type_map[tag] = {"total": 0, "success": 0}
            type_map[tag]["total"] += 1
            if float(s.get("score") or 0.0) > 0.0:
                type_map[tag]["success"] += 1
                
    languages = []
    for lang, stats in lang_map.items():
        languages.append({
            "language": lang,
            "submissions": stats["submissions"],
            "successRate": round((stats["success"] / stats["count"]) * 100) if stats["count"] else 0,
            "avgScore": round(stats["totalScore"] / stats["count"], 1) if stats["count"] else 0.0
        })
        
    difficulty = []
    for level, stats in diff_map.items():
        difficulty.append({
            "level": level,
            "total": stats["total"],
            "successRate": round((stats["success"] / stats["total"]) * 100) if stats["total"] else 0,
            "avgScore": round(stats["totalScore"] / stats["total"], 1) if stats["total"] else 0.0
        })
        
    problem_types = []
    for t, stats in type_map.items():
        problem_types.append({
            "type": t,
            "total": stats["total"],
            "successRate": round((stats["success"] / stats["total"]) * 100) if stats["total"] else 0
        })
        
    return {"languages": languages, "difficulty": difficulty, "problemTypes": problem_types}

@router.get("/interview-analytics")
async def get_interview_analytics(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    res = await db.from_("ai_interviews").select("*, job:job_id(title, company_name), exam:exam_id(title)").eq("candidate_id", candidate_id).eq("status", "completed").order("submitted_at", ascending=False)
    interviews = res.data or []
    
    breakdown = []
    for i in interviews:
        job = i.get("job") or {}
        exam = i.get("exam") or {}
        breakdown.append({
            "id": i["id"],
            "jobTitle": job.get("title") or exam.get("title") or "Interview",
            "companyName": job.get("company_name") or "",
            "submittedAt": i.get("submitted_at"),
            "overallScore": i.get("score") or 0,
            "dimensions": {
                "relevance": i.get("relevance_score") or 0,
                "communication": i.get("communication_score") or 0,
                "intro": i.get("intro_score") or 0,
                "speaking": i.get("speaking_score") or 0,
                "pronunciation": i.get("pronunciation_score") or 0,
                "technical": i.get("technical_score") or 0
            },
            "selected": bool(i.get("selected")),
            "summary": i.get("summary") or "",
            "feedback": i.get("feedback") or ""
        })
        
    averages = {
        "relevance": round(sum(b["dimensions"]["relevance"] for b in breakdown) / len(breakdown)) if breakdown else 0,
        "communication": round(sum(b["dimensions"]["communication"] for b in breakdown) / len(breakdown)) if breakdown else 0,
        "intro": round(sum(b["dimensions"]["intro"] for b in breakdown) / len(breakdown)) if breakdown else 0,
        "speaking": round(sum(b["dimensions"]["speaking"] for b in breakdown) / len(breakdown)) if breakdown else 0,
        "pronunciation": round(sum(b["dimensions"]["pronunciation"] for b in breakdown) / len(breakdown)) if breakdown else 0,
        "technical": round(sum(b["dimensions"]["technical"] for b in breakdown) / len(breakdown)) if breakdown else 0
    }
    
    return {"interviews": breakdown, "averages": averages, "count": len(breakdown)}

@router.get("/job-pipeline")
async def get_job_pipeline(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    res = await db.from_("candidate_status").select("*, job:job_id(title, company_name, drive_date)").eq("candidate_id", candidate_id).order("updated_at", ascending=False)
    statuses = res.data or []
    
    pipeline = []
    for s in statuses:
        job = s.get("job") or {}
        pipeline.append({
            "jobId": s.get("job_id"),
            "jobTitle": job.get("title") or "Unknown",
            "companyName": job.get("company_name") or "Unknown",
            "status": s.get("status"),
            "updatedAt": s.get("updated_at"),
            "recruiterNotes": s.get("recruiter_notes") or ""
        })
        
    stages = ["registered", "exam_taken", "passed", "shortlisted", "on_hold", "offered", "rejected"]
    return {"pipeline": pipeline, "stages": stages}

@router.get("/streak")
async def get_streak(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    
    att_res = await db.from_("attempts").select("started_at, submitted_at").eq("candidate_id", candidate_id).eq("status", "completed")
    subs_res = await db.from_("coding_submissions").select("created_at, attempts:attempt_id(candidate_id)").eq("attempts.candidate_id", candidate_id)
    
    dates = set()
    for a in (att_res.data or []):
        if a.get("started_at"):
            dates.add(a["started_at"][:10])
        if a.get("submitted_at"):
            dates.add(a["submitted_at"][:10])
    for c in (subs_res.data or []):
        if c.get("created_at"):
            dates.add(c["created_at"][:10])
            
    sorted_dates = sorted(list(dates))
    current_streak = 0
    longest_streak = 0
    temp_streak = 0
    prev_date = None
    
    for d_str in sorted_dates:
        d = datetime.date.fromisoformat(d_str)
        if prev_date:
            diff = (d - prev_date).days
            if diff == 1:
                temp_streak += 1
            else:
                temp_streak = 1
        else:
            temp_streak = 1
        prev_date = d
        longest_streak = max(longest_streak, temp_streak)
        
    today = datetime.date.today()
    today_str = today.isoformat()
    yesterday_str = (today - datetime.timedelta(days=1)).isoformat()
    
    if today_str in dates:
        current_streak = 1
        chk = today - datetime.timedelta(days=1)
        while chk.isoformat() in dates:
            current_streak += 1
            chk -= datetime.timedelta(days=1)
    elif yesterday_str in dates:
        current_streak = 1
        chk = today - datetime.timedelta(days=2)
        while chk.isoformat() in dates:
            current_streak += 1
            chk -= datetime.timedelta(days=1)
            
    heatmap = []
    day_names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    for i in range(83, -1, -1):
        d = today - datetime.timedelta(days=i)
        d_str = d.isoformat()
        week = (83 - i) // 7
        day = (d.weekday() + 1) % 7 # Python weekday is 0=Mon, convert to 0=Sun
        heatmap.append({
            "date": d_str,
            "count": 1 if d_str in dates else 0,
            "week": week,
            "day": day
        })
        
    return {
        "currentStreak": current_streak,
        "longestStreak": longest_streak,
        "heatmap": heatmap,
        "dayNames": day_names
    }

@router.get("/readiness-score")
async def get_readiness_score(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    
    att_res = await db.from_("attempts").select("id, exam_id, score, status, exams:exam_id(total_marks)").eq("candidate_id", candidate_id).eq("status", "completed")
    attempts = att_res.data or []
    attempt_ids = [a["id"] for a in attempts]
    
    coding_subs = []
    if attempt_ids:
        subs_res = await db.from_("coding_submissions").select("score, coding_questions:coding_question_id(marks)").in_("attempt_id", attempt_ids)
        coding_subs = subs_res.data or []
        
    ivs_res = await db.from_("ai_interviews").select("score").eq("candidate_id", candidate_id).eq("status", "completed")
    interviews = ivs_res.data or []
    
    all_exams_res = await db.from_("exams").select("id")
    total_exams = len(all_exams_res.data) if all_exams_res.data else 0
    
    exam_percentages = []
    for a in attempts:
        exam = a.get("exams") or {}
        tot = float(exam.get("total_marks") or 100.0)
        exam_percentages.append((float(a.get("score") or 0.0) / tot) * 100.0 if tot else 0.0)
    exam_avg = sum(exam_percentages) / len(exam_percentages) if exam_percentages else 0.0
    
    coding_percentages = []
    for c in coding_subs:
        q = c.get("coding_questions") or {}
        tot = float(q.get("marks") or 10.0)
        coding_percentages.append((float(c.get("score") or 0.0) / tot) * 100.0 if tot else 0.0)
    coding_score = sum(coding_percentages) / len(coding_percentages) if coding_percentages else exam_avg
    
    iv_scores = [float(i.get("score") or 0.0) for i in interviews]
    interview_score = sum(iv_scores) / len(iv_scores) if iv_scores else 0.0
    
    consistency = 100.0
    if len(exam_percentages) > 1:
        mean = exam_avg
        variance = sum((p - mean) ** 2 for p in exam_percentages) / len(exam_percentages)
        std_dev = math.sqrt(variance)
        consistency = max(0.0, 100.0 - std_dev)
    elif not exam_percentages:
        consistency = 0.0
        
    uniq_exams = len({a["exam_id"] for a in attempts if a.get("exam_id")})
    breadth = (uniq_exams / total_exams) * 100.0 if total_exams else uniq_exams * 10.0
    breadth = min(100.0, breadth)
    
    readiness = round((exam_avg * 0.40) + (coding_score * 0.25) + (interview_score * 0.20) + (consistency * 0.10) + (breadth * 0.05))
    zone = "ready" if readiness >= 75 else "approaching" if readiness >= 50 else "needs_work"
    
    return {
        "readinessScore": readiness,
        "zone": zone,
        "components": {
            "exam": round(exam_avg),
            "coding": round(coding_score),
            "interview": round(interview_score),
            "consistency": round(consistency),
            "breadth": round(breadth)
        }
    }

@router.get("/proctoring-summary")
async def get_proctoring_summary(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    att_res = await db.from_("attempts").select("id").eq("candidate_id", candidate_id)
    attempt_ids = [a["id"] for a in (att_res.data or [])]
    if not attempt_ids:
        return {"totalViolations": 0, "byType": [], "recentExams": []}
        
    events_res = await db.from_("proctoring_snapshots").select("event_type, message, violation_count, captured_at, exams:exam_id(title)").in_("attempt_id", attempt_ids).eq("event_type", "violation").order("captured_at", ascending=False)
    violations = events_res.data or []
    
    type_map = {}
    for v in violations:
        msg = (v.get("message") or "").lower()
        v_type = "other"
        if "tab" in msg:
            v_type = "tab_switch"
        elif "face" in msg:
            v_type = "face_missing"
        elif "camera" in msg:
            v_type = "camera_offline"
        elif "phone" in msg:
            v_type = "phone_detected"
        elif "looking" in msg:
            v_type = "looking_away"
        type_map[v_type] = type_map.get(v_type, 0) + 1
        
    by_type = [{"type": k, "count": v} for k, v in type_map.items()]
    recent_exams = []
    for v in violations[:5]:
        exam = v.get("exams") or {}
        recent_exams.append({
            "examTitle": exam.get("title") or "Unknown",
            "message": v.get("message") or "",
            "capturedAt": v.get("captured_at"),
            "violationCount": v.get("violation_count") or 1
        })
        
    return {"totalViolations": len(violations), "byType": by_type, "recentExams": recent_exams}

@router.get("/peer-comparison")
async def get_peer_comparison(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    
    att_res = await db.from_("attempts").select("id, exam_id, score, exams:exam_id(total_marks)").eq("candidate_id", candidate_id).eq("status", "completed")
    my_attempts = att_res.data or []
    my_ids = [a["id"] for a in my_attempts]
    
    my_answers = []
    if my_ids:
        my_ans_res = await db.from_("answers").select("question_id, is_correct").in_("attempt_id", my_ids)
        my_answers = my_ans_res.data or []
        
    all_ans_res = await db.from_("answers").select("question_id, is_correct, attempt_id, attempts:attempt_id(candidate_id, status)").eq("attempts.status", "completed")
    all_answers = all_ans_res.data or []
    
    q_ids = list({a["question_id"] for a in all_answers if a.get("question_id")})
    questions = []
    if q_ids:
        q_res = await db.from_("questions").select("id, topic_tags").in_("id", q_ids)
        questions = q_res.data or []
        
    topic_accs = {}
    for a in all_answers:
        q = next((q for q in questions if q["id"] == a["question_id"]), None)
        tags = q.get("topic_tags") if q and q.get("topic_tags") else ["General"]
        if not isinstance(tags, list):
            tags = ["General"]
        for tag in tags:
            if tag not in topic_accs:
                topic_accs[tag] = {"myCorrect": 0, "myTotal": 0, "peerCorrect": 0, "peerTotal": 0}
            topic_accs[tag]["peerTotal"] += 1
            if a.get("is_correct"):
                topic_accs[tag]["peerCorrect"] += 1
                
            att = a.get("attempts") or {}
            if att.get("candidate_id") == candidate_id:
                topic_accs[tag]["myTotal"] += 1
                if a.get("is_correct"):
                    topic_accs[tag]["myCorrect"] += 1
                    
    comparisons = []
    for topic, stats in topic_accs.items():
        my_acc = (stats["myCorrect"] / stats["myTotal"]) * 100.0 if stats["myTotal"] else 0.0
        peer_acc = (stats["peerCorrect"] / stats["peerTotal"]) * 100.0 if stats["peerTotal"] else 0.0
        pct = (my_acc / peer_acc) * 100.0 if peer_acc > 0 else 0.0
        comparisons.append({
            "topic": topic,
            "myAccuracy": round(my_acc),
            "peerAccuracy": round(peer_acc),
            "percentile": min(100, round(pct))
        })
        
    my_tot_correct = sum(1 for a in my_answers if a.get("is_correct"))
    my_tot = len(my_answers)
    my_overall_acc = (my_tot_correct / my_tot) * 100.0 if my_tot else 0.0
    
    peer_answers = [a for a in all_answers if a.get("attempts", {}).get("candidate_id") != candidate_id]
    peer_tot_correct = sum(1 for a in peer_answers if a.get("is_correct"))
    peer_tot = len(peer_answers)
    peer_overall_acc = (peer_tot_correct / peer_tot) * 100.0 if peer_tot else 0.0
    
    overall_percentile = (my_overall_acc / peer_overall_acc) * 100.0 if peer_overall_acc > 0 else 0.0
    
    return {
        "comparisons": comparisons,
        "overall": {
            "myAccuracy": round(my_overall_acc),
            "peerAccuracy": round(peer_overall_acc),
            "percentile": min(100, round(overall_percentile))
        }
    }

@router.get("/certificates")
async def get_certificates(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    att_res = await db.from_("attempts").select("id, exam_id, score, submitted_at, exams:exam_id(id, title, total_marks, pass_marks)").eq("candidate_id", candidate_id).eq("status", "completed").order("submitted_at", ascending=False)
    attempts = att_res.data or []
    
    passed = []
    for att in attempts:
        exam = att.get("exams") or {}
        if float(att.get("score") or 0.0) >= float(exam.get("pass_marks") or 0.0):
            passed.append(att)
            
    for att in passed:
        await db.from_("certificates").upsert({
            "candidate_id": candidate_id,
            "exam_id": att["exam_id"],
            "certificate_url": f"/certificate/{candidate_id}/{att['exam_id']}"
        }, on_conflict="candidate_id,exam_id")
        
    certs_res = await db.from_("certificates").select("*, exam:exam_id(title, total_marks)").eq("candidate_id", candidate_id).order("issued_at", ascending=False)
    return {"certificates": certs_res.data or []}

@router.get("/badges")
async def get_badges(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    att_res = await db.from_("attempts").select("score, exams:exam_id(total_marks)").eq("candidate_id", candidate_id).eq("status", "completed")
    completed = att_res.data or []
    
    best_pct = 0.0
    for att in completed:
        exam = att.get("exams") or {}
        tot = float(exam.get("total_marks") or 100.0)
        pct = (float(att.get("score") or 0.0) / tot) * 100.0 if tot else 0.0
        best_pct = max(best_pct, pct)
        
    earned = []
    if len(completed) >= 1:
        earned.append({"name": "Assessment Starter", "description": "Completed the first assessment."})
    if len(completed) >= 3:
        earned.append({"name": "Consistent Performer", "description": "Completed three assessments."})
    if best_pct >= 80.0:
        earned.append({"name": "Top Scorer", "description": "Scored 80% or above in an assessment."})
        
    for badge in earned:
        exist_res = await db.from_("badges").select("id").eq("candidate_id", candidate_id).eq("name", badge["name"]).maybeSingle()
        if not exist_res.data:
            await db.from_("badges").insert({
                "candidate_id": candidate_id,
                "name": badge["name"],
                "description": badge["description"]
            })
            
    badges_res = await db.from_("badges").select("*").eq("candidate_id", candidate_id).order("awarded_at", ascending=False)
    return {"badges": badges_res.data or []}

import base64
import io
import re
import os
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, field_validator
from typing import Any, Dict, List, Optional
from PIL import Image
import pdfplumber
import pytesseract
import httpx

from .auth_router import get_current_user
from .rate_limit import limiter
from .logger import logger
from .db import db

router = APIRouter(tags=["ai"])


@router.get("/api/ai/profile-stats")
async def get_profile_stats(user: Dict[str, Any] = Depends(get_current_user)):
    """Return role-based profile stats for the Layout sidebar."""
    role = user.get("role", "candidate")
    user_id = user["id"]

    if role == "admin":
        users_res = await db.from_("users").select("id", count="exact")
        exams_res = await db.from_("exams").select("id", count="exact")
        return {
            "title": "Platform Overview",
            "stats": [
                {"label": "Total Users", "value": str(users_res.count or 0)},
                {"label": "Total Exams", "value": str(exams_res.count or 0)},
            ]
        }
    elif role == "recruiter":
        exams_res = await db.from_("exams").select("id", count="exact").eq("created_by", user_id)
        drives_res = await db.from_("jobs").select("id", count="exact").eq("created_by", user_id)
        return {
            "title": "Recruiter Stats",
            "stats": [
                {"label": "Your Exams", "value": str(exams_res.count or 0)},
                {"label": "Your Drives", "value": str(drives_res.count or 0)},
            ]
        }
    elif role == "tpo":
        students_res = await db.from_("candidate_profiles").select("id", count="exact")
        return {
            "title": "TPO Overview",
            "stats": [
                {"label": "Total Students", "value": str(students_res.count or 0)},
            ]
        }
    else:
        attempts_res = await db.from_("attempts").select("id", count="exact").eq("candidate_id", user_id)
        return {
            "title": "Your Progress",
            "stats": [
                {"label": "Exams Taken", "value": str(attempts_res.count or 0)},
            ]
        }


class GenerateMcqRequest(BaseModel):
    topic: str
    difficulty: str
    count: Optional[int] = 5


class GenerateCodingRequest(BaseModel):
    topic: str
    difficulty: str
    count: Optional[int] = 1


class ImprovementReportRequest(BaseModel):
    attempt_id: str


@router.post("/api/ai/generate-mcq")
async def generate_mcq_endpoint(
    req: GenerateMcqRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    if not GROQ_API_KEY:
        return {
            "questions": [
                {
                    "question_text": f"Sample {req.topic} Question 1 ({req.difficulty})",
                    "option_a": "Option A",
                    "option_b": "Option B",
                    "option_c": "Option C",
                    "option_d": "Option D",
                    "correct_option": "A",
                    "marks": 1
                }
            ]
        }
    prompt = f"Generate {req.count} MCQ questions on topic '{req.topic}' with difficulty '{req.difficulty}'. Return JSON with key 'questions' containing array of objects with keys: question_text, option_a, option_b, option_c, option_d, correct_option (must be A, B, C, or D), and marks (integer)."
    try:
        data = await generate_json(prompt, systemPrompt="You are an expert technical test author. Always return valid JSON.")
        return data
    except Exception as e:
        logger.error(f"Failed to generate MCQs: {e}")
        return {
            "questions": [
                {
                    "question_text": f"What is a core concept of {req.topic}?",
                    "option_a": "Fundamental Principles",
                    "option_b": "Secondary Overhead",
                    "option_c": "Deprecated Standard",
                    "option_d": "None of the above",
                    "correct_option": "A",
                    "marks": 1
                }
            ]
        }


@router.post("/api/ai/generate-coding")
async def generate_coding_endpoint(
    req: GenerateCodingRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    if not GROQ_API_KEY:
        return {
            "questions": [
                {
                    "title": f"Solve {req.topic} Problem",
                    "description": f"Write a function to solve the {req.topic} problem.",
                    "difficulty": req.difficulty,
                    "starter_code": "def solution(data):\n    # Write code here\n    return data\n",
                    "test_cases": [{"input": "5", "expected_output": "5"}],
                    "marks": 10
                }
            ]
        }
    prompt = f"Generate {req.count} coding problem(s) on topic '{req.topic}' with difficulty '{req.difficulty}'. Return JSON with key 'questions' containing an array of objects with keys: title, description, difficulty, starter_code, test_cases (array of objects with input and expected_output), marks (integer)."
    try:
        data = await generate_json(prompt, systemPrompt="You are a senior software engineer designing coding assessments. Always return valid JSON.")
        return data
    except Exception as e:
        logger.error(f"Failed to generate coding question: {e}")
        return {
            "questions": [
                {
                    "title": f"Process {req.topic}",
                    "description": f"Given input array/string, process according to {req.topic} rules.",
                    "difficulty": req.difficulty,
                    "starter_code": "def solution(val):\n    return val\n",
                    "test_cases": [{"input": "10", "expected_output": "10"}],
                    "marks": 10
                }
            ]
        }


@router.post("/api/ai/improvement-report")
async def create_improvement_report(
    req: ImprovementReportRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    user_id = user["id"]
    attempt_res = await db.from_("attempts").select("*, exam:exam_id(title)").eq("id", req.attempt_id).maybeSingle()
    attempt = attempt_res.data
    exam_title = attempt.get("exam", {}).get("title", "Assessment") if attempt else "Assessment"
    score = attempt.get("score", 0) if attempt else 0
    
    summary = f"Completed {exam_title} with a score of {score}%."
    strengths = ["Technical Knowledge", "Problem Solving"]
    weaknesses = ["Time Management under pressure"]

    report_res = await db.from_("ai_feedback_reports").select("*").eq("attempt_id", req.attempt_id).maybeSingle()
    if report_res.data:
        return report_res.data

    report_payload = {
        "candidate_id": user_id,
        "attempt_id": req.attempt_id,
        "report_type": "improvement",
        "content": summary,
        "strengths": strengths,
        "improvements": weaknesses
    }
    ins = await db.from_("ai_feedback_reports").insert(report_payload).select().single()
    return ins.data or report_payload


MAX_RESUME_TEXT_LENGTH = 20000
MAX_PROMPT_LENGTH = 8000
MAX_BASE64_FILE_LENGTH = 8_000_000  # ~6MB decoded

from .config import GROQ_API_KEY, GROQ_MODEL

# ─── Types and Constants ───

class ResumeParseRequest(BaseModel):
    resume_text: str
    job_skills: Optional[List[str]] = []

    @field_validator("resume_text")
    @classmethod
    def validate_resume_text_length(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("resume_text must not be empty")
        if len(v) > MAX_RESUME_TEXT_LENGTH:
            raise ValueError(f"resume_text exceeds maximum length of {MAX_RESUME_TEXT_LENGTH} characters")
        return v

class MarksheetFile(BaseModel):
    name: str
    mimeType: str
    data: str # base64

    @field_validator("data")
    @classmethod
    def validate_file_size(cls, v: str) -> str:
        if len(v) > MAX_BASE64_FILE_LENGTH:
            raise ValueError("uploaded file exceeds the maximum allowed size")
        return v

class ProctoringVerifyRequest(BaseModel):
    base64DataUrl: str

    @field_validator("base64DataUrl")
    @classmethod
    def validate_snapshot_size(cls, v: str) -> str:
        if not v:
            raise ValueError("base64DataUrl must not be empty")
        if len(v) > MAX_BASE64_FILE_LENGTH:
            raise ValueError("snapshot exceeds the maximum allowed size")
        return v

class GenerateTextRequest(BaseModel):
    prompt: str
    systemPrompt: Optional[str] = None

    @field_validator("prompt")
    @classmethod
    def validate_prompt_length(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("prompt must not be empty")
        if len(v) > MAX_PROMPT_LENGTH:
            raise ValueError(f"prompt exceeds maximum length of {MAX_PROMPT_LENGTH} characters")
        return v

class GenerateJsonRequest(BaseModel):
    prompt: str
    systemPrompt: Optional[str] = None

    @field_validator("prompt")
    @classmethod
    def validate_prompt_length(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("prompt must not be empty")
        if len(v) > MAX_PROMPT_LENGTH:
            raise ValueError(f"prompt exceeds maximum length of {MAX_PROMPT_LENGTH} characters")
        return v

BRANCH_MAP = {
    "COMPUTER SCIENCE AND ENGINEERING": "CSE",
    "COMPUTER SCIENCE & ENGINEERING": "CSE",
    "COMPUTER SCIENCE AND ENGINEERING (AI&ML)": "CSE-AIML",
    "COMPUTER SCIENCE AND ENGINEERING (DATA SCIENCE)": "CSE-DS",
    "COMPUTER SCIENCE": "CSE",
    "CSE": "CSE",
    "INFORMATION TECHNOLOGY": "IT",
    "IT": "IT",
    "ELECTRONICS AND COMMUNICATION ENGINEERING": "ECE",
    "ELECTRONICS & COMMUNICATION ENGINEERING": "ECE",
    "ELECTRONICS AND COMMUNICATION": "ECE",
    "ECE": "ECE",
    "ELECTRICAL AND ELECTRONICS ENGINEERING": "EEE",
    "ELECTRICAL & ELECTRONICS ENGINEERING": "EEE",
    "ELECTRICAL AND ELECTRONICS": "EEE",
    "EEE": "EEE",
    "MECHANICAL ENGINEERING": "MECH",
    "MECHANICAL": "MECH",
    "MECH": "MECH",
    "CIVIL ENGINEERING": "CIVIL",
    "CIVIL": "CIVIL",
    "CHEMICAL ENGINEERING": "CHEM",
    "CHEMICAL": "CHEM",
    "BIOTECHNOLOGY": "BT",
    "BT": "BT",
    "COMPUTER SCIENCE AND BUSINESS SYSTEMS": "CSBS",
    "CSBS": "CSBS",
    "ARTIFICIAL INTELLIGENCE AND MACHINE LEARNING": "AIML",
    "ARTIFICIAL INTELLIGENCE & MACHINE LEARNING": "AIML",
    "AI AND ML": "AIML",
    "AI & ML": "AIML",
    "AIML": "AIML",
    "ARTIFICIAL INTELLIGENCE AND DATA SCIENCE": "AIDS",
    "AI AND DATA SCIENCE": "AIDS",
    "AIDS": "AIDS",
    "DATA SCIENCE": "DS",
    "DS": "DS",
    "ELECTRONICS AND COMPUTER ENGINEERING": "ECE",
}

def normalize_branch(raw: str) -> str:
    upper = raw.strip().upper()
    upper = re.sub(r"\s+", " ", upper)
    if upper in BRANCH_MAP:
        return BRANCH_MAP[upper]
    for key, val in BRANCH_MAP.items():
        if key in upper:
            return val
    return upper[:10]

def infer_graduation_year(text: str) -> Optional[int]:
    # Range patterns "2022-23", "2023-2024"
    range_match = re.search(r"\b(20\d{2})[–-](20\d{2}|\d{2})\b", text)
    if range_match:
        second = range_match.group(2)
        end = int("20" + second) if len(second) == 2 else int(second)
        return end

    sem_map = {
        "I": 3, "II": 2, "III": 1, "IV": 0,
        "1ST": 3, "2ND": 2, "3RD": 1, "4TH": 0,
        "FIRST": 3, "SECOND": 2, "THIRD": 1, "FOURTH": 0,
    }
    sem_match = re.search(
        r"\b(IV|III|II|I|4TH|3RD|2ND|1ST|FOURTH|THIRD|SECOND|FIRST)\s+(?:YEAR|B\.?TECH|B\.?E\.?)\b",
        text.upper()
    )
    years = [int(y) for y in re.findall(r"\b20\d{2}\b", text)]
    years.sort()
    latest_year = years[-1] if years else 2026 # Default backup

    if sem_match:
        add = sem_map.get(sem_match.group(1), 0)
        return latest_year + add

    return latest_year if years else None

def parse_marksheet_text(text: str, file_name: str):
    warnings = []
    upper = text.upper()

    # 1. Roll Number
    roll_number = ""
    roll_patterns = [
        r"(?:hall\s*ticket\s*(?:no\.?|number|#)?|roll\s*(?:no\.?|number|#)?|register\s*(?:no\.?|number|#)?|regd\.?\s*(?:no\.?|number|#)?|enrollment\s*(?:no\.?|number|#)?)\s*[:\-.]?\s*([A-Z0-9]{6,15})",
        r"\b(\d{2}[A-Z]{2,4}\d{3,6})\b",
        r"\b(\d{6,10})\b"
    ]
    for pat in roll_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            roll_number = m.group(1).strip().upper()
            break
    if not roll_number:
        warnings.append("roll_number not detected")

    # 2. Student Name
    name = ""
    name_patterns = [
        r"(?:name\s+of\s+(?:the\s+)?student|student['\"]?s?\s+name|name)\s*[:\-.]?\s*([A-Z][A-Za-z\t .]{2,45})"
    ]
    for pat in name_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            candidate = re.sub(r"\s+", " ", m.group(1).strip())
            skip = re.compile(r"university|college|institute|board|marks|grade|result|branch|dept|department|subject|course", re.IGNORECASE)
            if not skip.search(candidate) and len(candidate.split(" ")) <= 6:
                name = candidate
                break

    if not name:
        for line in text.split("\n"):
            t = line.strip()
            if re.match(r"^[A-Z][A-Z\s.]{4,40}$", t) and len(t.split(" ")) >= 2:
                skip = re.compile(r"UNIVERSITY|COLLEGE|INSTITUTE|BOARD|MARKS|GRADE|RESULT|BRANCH|DEPT|SUBJECT|COURSE|REPORT|SHEET")
                if not skip.search(t):
                    name = re.sub(r"\s+", " ", t).strip()
                    break
    if not name:
        warnings.append("name not detected")

    # 3. Branch
    branch = ""
    branch_patterns = [
        r"(?:branch|department|dept|programme|program|specialization|specialisation)\s*[:\-.]?\s*([A-Za-z\s&()]{3,60})"
    ]
    for pat in branch_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            branch = normalize_branch(m.group(1).split("\n")[0].strip())
            break
    if not branch:
        for key, val in BRANCH_MAP.items():
            if key in upper:
                branch = val
                break
    if not branch:
        warnings.append("branch not detected")

    # 4. CGPA
    cgpa = float("nan")
    cgpa_patterns = [
        r"(?:c\.?g\.?p\.?a\.?|cumulative\s+grade\s+point\s+average)\s*[:\-.]?\s*(\d{1,2}\.\d{1,2})",
        r"(?:overall|total)\s+(?:cgpa|gpa)\s*[:\-.]?\s*(\d{1,2}\.\d{1,2})",
        r"cgpa\D{0,10}?(\d{1,2}\.\d{1,2})"
    ]
    for pat in cgpa_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            val = float(m.group(1))
            if 1.0 <= val <= 10.0:
                cgpa = val
                break
    if cgpa != cgpa: # nan check
        warnings.append("cgpa not detected")

    # 5. Graduation Year
    graduation_year = float("nan")
    inferred = infer_graduation_year(text)
    if inferred:
        graduation_year = float(inferred)
    if graduation_year != graduation_year:
        warnings.append("graduation_year not detected")

    # 6. Confidence score
    fields = [
        roll_number,
        name,
        branch,
        cgpa == cgpa,
        graduation_year == graduation_year
    ]
    confidence = sum(1 for f in fields if f) / 5.0

    return {
        "roll_number": roll_number,
        "name": name,
        "branch": branch,
        "cgpa": cgpa if cgpa == cgpa else 0.0,
        "graduation_year": int(graduation_year) if graduation_year == graduation_year else 0,
        "confidence": confidence,
        "source_file": file_name,
        "warnings": warnings,
    }

# ─── Pure AI helper endpoints ───

def pick_skills(text: str) -> List[str]:
    known = ["javascript", "typescript", "python", "java", "c++", "sql", "react", "node", "express", "postgres", "mongodb", "aws", "docker", "git", "html", "css", "dsa", "machine learning"]
    words = re.sub(r"[^a-z0-9+#.\s-]", " ", text.lower())
    words = re.sub(r"\s+", " ", words).strip()
    return [skill for skill in known if skill in words]

@router.post("/api/ai/resume-parse")
@limiter.limit("20/minute")
async def resume_parse(
    request: Request,
    req: ResumeParseRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    skills = pick_skills(req.resume_text)
    matched = [s for s in req.job_skills if s.lower() in skills] if req.job_skills else []
    
    if req.job_skills:
        score = round((len(matched) / len(req.job_skills)) * 100)
    else:
        score = min(95, len(skills) * 12)

    summary = f"Profile shows strength in {', '.join(skills[:5])} with a {score}% role-fit signal." if skills else "Resume text was processed, but no common technical skills were detected."

    return {
        "skills": skills,
        "matchedSkills": matched,
        "skillMatchScore": score,
        "summary": summary,
        "improvements": [
            "Add project outcomes with measurable impact.",
            "Mention tools, frameworks, and deployment details explicitly.",
            "Keep resume bullets action-oriented and role-specific.",
        ],
    }

# ─── Internal loopback endpoints called by Express ───

@router.post("/internal/ocr")
@limiter.limit("10/minute")
async def ocr_marksheet(
    request: Request,
    file: MarksheetFile,
    user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        file_bytes = base64.b64decode(file.data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 encoding")

    text = ""
    if file.mimeType == "application/pdf":
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                text = "\n".join([page.extract_text() or "" for page in pdf.pages])
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"PDF extraction failed: {str(exc)}")
    else:
        try:
            image = Image.open(io.BytesIO(file_bytes))
            text = pytesseract.image_to_string(image)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"OCR extraction failed: {str(exc)}")

    result = parse_marksheet_text(text, file.name)
    
    # If confidence is low, and GROQ_API_KEY is available, use Groq to correct/validate
    if result["confidence"] < 0.6 and GROQ_API_KEY:
        extraction_prompt = """
You are extracting student account data from an Indian college semester grade report.
Return only valid JSON. Do not wrap it in markdown.

Extract:
- roll_number: use Hall Ticket No. if present. If not, use Roll Number/Register Number.
- name: student name exactly as shown, title case if possible.
- branch: normalize to a short code, e.g. COMPUTER SCIENCE AND ENGINEERING -> CSE, INFORMATION TECHNOLOGY -> IT, ELECTRONICS AND COMMUNICATION ENGINEERING -> ECE, ELECTRICAL AND ELECTRONICS ENGINEERING -> EEE, MECHANICAL ENGINEERING -> MECH, CIVIL ENGINEERING -> CIVIL.
- cgpa: use Cumulative Grade Point Average (CGPA), not SGPA.
- graduation_year: infer from examination date/year if needed. If the report says semester in 2026 and it is B.Tech III semester, use 2028. If unsure, use the visible exam year.
- confidence: number from 0 to 1.
- warnings: array of short strings for missing/uncertain fields.

Schema:
{
  "roll_number": "24261A0522",
  "name": "Student Name",
  "branch": "CSE",
  "cgpa": 8.72,
  "graduation_year": 2028,
  "confidence": 0.94,
  "warnings": []
}
"""
        prompt = f"""
        {extraction_prompt}
        
        Below is the raw text extracted via OCR from the marksheet file "{file.name}":
        ---
        {"Detected Roll Number: " + result["roll_number"] if result["roll_number"] else ""}
        {"Detected Name: " + result["name"] if result["name"] else ""}
        {"Detected Branch: " + result["branch"] if result["branch"] else ""}
        {"Detected CGPA: " + str(result["cgpa"]) if result["cgpa"] else ""}
        {"Detected Graduation Year: " + str(result["graduation_year"]) if result["graduation_year"] else ""}
        Raw OCR Text:
        {text}
        ---
        Please verify the fields, correct any typographical OCR errors, and output the clean JSON object matching the schema.
        """
        try:
            import json
            payload = {
                "model": GROQ_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            }
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    json=payload,
                    headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
                )
                if response.status_code == 200:
                    data = response.json()
                    content = data["choices"][0]["message"]["content"]
                    cleaned = content.strip().replace("```json", "").replace("```", "").strip()
                    parsed = json.loads(cleaned)
                    
                    if parsed.get("roll_number"):
                        result["roll_number"] = str(parsed["roll_number"]).strip().upper()
                    if parsed.get("name"):
                        result["name"] = str(parsed["name"]).strip()
                    if parsed.get("branch"):
                        result["branch"] = normalize_branch(str(parsed["branch"]))
                    if parsed.get("cgpa") is not None:
                        try:
                            result["cgpa"] = float(parsed["cgpa"])
                        except ValueError:
                            pass
                    if parsed.get("graduation_year") is not None:
                        try:
                            result["graduation_year"] = int(parsed["graduation_year"])
                        except ValueError:
                            pass
                    if parsed.get("confidence") is not None:
                        result["confidence"] = float(parsed["confidence"])
                    if parsed.get("warnings"):
                        result["warnings"] = [str(w) for w in parsed["warnings"]]
        except Exception as exc:
            logger.error(f"[Gateway] Marksheet AI correction failed: {str(exc)}")

    if not result["roll_number"] and not result["name"]:
        raise HTTPException(status_code=400, detail=f"Could not extract student data from {file.name}.")

    return result

@router.post("/internal/proctoring/verify")
@limiter.limit("30/minute")
async def verify_proctoring_snapshot(
    request: Request,
    req: ProctoringVerifyRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured on Python backend")

    # Clean data url
    data_url = req.base64DataUrl
    if not data_url.startswith("data:"):
        data_url = f"data:image/jpeg;base64,{data_url}"

    prompt = """
You are an expert remote proctoring AI auditing agent.
Analyze the webcam snapshot taken during a high-stakes exam and check for security violations.
Provide your evaluation on the following fields:
1. single_person: Is there EXACTLY ONE candidate visible in the frame? If the frame is empty, dark, or no candidate face is visible, set to false.
2. multiple_people: Are there multiple faces or people visible in the frame? (Potential cheating/collusion/external help).
3. looking_away: Is the candidate looking completely away from the screen, down at their lap, or sideways to talk to someone?
4. phone_detected: Is there a smartphone, secondary screen, tablet, or cheat-sheet book/notes visible?

Return ONLY valid JSON matching this schema:
{
  "single_person": true,
  "multiple_people": false,
  "looking_away": false,
  "phone_detected": false,
  "summary": "Brief 1-sentence observation, e.g., 'Candidate is focused on screen.'"
}
"""

    payload = {
        "model": "llama-3.2-11b-vision-preview",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                json=payload,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
            )
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail="Groq Vision API failed")
            
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            
            # Clean response text
            cleaned = content.strip().replace("```json", "").replace("```", "").strip()
            return Response(content=cleaned, media_type="application/json")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Webcam analysis failed: {str(exc)}")

@router.post("/internal/ai/generate-text")
@limiter.limit("15/minute")
async def generate_text_route(
    request: Request,
    req: GenerateTextRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured")

    messages = []
    if req.systemPrompt:
        messages.append({"role": "system", "content": req.systemPrompt})
    messages.append({"role": "user", "content": req.prompt})

    payload = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": 0.35,
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        try:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                json=payload,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
            )
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail="Groq API failed")
            data = response.json()
            return {"text": data["choices"][0]["message"]["content"]}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"AI generation failed: {str(exc)}")

@router.post("/internal/ai/generate-json")
@limiter.limit("15/minute")
async def generate_json_route(
    request: Request,
    req: GenerateJsonRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured")

    messages = []
    if req.systemPrompt:
        messages.append({"role": "system", "content": req.systemPrompt})
    messages.append({"role": "user", "content": req.prompt})

    payload = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        try:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                json=payload,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
            )
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail="Groq JSON API failed")
            data = response.json()
            return Response(content=data["choices"][0]["message"]["content"], media_type="application/json")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"AI JSON generation failed: {str(exc)}")

def has_ai_key() -> bool:
    return bool(GROQ_API_KEY)

# NOTE: this is the function other modules (interview.py, interview_service.py,
# recruiter.py, recruiter_service.py) import directly as `from .ai import
# generate_json`. It previously shared its name with the /internal/ai/generate-json
# ROUTE HANDLER above, which silently shadowed this definition in the module
# namespace (Python executes top-to-bottom; the second `def generate_json`
# overwrote the first). The route itself still worked, because FastAPI captures
# the route function at decoration time — but anything doing `from .ai import
# generate_json` after that point got THIS function, not the route handler,
# which was accidental and confusing. Renaming the route handler above
# (generate_json -> generate_json_route) removes the collision entirely.
async def generate_json(prompt: str, systemPrompt: Optional[str] = None) -> dict:
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not configured")

    messages = []
    if systemPrompt:
        messages.append({"role": "system", "content": systemPrompt})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
        )
        if response.status_code != 200:
            raise ValueError(f"Groq API failed: {response.text}")
        data = response.json()
        import json
        content = data["choices"][0]["message"]["content"]
        return json.loads(content.strip().replace("```json", "").replace("```", "").strip())

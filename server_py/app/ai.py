import base64
import io
import re
import os
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
from PIL import Image
import pdfplumber
import pytesseract
import httpx

router = APIRouter(tags=["ai"])

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# ─── Types and Constants ───

class ResumeParseRequest(BaseModel):
    resume_text: str
    job_skills: Optional[List[str]] = []

class MarksheetFile(BaseModel):
    name: str
    mimeType: str
    data: str # base64

class ProctoringVerifyRequest(BaseModel):
    base64DataUrl: str

class GenerateTextRequest(BaseModel):
    prompt: str
    systemPrompt: Optional[str] = None

class GenerateJsonRequest(BaseModel):
    prompt: str
    systemPrompt: Optional[str] = None

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
async def resume_parse(req: ResumeParseRequest):
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
async def ocr_marksheet(file: MarksheetFile):
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
            print(f"[Gateway] Marksheet AI correction failed: {str(exc)}")

    if not result["roll_number"] and not result["name"]:
        raise HTTPException(status_code=400, detail=f"Could not extract student data from {file.name}.")

    return result

@router.post("/internal/proctoring/verify")
async def verify_proctoring_snapshot(req: ProctoringVerifyRequest):
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
async def generate_text(req: GenerateTextRequest):
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
async def generate_json(req: GenerateJsonRequest):
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

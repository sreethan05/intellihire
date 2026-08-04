import os
import datetime
import bcrypt
import jwt
from typing import Optional, Dict, Any
from .db import db, get_connection

from .config import JWT_SECRET, NODE_ENV, FILE_STORAGE_DIR
from .logger import logger

storage_root = os.path.abspath(FILE_STORAGE_DIR)
os.makedirs(storage_root, exist_ok=True)
os.makedirs(os.path.join(storage_root, "offers"), exist_ok=True)
os.makedirs(os.path.join(storage_root, "resumes"), exist_ok=True)

def is_production() -> bool:
    return NODE_ENV == "production"

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def check_password(password: str, hashed: str) -> bool:
    try:
        h = hashed
        if isinstance(h, str):
            h = h.encode("utf-8")
        return bcrypt.checkpw(password.encode("utf-8"), h)
    except Exception:
        return False

async def record_pipeline_stage(
    candidate_id: str,
    job_id: str,
    stage: str,
    notes: Optional[str] = None,
    updated_by: Optional[str] = None
) -> None:
    try:
        now_str = datetime.datetime.utcnow().isoformat()
        
        with get_connection() as conn:
            with conn.cursor() as cur:
                # 1. Exit any existing active stages
                cur.execute(
                    """UPDATE candidate_pipeline 
                       SET exited_at = %s 
                       WHERE candidate_id = %s AND job_id = %s AND exited_at IS NULL""",
                    [now_str, candidate_id, job_id]
                )
                
                # 2. Insert new stage
                cur.execute(
                    """INSERT INTO candidate_pipeline (candidate_id, job_id, stage, entered_at, exited_at, notes, updated_by)
                       VALUES (%s, %s, %s, %s, NULL, %s, %s)
                       ON CONFLICT (candidate_id, job_id, stage) 
                       DO UPDATE SET entered_at = %s, exited_at = NULL, notes = %s, updated_by = %s""",
                    [candidate_id, job_id, stage, now_str, notes, updated_by, now_str, notes, updated_by]
                )
                conn.commit()
    except Exception as exc:
        logger.error(f"[Pipeline] Failed to record pipeline stage transition to {stage}: {str(exc)}")

import json
import redis
import asyncio

from .config import REDIS_URL
redis_client = None
if REDIS_URL:
    try:
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    except Exception:
        pass

EMAIL_TEMPLATES = {
    "exam_assigned": {
        "subject": "New Exam Assigned: {exam_title}",
        "html": """<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px;border-radius:12px">
<div style="background:#4f46e5;color:white;padding:24px;border-radius:8px 8px 0 0;text-align:center">
<h1 style="margin:0;font-size:24px">New Exam Assigned</h1>
</div>
<div style="background:white;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
<p style="color:#475569;font-size:14px">Hello {candidate_name},</p>
<p style="color:#475569;font-size:14px">You have been assigned a new exam: <strong>{exam_title}</strong>.</p>
<div style="background:#f1f5f9;padding:16px;border-radius:8px;margin:16px 0">
<p style="margin:0;color:#64748b;font-size:13px"><strong>Duration:</strong> {duration} minutes</p>
<p style="margin:4px 0 0;color:#64748b;font-size:13px"><strong>Total Marks:</strong> {total_marks}</p>
</div>
<a href="{app_url}/candidate/my-exams" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold">Start Exam</a>
</div>
</div>""",
    },
    "exam_result": {
        "subject": "Exam Result Published: {exam_title}",
        "html": """<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px;border-radius:12px">
<div style="background:{status_color};color:white;padding:24px;border-radius:8px 8px 0 0;text-align:center">
<h1 style="margin:0;font-size:24px">Exam Result Published</h1>
</div>
<div style="background:white;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
<p style="color:#475569;font-size:14px">Hello {candidate_name},</p>
<p style="color:#475569;font-size:14px">Your results for <strong>{exam_title}</strong> have been published.</p>
<div style="background:#f1f5f9;padding:16px;border-radius:8px;margin:16px 0;text-align:center">
<p style="margin:0;font-size:32px;font-weight:bold;color:{status_color}">{score}/{total_marks}</p>
<p style="margin:4px 0 0;color:#64748b;font-size:13px">Status: {status_text}</p>
</div>
</div>
</div>""",
    },
    "interview_scheduled": {
        "subject": "AI Interview Scheduled: {exam_title}",
        "html": """<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px;border-radius:12px">
<div style="background:#7c3aed;color:white;padding:24px;border-radius:8px 8px 0 0;text-align:center">
<h1 style="margin:0;font-size:24px">AI Interview Scheduled</h1>
</div>
<div style="background:white;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
<p style="color:#475569;font-size:14px">Hello {candidate_name},</p>
<p style="color:#475569;font-size:14px">An AI interview has been scheduled for you.</p>
<div style="background:#f1f5f9;padding:16px;border-radius:8px;margin:16px 0">
<p style="margin:0;color:#64748b;font-size:13px"><strong>Start:</strong> {start_time}</p>
<p style="margin:4px 0 0;color:#64748b;font-size:13px"><strong>End:</strong> {end_time}</p>
<p style="margin:4px 0 0;color:#64748b;font-size:13px"><strong>Duration:</strong> {duration} minutes</p>
</div>
<a href="{app_url}/candidate/interview" style="display:inline-block;background:#7c3aed;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold">Join Interview</a>
</div>
</div>""",
    },
    "offer_letter": {
        "subject": "Offer Letter from {company_name}",
        "html": """<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px;border-radius:12px">
<div style="background:#059669;color:white;padding:24px;border-radius:8px 8px 0 0;text-align:center">
<h1 style="margin:0;font-size:24px">Congratulations!</h1>
</div>
<div style="background:white;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
<p style="color:#475569;font-size:14px">Hello {candidate_name},</p>
<p style="color:#475569;font-size:14px">You have received an offer from <strong>{company_name}</strong> for the position of <strong>{job_title}</strong>.</p>
<a href="{app_url}/candidate/offers" style="display:inline-block;background:#059669;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold">View Offer</a>
</div>
</div>""",
    },
}

def render_email_template(template_name: str, **kwargs) -> tuple:
    """Render an email template with the given parameters. Returns (subject, html_body)."""
    tpl = EMAIL_TEMPLATES.get(template_name)
    if not tpl:
        return kwargs.get("subject", "IntelliHire Notification"), kwargs.get("body", "")
    subject = tpl["subject"].format(**kwargs)
    html = tpl["html"].format(**kwargs)
    return subject, html

def send_email(to: str, subject: str, body: str, html: str = None) -> bool:
    logger.info(f"[Email] Sending email to {to} | Subject: {subject} | Body: {body[:100]}...")
    return True

async def send_email_async(to: str, subject: str, body: str, html: str = None) -> bool:
    return await asyncio.to_thread(send_email, to, subject, body, html)

async def send_templated_email(to: str, template_name: str, **kwargs) -> bool:
    """Send an email using a pre-defined HTML template."""
    subject, html = render_email_template(template_name, **kwargs)
    plain_body = kwargs.get("body", subject)
    return await send_email_async(to, subject, plain_body, html)

def send_drive_registered_email(to: str, name: str, title: str, company: str, app_url: str):
    subject = f"Registered for {title} at {company}"
    body = f"Hello {name},\n\nYou have been successfully registered for the recruitment drive for {title} at {company}.\nLog in here: {app_url}"
    return send_email(to, subject, body)

def serialize_drive_colleges(description: str, college_ids: list, ai_config: dict = None) -> str:
    metadata = {"college_ids": college_ids, "aiConfig": ai_config}
    return f"{description}\n\n===METADATA===\n{json.dumps(metadata)}"

def deserialize_drive_colleges(description: str) -> dict:
    parts = (description or "").split("\n\n===METADATA===\n")
    if len(parts) > 1:
        try:
            metadata = json.loads(parts[1])
            return {
                "description": parts[0],
                "college_ids": metadata.get("college_ids") or [],
                "aiConfig": metadata.get("aiConfig") or {
                    "persona": "", "instructions": "", "rubric": "", "examples": [], "temperature": 0.4
                }
            }
        except Exception:
            pass
    return {
        "description": description or "",
        "college_ids": [],
        "aiConfig": {
            "persona": "", "instructions": "", "rubric": "", "examples": [], "temperature": 0.4
        }
    }

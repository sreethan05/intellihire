import os
import datetime
import bcrypt
import jwt
from typing import Optional, Dict, Any
from .db import db, get_connection
import psycopg2

JWT_SECRET = os.getenv("JWT_SECRET")
NODE_ENV = os.getenv("NODE_ENV", "development")
FILE_STORAGE_DIR = os.getenv("FILE_STORAGE_DIR", "uploads")

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
        print(f"[Pipeline] Failed to record pipeline stage transition to {stage}: {str(exc)}")

import json
import redis
import asyncio

REDIS_URL = os.getenv("REDIS_URL")
redis_client = None
if REDIS_URL:
    try:
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    except Exception:
        pass

def send_email(to: str, subject: str, body: str) -> bool:
    print(f"[Email] Sending email to {to} | Subject: {subject} | Body: {body[:100]}...")
    return True

async def send_email_async(to: str, subject: str, body: str) -> bool:
    return await asyncio.to_thread(send_email, to, subject, body)

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

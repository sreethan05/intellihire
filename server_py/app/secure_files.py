import os
import re
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from .auth_router import get_current_user
from .db import db
from .utils import storage_root

router = APIRouter(prefix="/api/files", tags=["private_files"])

_FILENAME_RE = re.compile(r"^[A-Za-z0-9._-]+\.pdf$")


def _safe_pdf_path(folder: str, filename: str) -> str:
    if not _FILENAME_RE.fullmatch(filename):
        raise HTTPException(status_code=404, detail="File not found")
    base = os.path.abspath(os.path.join(storage_root, folder))
    path = os.path.abspath(os.path.join(base, filename))
    if not path.startswith(base + os.sep) or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")
    return path


async def _candidate_can_read_resume(filename: str, user: Dict[str, Any]) -> bool:
    url = f"/api/files/resumes/{filename}"
    res = await db.from_("candidate_profiles").select("user_id").eq("resume_url", url).maybeSingle()
    if not res.data:
        return False
    owner_id = res.data["user_id"]
    if owner_id == user["id"]:
        return True
    if user.get("role") not in {"recruiter", "admin"}:
        return False
    if user.get("role") == "admin":
        return True
    status = await db.from_("candidate_status").select("candidate_id").eq("candidate_id", owner_id).eq("job_id", user.get("job_id", "")).maybeSingle()
    return bool(status.data)


@router.get("/resumes/{filename}")
async def download_resume(filename: str, user: Dict[str, Any] = Depends(get_current_user)):
    path = _safe_pdf_path("resumes", filename)
    url = f"/api/files/resumes/{filename}"
    profile = await db.from_("candidate_profiles").select("user_id").eq("resume_url", url).maybeSingle()
    if not profile.data:
        raise HTTPException(status_code=404, detail="File not found")
    owner_id = profile.data["user_id"]
    allowed = owner_id == user["id"]
    if user.get("role") == "admin":
        allowed = True
    elif user.get("role") == "recruiter":
        jobs = await db.from_("jobs").select("id").eq("created_by", user["id"])
        job_ids = [j["id"] for j in (jobs.data or [])]
        if job_ids:
            status = await db.from_("candidate_status").select("candidate_id").eq("candidate_id", owner_id).in_("job_id", job_ids).maybeSingle()
            allowed = bool(status.data)
    if not allowed:
        raise HTTPException(status_code=403, detail="You are not authorized to access this resume")
    return FileResponse(path, media_type="application/pdf", filename=filename)


@router.get("/offers/{filename}")
async def download_offer(filename: str, user: Dict[str, Any] = Depends(get_current_user)):
    path = _safe_pdf_path("offers", filename)
    url = f"/api/files/offers/{filename}"
    status = await db.from_("candidate_status").select("candidate_id, job_id").eq("offer_letter_url", url).maybeSingle()
    if not status.data:
        raise HTTPException(status_code=404, detail="File not found")
    candidate_id = status.data["candidate_id"]
    job_id = status.data["job_id"]
    allowed = candidate_id == user["id"] or user.get("role") == "admin"
    if user.get("role") == "recruiter":
        job = await db.from_("jobs").select("id").eq("id", job_id).eq("created_by", user["id"]).maybeSingle()
        allowed = bool(job.data)
    if not allowed:
        raise HTTPException(status_code=403, detail="You are not authorized to access this offer letter")
    return FileResponse(path, media_type="application/pdf", filename=filename)

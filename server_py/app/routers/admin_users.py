from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth_router import get_current_user, require_roles
from ..audit import record_audit_event
from ..db import db, get_connection
from ..utils import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin_users"])

class CreateRecruiterRequest(BaseModel):
    name: str
    email: str
    password: str

class CreateTpoRequest(BaseModel):
    name: str
    email: str
    password: str
    college_id: str

@router.post("/create-recruiter")
async def create_recruiter(req: CreateRecruiterRequest, user: Dict[str, Any] = Depends(require_roles(["admin"]))):
    pwd_hash = hash_password(req.password)
    res = await db.from_("users").insert({
        "name": req.name,
        "email": req.email.strip().lower(),
        "password_hash": pwd_hash,
        "role": "recruiter",
        "created_by": user["id"]
    }).select().single()
    
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.message)
    await record_audit_event(actor_id=user["id"], action="ROLE_ASSIGNED", resource="user", resource_id=res.data["id"], payload={"role": "recruiter"})
    return {"message": "Recruiter created successfully", "recruiter": res.data}

@router.post("/create-tpo")
async def create_tpo(req: CreateTpoRequest, user: Dict[str, Any] = Depends(require_roles(["admin"]))):
    pwd_hash = hash_password(req.password)
    res = await db.from_("users").insert({
        "name": req.name,
        "email": req.email.strip().lower(),
        "password_hash": pwd_hash,
        "role": "tpo",
        "college_id": req.college_id,
        "created_by": user["id"]
    }).select().single()
    
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.message)
    await record_audit_event(actor_id=user["id"], action="ROLE_ASSIGNED", resource="user", resource_id=res.data["id"], payload={"role": "tpo", "college_id": req.college_id})
    return {"message": "TPO created successfully", "tpo": res.data}

@router.get("/recruiters")
async def get_recruiters(user: Dict[str, Any] = Depends(require_roles(["admin"]))):
    res = await db.from_("users").select("id, name, email, created_at").eq("role", "recruiter").eq("created_by", user["id"]).order("created_at", False)
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.message)
    return {"recruiters": res.data or []}

@router.get("/tpos")
async def get_tpos(user: Dict[str, Any] = Depends(require_roles(["admin"]))):
    from psycopg.rows import dict_row
    query = """
        SELECT u.id, u.name, u.email, u.college_id, u.created_at, c.name as college_name, c.code as college_code
        FROM users u
        LEFT JOIN colleges c ON c.id = u.college_id
        WHERE u.role = 'tpo'
        ORDER BY u.created_at DESC
    """
    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query)
            rows = cur.fetchall()
            res_list = []
            for r in rows:
                res_list.append({
                    "id": r["id"],
                    "name": r["name"],
                    "email": r["email"],
                    "college_id": r["college_id"],
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                    "college": {"name": r["college_name"], "code": r["college_code"]} if r["college_id"] else None
                })
            return {"tpos": res_list}

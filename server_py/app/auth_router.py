import os
import secrets
import hashlib
import datetime
import bcrypt
import jwt
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
from .db import db, transaction

from psycopg.rows import dict_row
from .config import JWT_SECRET, NODE_ENV
from .rate_limit import limiter
from .errors import error_response

router = APIRouter(prefix="/api/auth", tags=["auth"])

ACCESS_TOKEN_TTL_SECONDS = 15 * 60
REFRESH_TOKEN_TTL_DAYS = 30

_TZ_UTC = datetime.timezone.utc


def _now_utc() -> datetime.datetime:
    """Return a timezone-aware UTC datetime (replaces deprecated utcnow)."""
    return datetime.datetime.now(_TZ_UTC)

class LoginRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None

def is_production() -> bool:
    return NODE_ENV == "production"

def generate_token(user: Dict[str, Any]) -> str:
    payload = {
        "id": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "exp": _now_utc() + datetime.timedelta(seconds=ACCESS_TOKEN_TTL_SECONDS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def verify_token(token: str) -> Dict[str, Any]:
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])

def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)

def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)

def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def set_session_cookies(response: Response, access_token: str, refresh_token: str) -> str:
    csrf_token = generate_csrf_token()
    
    secure_flag = is_production()
    
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=ACCESS_TOKEN_TTL_SECONDS,
        httponly=True,
        secure=secure_flag,
        samesite="lax",
        path="/"
    )
    
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=secure_flag,
        samesite="lax",
        path="/"
    )
    
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        max_age=REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
        httponly=False,
        secure=secure_flag,
        samesite="lax",
        path="/"
    )
    
    # Clear older cookies if any
    response.delete_cookie("token", path="/")
    return csrf_token

def clear_session_cookies(response: Response):
    secure_flag = is_production()
    response.delete_cookie("access_token", path="/", httponly=True, samesite="lax", secure=secure_flag)
    response.delete_cookie("refresh_token", path="/", httponly=True, samesite="lax", secure=secure_flag)
    response.delete_cookie("token", path="/", httponly=True, samesite="lax", secure=secure_flag)
    response.delete_cookie("csrf_token", path="/", samesite="lax", secure=secure_flag)

# Authentication dependency
async def get_current_user(request: Request) -> Dict[str, Any]:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        decoded = verify_token(token)
        # Re-fetch the user from DB so that role changes
        # take effect within the access-token window rather than only on expiry.
        res = await db.from_("users").select(
            "id, email, role"
        ).eq("id", decoded["id"]).maybeSingle()
        user_row = res.data if res else None
        if not user_row:
            raise HTTPException(status_code=401, detail="User no longer exists")
        # Merge DB-truth role/email back so downstream code sees current values.
        decoded["role"] = user_row["role"]
        decoded["email"] = user_row["email"]
        return decoded
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_roles(roles: list):
    async def dependency(user: Dict[str, Any] = Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Forbidden - Insufficient permissions")
        return user
    return dependency

@router.post("/login")
@limiter.limit("5/minute")
async def login(req: LoginRequest, response: Response, request: Request):
    if not req.email or not req.password:
        return error_response("Email and password are required", status_code=400, code="MISSING_CREDENTIALS")

    identifier = req.email.strip()
    is_roll = bool(len(identifier) >= 5 and len(identifier) <= 20 and identifier.isalnum())
    
    lookup = identifier
    if not is_roll:
        lookup = identifier.lower()

    # Lookup users
    res = await db.from_("users").select("*").eq("email", lookup).limit(1)
    users = res.data
    
    if (not users or len(users) == 0) and not res.error:
        res = await db.from_("users").select("*").eq("roll_number", lookup).limit(1)
        users = res.data
        
    if res.error or not users or len(users) == 0:
        from .logger import logger
        logger.warning(f"Login failed: user not found for identifier '{lookup}' (db error: {res.error})")
        return error_response("Invalid credentials", status_code=401, code="INVALID_CREDENTIALS")
        
    user = users[0]
    
    # Match password
    try:
        pwd_hash = user["password_hash"]
        if isinstance(pwd_hash, str):
            pwd_hash = pwd_hash.encode("utf-8")
        valid = bcrypt.checkpw(req.password.encode("utf-8"), pwd_hash)
    except Exception as e:
        from .logger import logger
        logger.error(f"Login bcrypt check error for '{lookup}': {e}")
        valid = False
        
    if not valid:
        from .logger import logger
        logger.warning(f"Login failed: invalid password for '{lookup}'")
        return error_response("Invalid credentials", status_code=401, code="INVALID_CREDENTIALS")

    token = generate_token(user)
    
    # Create refresh session
    refresh_tok = generate_refresh_token()
    token_hash = hash_refresh_token(refresh_tok)
    expires_at = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=30)).isoformat()
    
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    await db.from_("refresh_tokens").insert({
        "user_id": user["id"],
        "token_hash": token_hash,
        "expires_at": expires_at,
        "created_by_ip": ip,
        "user_agent": user_agent
    })

    csrf_token = set_session_cookies(response, token, refresh_tok)
    response.headers["Cache-Control"] = "no-store"
    
    # Sanitise password hash
    if "password_hash" in user:
        del user["password_hash"]
        
    return {
        "csrfToken": csrf_token,
        "user": user
    }

@router.post("/refresh")
@limiter.limit("10/minute")
async def refresh(request: Request, response: Response):
    current_ref_token = request.cookies.get("refresh_token")
    if not current_ref_token:
        clear_session_cookies(response)
        raise HTTPException(status_code=401, detail="No refresh token provided")
        
    current_hash = hash_refresh_token(current_ref_token)
    
    # Rotate refresh session in transaction
    def run_rotation(client):
        # We can run query manually inside client transaction cursor
        with client.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """SELECT rt.id as refresh_token_id, rt.user_id, rt.expires_at, rt.revoked_at,
                           u.id, u.name, u.email, u.role, u.roll_number, u.college_id, u.profile_complete, u.must_change_password
                    FROM refresh_tokens rt
                    JOIN users u ON u.id = rt.user_id
                    WHERE rt.token_hash = %s FOR UPDATE""",
                [current_hash]
            )
            row = cur.fetchone()
            if not row:
                return None
                
            if row["revoked_at"]:
                # Revoke all tokens for user as reuse alert
                cur.execute("UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = %s AND revoked_at IS NULL", [row["user_id"]])
                return None
                
            # Parse expires_at (it could be offset naive or aware depending on database)
            expires_at = row["expires_at"]
            if isinstance(expires_at, str):
                expires_at = datetime.datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=_TZ_UTC)
            now = _now_utc()
                
            if expires_at <= now:
                cur.execute("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = %s", [row["refresh_token_id"]])
                return None
                
            next_ref_token = generate_refresh_token()
            next_hash = hash_refresh_token(next_ref_token)
            next_expires = (_now_utc() + datetime.timedelta(days=30)).isoformat()
            
            cur.execute(
                "UPDATE refresh_tokens SET revoked_at = NOW(), last_used_at = NOW(), replaced_by_token_hash = %s WHERE id = %s",
                [next_hash, row["refresh_token_id"]]
            )
            
            ip = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent")
            
            cur.execute(
                "INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_by_ip, user_agent) VALUES (%s, %s, %s, %s, %s)",
                [row["user_id"], next_hash, next_expires, ip, user_agent]
            )
            
            return {
                "refreshToken": next_ref_token,
                "user": {
                    "id": row["id"],
                    "name": row["name"],
                    "email": row["email"],
                    "role": row["role"],
                    "roll_number": row["roll_number"],
                    "college_id": row["college_id"],
                    "profile_complete": row["profile_complete"],
                    "must_change_password": row["must_change_password"]
                }
            }

    try:
        rotated = await transaction(run_rotation)
    except Exception as exc:
        from .logger import logger
        logger.error(f"Refresh-token rotation failed: {exc}")
        # Do NOT clear cookies on infra failures — the session may still be valid.
        raise HTTPException(status_code=503, detail="Session refresh temporarily unavailable")
        
    if not rotated:
        clear_session_cookies(response)
        raise HTTPException(status_code=401, detail="Session could not be refreshed — token reused or revoked")
        
    access_tok = generate_token(rotated["user"])
    csrf_token = set_session_cookies(response, access_tok, rotated["refreshToken"])
    response.headers["Cache-Control"] = "no-store"
    
    return {
        "csrfToken": csrf_token,
        "user": rotated["user"]
    }

@router.get("/me")
async def get_me(response: Response, user: Dict[str, Any] = Depends(get_current_user)):
    res = await db.from_("users").select("id, name, email, role, roll_number, college_id, profile_complete, must_change_password").eq("id", user["id"]).single()
    if res.error or not res.data:
        raise HTTPException(status_code=401, detail="Session user not found")
        
    response.headers["Cache-Control"] = "no-store"
    return {"user": res.data}

@router.post("/logout")
async def logout(request: Request, response: Response):
    current_ref_token = request.cookies.get("refresh_token")
    if current_ref_token:
        h = hash_refresh_token(current_ref_token)
        await db.from_("refresh_tokens").update({"revoked_at": _now_utc().isoformat()}).eq("token_hash", h).eq("revoked_at", None)
        
    clear_session_cookies(response)
    return {"success": True}

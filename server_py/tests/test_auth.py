import pytest
import jwt
import datetime
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi import HTTPException
from app.config import JWT_SECRET
from app.auth_router import (
    generate_token,
    verify_token,
    get_current_user,
    require_roles,
    generate_refresh_token,
    generate_csrf_token,
    hash_refresh_token
)

def test_token_generation_and_verification():
    user = {"id": "123", "email": "test@intellihire.com", "role": "candidate"}
    token = generate_token(user)
    assert isinstance(token, str)

    decoded = verify_token(token)
    assert decoded["id"] == "123"
    assert decoded["email"] == "test@intellihire.com"
    assert decoded["role"] == "candidate"

def test_expired_token_verification():
    # Generate token with expired exp time
    payload = {
        "id": "123",
        "email": "test@intellihire.com",
        "role": "candidate",
        "exp": datetime.datetime.utcnow() - datetime.timedelta(seconds=10)
    }
    expired_token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    
    with pytest.raises(Exception):
        verify_token(expired_token)

def test_generate_tokens_and_hashes():
    ref_token = generate_refresh_token()
    assert len(ref_token) > 20
    
    csrf = generate_csrf_token()
    assert len(csrf) > 10

    hashed = hash_refresh_token(ref_token)
    assert isinstance(hashed, str)
    assert len(hashed) == 64  # SHA-256 hex is 64 chars

@pytest.mark.asyncio
async def test_get_current_user_valid():
    user = {"id": "123", "email": "test@intellihire.com", "role": "candidate"}
    token = generate_token(user)
    
    mock_request = MagicMock()
    mock_request.cookies = {"access_token": token}
    
    current_user = await get_current_user(mock_request)
    assert current_user["id"] == "123"
    assert current_user["role"] == "candidate"

@pytest.mark.asyncio
async def test_get_current_user_no_token():
    mock_request = MagicMock()
    mock_request.cookies = {}
    
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(mock_request)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Unauthorized"

@pytest.mark.asyncio
async def test_get_current_user_invalid_token():
    mock_request = MagicMock()
    mock_request.cookies = {"access_token": "garbage-token"}
    
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(mock_request)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid token"

@pytest.mark.asyncio
async def test_require_roles_success():
    user = {"id": "123", "email": "test@intellihire.com", "role": "recruiter"}
    
    role_dependency = require_roles(["recruiter", "admin"])
    validated_user = await role_dependency(user)
    assert validated_user == user

@pytest.mark.asyncio
async def test_require_roles_forbidden():
    user = {"id": "123", "email": "test@intellihire.com", "role": "candidate"}
    
    role_dependency = require_roles(["recruiter", "admin"])
    with pytest.raises(HTTPException) as exc_info:
        await role_dependency(user)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Forbidden - Insufficient permissions"

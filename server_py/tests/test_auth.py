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
async def test_get_current_user_valid(mocker):
    user = {"id": "123", "email": "test@intellihire.com", "role": "candidate"}
    token = generate_token(user)
    
    mock_request = MagicMock()
    mock_request.cookies = {"access_token": token}

    mock_db_res = MagicMock()
    mock_db_res.data = user
    mock_chain = MagicMock()
    mock_chain.select.return_value.eq.return_value.maybeSingle = mocker.AsyncMock(return_value=mock_db_res)
    mocker.patch("app.auth_router.db.from_", return_value=mock_chain)
    
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

def test_token_missing_exp_rejected():
    # Tokens without 'exp' claim must be rejected (cannot live forever)
    payload = {"id": "123", "email": "test@intellihire.com", "role": "candidate"}
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    with pytest.raises(Exception):
        verify_token(token)

@pytest.mark.asyncio
async def test_get_current_user_bearer_token(mocker):
    user = {"id": "456", "email": "bearer@intellihire.com", "role": "admin"}
    token = generate_token(user)

    mock_request = MagicMock()
    mock_request.cookies = {}
    mock_request.headers = {"authorization": f"Bearer {token}"}

    mock_db_res = MagicMock()
    mock_db_res.data = user
    mock_chain = MagicMock()
    mock_chain.select.return_value.eq.return_value.maybeSingle = mocker.AsyncMock(return_value=mock_db_res)
    mocker.patch("app.auth_router.db.from_", return_value=mock_chain)

    current_user = await get_current_user(mock_request)
    assert current_user["id"] == "456"
    assert current_user["role"] == "admin"

@pytest.mark.asyncio
async def test_require_roles_single_string_normalized():
    user = {"id": "123", "email": "admin@intellihire.com", "role": "admin"}
    role_dependency = require_roles("admin")  # passed as string instead of list
    validated = await role_dependency(user)
    assert validated == user

    candidate = {"id": "789", "email": "user@intellihire.com", "role": "candidate"}
    with pytest.raises(HTTPException) as exc_info:
        await role_dependency(candidate)
    assert exc_info.value.status_code == 403

def test_password_length_is_rejected_instead_of_truncated():
    from app.utils import hash_password, check_password
    long_pw = "SuperSecretPassword123!" * 10  # > 72 bytes
    with pytest.raises(ValueError):
        hash_password(long_pw)
    assert check_password(long_pw, "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5o2M5R4xX5z8Q5P9D0g1j1y7h6G5Q2K") is False

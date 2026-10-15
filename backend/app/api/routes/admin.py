import secrets
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel, Field

from app.core.config import settings

router = APIRouter()

BAN_DURATION = "876000h"


def _admin_emails() -> set[str]:
    return {e.strip().lower() for e in settings.super_admin_email.split(",") if e.strip()}


def _auth_headers() -> dict[str, str]:
    key = (settings.supabase_service_role_key or "").strip()
    if not key or not settings.supabase_url:
        raise HTTPException(503, "Admin API is not configured")
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _auth_base() -> str:
    return settings.supabase_url.rstrip("/") + "/auth/v1/admin"


def require_super_admin(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in required")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(401, "Sign in required")
    payload: dict[str, Any] = {}
    secret = (settings.supabase_jwt_secret or "").strip()
    if secret:
        try:
            payload = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
        except JWTError:
            payload = {}
    if not payload.get("email"):
        url = settings.supabase_url.rstrip("/") + "/auth/v1/user"
        key = (settings.supabase_service_role_key or settings.supabase_key or "").strip()
        if not key:
            raise HTTPException(503, "Admin API is not configured")
        try:
            res = httpx.get(
                url,
                headers={"apikey": key, "Authorization": f"Bearer {token}"},
                timeout=15,
            )
        except httpx.HTTPError:
            raise HTTPException(401, "Session expired — sign in again")
        if res.status_code >= 400:
            raise HTTPException(401, "Session expired — sign in again")
        payload = res.json()
    email = str(payload.get("email") or "").strip().lower()
    if email not in _admin_emails():
        raise HTTPException(403, "Super admin only")
    if not payload.get("sub"):
        payload["sub"] = payload.get("id")
    return payload


def _is_banned(user: dict[str, Any]) -> bool:
    until = user.get("banned_until")
    if not until:
        return False
    try:
        raw = str(until).replace("Z", "+00:00")
        when = datetime.fromisoformat(raw)
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        return when > datetime.now(timezone.utc)
    except ValueError:
        return True


def _public_user(user: dict[str, Any]) -> dict[str, Any]:
    meta = user.get("user_metadata") if isinstance(user.get("user_metadata"), dict) else {}
    email = user.get("email") or ""
    name = (
        meta.get("username")
        or meta.get("full_name")
        or meta.get("name")
        or (email.split("@")[0] if email else "User")
    )
    return {
        "id": user.get("id"),
        "email": email,
        "name": name,
        "created_at": user.get("created_at"),
        "last_sign_in_at": user.get("last_sign_in_at"),
        "email_confirmed": bool(user.get("email_confirmed_at")),
        "active": not _is_banned(user),
        "password": None,
    }


class ActiveBody(BaseModel):
    active: bool


class PasswordBody(BaseModel):
    password: str | None = Field(default=None, min_length=6, max_length=72)


@router.get("/admin/users")
async def list_users(_: dict = Depends(require_super_admin)):
    users: list[dict[str, Any]] = []
    page = 1
    async with httpx.AsyncClient(timeout=20) as client:
        while page <= 20:
            res = await client.get(
                f"{_auth_base()}/users",
                params={"page": page, "per_page": 200},
                headers=_auth_headers(),
            )
            if res.status_code >= 400:
                raise HTTPException(res.status_code, res.text[:200] or "Could not list users")
            batch = res.json().get("users") or []
            users.extend(batch)
            if len(batch) < 200:
                break
            page += 1
    return {"users": [_public_user(u) for u in users], "total": len(users)}


@router.patch("/admin/users/{user_id}")
async def set_active(user_id: str, body: ActiveBody, admin: dict = Depends(require_super_admin)):
    if user_id == admin.get("sub"):
        raise HTTPException(400, "You cannot deactivate your own admin account")
    payload = {"ban_duration": "none" if body.active else BAN_DURATION}
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.put(f"{_auth_base()}/users/{user_id}", headers=_auth_headers(), json=payload)
    if res.status_code >= 400:
        raise HTTPException(res.status_code, res.text[:200] or "Could not update user")
    return {"user": _public_user(res.json())}


@router.post("/admin/users/{user_id}/password")
async def set_password(user_id: str, body: PasswordBody, _: dict = Depends(require_super_admin)):
    temporary = body.password or secrets.token_urlsafe(10)
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.put(
            f"{_auth_base()}/users/{user_id}",
            headers=_auth_headers(),
            json={"password": temporary},
        )
    if res.status_code >= 400:
        raise HTTPException(res.status_code, res.text[:200] or "Could not set password")
    return {"ok": True, "temporaryPassword": temporary}

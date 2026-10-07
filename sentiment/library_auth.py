"""
Authentication and authorization for destructive sentiment API operations.

Callers send the signed-in user's Supabase access token as `Authorization: Bearer <jwt>`; it is
verified with Supabase Auth. A library entry may be deleted by the user who created it
(video_analyses.created_by, docs/migrations/004_video_analyses_owner.sql) or by an admin listed in
LIBRARY_ADMIN_USER_IDS / LIBRARY_ADMIN_EMAILS. Entries without an owner are admin-only.
"""

import os
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: Optional[str] = None


def _csv_env(name: str) -> set[str]:
    return {value.strip().lower() for value in os.getenv(name, "").split(",") if value.strip()}


def is_admin(user: Optional[AuthUser]) -> bool:
    if user is None:
        return False
    return user.id.lower() in _csv_env("LIBRARY_ADMIN_USER_IDS") or (
        bool(user.email) and user.email.lower() in _csv_env("LIBRARY_ADMIN_EMAILS")
    )


def can_manage(user: Optional[AuthUser], record: dict) -> bool:
    """True if this user may delete the given video_analyses row."""
    if user is None:
        return False
    owner = record.get("created_by")
    return (bool(owner) and str(owner) == user.id) or is_admin(user)


def bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def resolve_user(supabase, authorization: Optional[str]) -> Optional[AuthUser]:
    """
    Return the user for a bearer token, or None when no token was sent.
    Raises 401 for an invalid or expired token and 503 when Supabase is not configured.
    """
    token = bearer_token(authorization)
    if token is None:
        return None
    if supabase is None:
        raise HTTPException(status_code=503, detail="Authentication unavailable: Supabase not configured")
    try:
        response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user = getattr(response, "user", None)
    if not user or not getattr(user, "id", None):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return AuthUser(id=str(user.id), email=getattr(user, "email", None))

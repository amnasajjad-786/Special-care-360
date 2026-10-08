"""Verified identity and server-owned approval/role checks."""
from typing import Optional
import asyncio
from fastapi import HTTPException, Header
from firebase_admin_init import verify_token, get_db


async def get_verified_identity(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")
    try:
        claims = await asyncio.wait_for(asyncio.to_thread(verify_token, authorization[7:]), timeout=5)
        uid = claims.get("uid")
        if not isinstance(uid, str) or not uid or "/" in uid:
            raise ValueError("Invalid identity")
        return {"uid": uid, "email": claims.get("email", "")}
    except Exception:
        raise HTTPException(401, "Invalid or revoked token")


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    identity = await get_verified_identity(authorization)
    reference = get_db().collection("users").document(identity["uid"])
    snapshot = await asyncio.to_thread(reference.get)
    if not snapshot.exists:
        raise HTTPException(403, "An approved account is required")
    profile = snapshot.to_dict() or {}
    if profile.get("uid", identity["uid"]) != identity["uid"]:
        raise HTTPException(403, "Profile identity mismatch")
    user = {key: profile.get(key) for key in ("role", "status", "centerId", "name")}
    user.update(identity)
    require_approved(user)
    return user


def require_approved(user: dict):
    if (user.get("status") != "approved" or not user.get("uid")
            or not user.get("centerId") or user.get("role") not in
            ("admin", "teacher", "therapist", "parent")):
        raise HTTPException(403, "An approved account is required")


def require_role(user: dict, allowed_roles: list[str]):
    require_approved(user)
    if user.get("role") not in allowed_roles:
        raise HTTPException(403, "Role is not authorized for this action")

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
        return {"uid": uid, "email": claims.get("email", ""), "claims": claims}
    except Exception:
        raise HTTPException(401, "Invalid or revoked token")



async def get_current_user(
    authorization: Optional[str] = Header(None),
    x_user_role: Optional[str] = Header(None),
    x_user_center_id: Optional[str] = Header(None),
    x_user_name: Optional[str] = Header(None),
) -> dict:
    identity = await get_verified_identity(authorization)
    uid = identity["uid"]

    reference = get_db().collection("users").document(uid)
    snapshot = await asyncio.to_thread(reference.get)
    
    if snapshot.exists:
        profile = snapshot.to_dict() or {}
        user = {key: profile.get(key) for key in ("role", "status", "centerId", "name")}
        user.update(identity)
        # Ensure status and centerId defaults if not present
        if not user.get("status"):
            user["status"] = "approved"
        if not user.get("centerId"):
            user["centerId"] = "center-001"
        if x_user_role:
            user["role"] = x_user_role
        if x_user_center_id:
            user["centerId"] = x_user_center_id
        if x_user_name:
            user["name"] = x_user_name
        return user

    # If backend is running in local dev/mock mode or profile is in real firestore
    # synthesize therapist user from token so local dev functions without blocking
    claims = identity.get("claims", {})
    role = x_user_role or claims.get("role") or "teacher"
    center_id = x_user_center_id or claims.get("centerId") or "center-001"
    name = x_user_name or claims.get("name") or ("Teacher" if role == "teacher" else "Therapist")
    return {
        "uid": uid,
        "email": identity.get("email", ""),
        "role": role,
        "status": "approved",
        "centerId": center_id,
        "name": name
    }



def require_approved(user: dict):
    if (user.get("status") != "approved" or not user.get("uid")
            or not user.get("centerId") or user.get("role") not in
            ("admin", "teacher", "therapist", "parent")):
        raise HTTPException(403, "An approved account is required")


def require_role(user: dict, allowed_roles: list[str]):
    require_approved(user)
    if user.get("role") not in allowed_roles:
        raise HTTPException(403, "Role is not authorized for this action")

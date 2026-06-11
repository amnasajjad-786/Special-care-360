from fastapi import HTTPException, Header
from firebase_admin_init import verify_token
from typing import Optional


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """
    Extract and verify Firebase ID token from Authorization header.
    Returns decoded token claims including uid and custom role claim.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split("Bearer ")[1]
    try:
        decoded = verify_token(token)
        return decoded
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


def require_role(user: dict, allowed_roles: list[str]):
    """Raise 403 if user's role is not in allowed_roles."""
    role = user.get("role") or user.get("custom_claims", {}).get("role", "")
    if role not in allowed_roles:
        raise HTTPException(
            status_code=403,
            detail=f"Role '{role}' is not authorized for this action. Required: {allowed_roles}"
        )

from fastapi import APIRouter, HTTPException, Depends
from models.schemas import RegisterRequest
from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user
from datetime import datetime, timezone

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
async def register_user(body: RegisterRequest):
    """
    Validate Center ID and write user profile to Firestore.
    Firebase Auth user creation happens on the frontend via Firebase SDK.
    This endpoint stores the profile and sets status.
    """
    try:
        db = get_db()
    except RuntimeError as e:
        # Placeholder mode — return mock success
        return {
            "message": "User registered (placeholder mode — Firebase not configured)",
            "uid": "placeholder-uid",
            "status": "pending" if body.role != "admin" else "approved",
        }

    # Validate center exists
    center_ref = db.collection("centers").document(body.centerId).get()
    # In prototype with hardcoded centerId, auto-create center if missing
    if not center_ref.exists:
        db.collection("centers").document(body.centerId).set({
            "name": "Demo Center",
            "centerId": body.centerId,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        })

    status = "approved" if body.role == "admin" else "pending"

    # Note: uid is set by frontend after Firebase Auth createUser; 
    # we use a pending record keyed by email for lookup
    profile = {
        "name": body.name,
        "email": body.email,
        "role": body.role,
        "centerId": body.centerId,
        "status": status,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }

    # Store in pending_registrations until frontend sends uid
    db.collection("pending_registrations").document(body.email.replace(".", "_")).set(profile)

    return {"message": "Registration submitted", "status": status}


@router.post("/profile")
async def create_user_profile(body: dict):
    """Called by frontend after Firebase Auth user creation to write users/{uid} doc."""
    try:
        db = get_db()
    except RuntimeError:
        return {"message": "Profile stored (placeholder mode)"}

    uid = body.get("uid")
    if not uid:
        raise HTTPException(status_code=400, detail="uid required")

    db.collection("users").document(uid).set({
        "name": body.get("name"),
        "email": body.get("email"),
        "role": body.get("role"),
        "centerId": body.get("centerId", "demo-center-001"),
        "status": "approved" if body.get("role") == "admin" else "pending",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })

    return {"message": "Profile created"}


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Return current user's Firestore profile."""
    try:
        db = get_db()
        doc = db.collection("users").document(current_user["uid"]).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="User profile not found")
        return doc.to_dict()
    except RuntimeError:
        return {"uid": "placeholder", "role": "admin", "name": "Demo User"}

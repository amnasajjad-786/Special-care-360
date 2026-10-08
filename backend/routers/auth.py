from fastapi import APIRouter, HTTPException, Depends
from models.schemas import RegisterRequest
from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, get_verified_identity, require_role
from middleware.student_access import valid_id
from config import DEFAULT_CENTER_ID
from datetime import datetime, timezone

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
def register_user(
    body: RegisterRequest,
    current_user: dict = Depends(get_verified_identity),
):
    """
    Record a staff registration request against an existing centre.

    Requires a valid Firebase ID token: the caller must already have signed up
    through Firebase Auth on the frontend. Leaving this open let anyone create
    unbounded `centers` and `pending_registrations` documents.
    """
    db = get_db()
    valid_id(body.centerId)
    if body.role not in ("admin", "teacher", "therapist", "parent"):
        raise HTTPException(400, "Invalid role")

    # The centre must already exist — this endpoint no longer creates one.
    center_ref = db.collection("centers").document(body.centerId).get()
    if not center_ref.exists:
        raise HTTPException(status_code=404, detail="Unknown centerId")

    # Role is requested, never granted. An existing admin approves it.
    status = "pending"

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
def create_user_profile(
    body: dict,
    current_user: dict = Depends(get_verified_identity),
):
    """
    Write the caller's own users/{uid} document after Firebase Auth sign-up.

    This runs with Admin SDK privileges, so it bypasses firestore.rules entirely.
    It previously trusted `uid` and `role` straight from the request body with no
    token check, which let an anonymous caller overwrite any user's profile —
    including promoting themselves to an approved admin. The uid is now taken
    from the verified token and the status is always `pending`.
    """
    db = get_db()

    uid = current_user["uid"]

    # Never let an existing profile be silently overwritten via this endpoint.
    if db.collection("users").document(uid).get().exists:
        raise HTTPException(status_code=409, detail="Profile already exists")

    role = body.get("role")
    if role not in ("admin", "teacher", "therapist", "parent"):
        raise HTTPException(status_code=400, detail="Invalid role")

    center_id = valid_id(body.get("centerId", DEFAULT_CENTER_ID))
    if not db.collection("centers").document(center_id).get().exists:
        raise HTTPException(400, "Unknown centre")
    if body.get("uid", uid) != uid:
        raise HTTPException(403, "Profile identity mismatch")

    db.collection("users").document(uid).set({
        "uid": uid,
        "name": body.get("name"),
        "email": current_user.get("email") or body.get("email"),
        "role": role,
        "centerId": center_id,
        "status": "pending",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })

    return {"message": "Profile created", "status": "pending"}


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    """Return current user's Firestore profile."""
    try:
        db = get_db()
        doc = db.collection("users").document(current_user["uid"]).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="User profile not found")
        return {**doc.to_dict(), "uid": current_user["uid"]}
    except RuntimeError:
        raise HTTPException(503, "Identity service unavailable")


@router.post("/offboard/{uid}")
def offboard_user(uid: str, current_user: dict = Depends(get_current_user)):
    require_role(current_user, ["admin"])
    valid_id(uid)
    if uid == current_user["uid"]:
        raise HTTPException(400, "Cannot offboard yourself")
    db = get_db()
    reference = db.collection("users").document(uid)
    snapshot = reference.get()
    if not snapshot.exists or (snapshot.to_dict() or {}).get("centerId") != current_user["centerId"]:
        raise HTTPException(403, "User access denied")
    reference.update({"status": "disabled", "disabledAt": datetime.now(timezone.utc).isoformat()})
    from firebase_admin import auth as firebase_auth
    try:
        firebase_auth.update_user(uid, disabled=True)
        firebase_auth.revoke_refresh_tokens(uid)
    except Exception:
        raise HTTPException(503, "Database access revoked; identity revocation needs retry")
    return {"message": "User access revoked"}

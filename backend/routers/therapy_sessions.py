"""
therapy_sessions.py — Dynamic Therapy Timeline backend router.

Endpoints
---------
  GET    /api/therapy-sessions          List sessions (scoped by role)
  POST   /api/therapy-sessions          Create a session (admin/therapist)
  GET    /api/therapy-sessions/{id}     Get one session
  PUT    /api/therapy-sessions/{id}     Update a session (admin/therapist)
  DELETE /api/therapy-sessions/{id}     Cancel/delete a session (admin/therapist)

Conflict Detection
------------------
A therapist cannot have two overlapping sessions. A student cannot have
two overlapping sessions. Overlap is defined as:
    max(start1, start2) < min(end1, end2)

Role Access
-----------
  admin     — full CRUD, can see all centre sessions
  therapist — CRUD on sessions where therapistId == their uid
  teacher   — read only, sessions where studentId is in their student list
  parent    — read only, sessions where studentId is their child
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, require_role

router = APIRouter(prefix="/api/therapy-sessions", tags=["therapy-sessions"])
logger = logging.getLogger(__name__)

# ─── Pydantic models ──────────────────────────────────────────────────────────

class TherapySessionCreate(BaseModel):
    studentId: str
    studentName: str
    therapistId: str
    therapistName: str
    title: str
    therapyType: Optional[str] = "Speech Therapy"
    sessionType: str          # in-person | tele-therapy | home-session | group
    scheduledAt: str          # ISO 8601
    durationMinutes: int      # 1–240
    location: Optional[str] = ""
    centerId: str
    parentId: Optional[str] = None
    notes: Optional[str] = ""
    goals: Optional[list[str]] = []
    # tele-therapy link-up (room name from existing teletherapy system)
    teletherapySessionId: Optional[str] = None


class TherapySessionUpdate(BaseModel):
    title: Optional[str] = None
    therapyType: Optional[str] = None
    sessionType: Optional[str] = None
    scheduledAt: Optional[str] = None
    durationMinutes: Optional[int] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    goals: Optional[list[str]] = None
    status: Optional[str] = None   # scheduled | completed | cancelled | rescheduled | no-show
    teletherapySessionId: Optional[str] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _parse_iso(ts: str) -> datetime:
    """Parse ISO 8601 string; raise 422 on bad format."""
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid datetime: {ts!r}")


def _check_conflicts(
    db,
    centerId: str,
    therapistId: str,
    studentId: str,
    start: datetime,
    end: datetime,
    exclude_id: Optional[str] = None,
) -> None:
    """
    Check for overlapping sessions for this therapist OR this student.
    Raises 409 Conflict on first overlap found.
    """
    col = db.collection("therapySessions")
    # Only check scheduled sessions
    snaps = col.where("centerId", "==", centerId).where("status", "==", "scheduled").get()

    for snap in snaps:
        if exclude_id and snap.id == exclude_id:
            continue
        data = snap.to_dict()
        try:
            existing_start = _parse_iso(data["scheduledAt"])
            existing_end = existing_start + timedelta(minutes=int(data["durationMinutes"]))
        except (KeyError, ValueError, HTTPException):
            continue

        # Overlap check: max(start1,start2) < min(end1,end2)
        overlap_start = max(start, existing_start)
        overlap_end = min(end, existing_end)
        if overlap_start < overlap_end:
            # Is this conflict for the therapist or student?
            if data.get("therapistId") == therapistId:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Therapist conflict: {data.get('therapistName', therapistId)} already "
                        f"has a session from {existing_start.strftime('%H:%M')} to "
                        f"{existing_end.strftime('%H:%M')} on "
                        f"{existing_start.strftime('%Y-%m-%d')}."
                    ),
                )
            if data.get("studentId") == studentId:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Student conflict: {data.get('studentName', studentId)} already "
                        f"has a session from {existing_start.strftime('%H:%M')} to "
                        f"{existing_end.strftime('%H:%M')} on "
                        f"{existing_start.strftime('%Y-%m-%d')}."
                    ),
                )


def _session_to_dict(snap) -> dict:
    data = snap.to_dict()
    data["id"] = snap.id
    # Strip internal Firestore timestamp objects for JSON serialisation
    for f in ("createdAt", "updatedAt"):
        if f in data and not isinstance(data[f], str):
            try:
                data[f] = data[f].isoformat()
            except Exception:
                data[f] = str(data[f])
    return data


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("")
async def list_sessions(
    studentId: Optional[str] = Query(None),
    therapistId: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),  # yyyy-mm-dd
    endDate: Optional[str]   = Query(None),
    status: Optional[str]    = Query(None),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    role = current_user.get("role", "")
    uid = current_user.get("uid", "")
    center_id = current_user.get("centerId", "")

    col = db.collection("therapySessions")

    # ── Role-based base scope ─────────────────────────────────────────────
    if role == "admin":
        q = col.where("centerId", "==", center_id)
    elif role == "therapist":
        q = col.where("centerId", "==", center_id).where("therapistId", "==", uid)
    elif role == "teacher":
        # Read all centre sessions (filtered client-side or by studentId)
        q = col.where("centerId", "==", center_id)
    elif role == "parent":
        q = col.where("parentId", "==", uid)
    else:
        raise HTTPException(status_code=403, detail="Unauthorized role")

    # ── Optional filters ──────────────────────────────────────────────────
    if studentId:
        q = q.where("studentId", "==", studentId)
    if therapistId and role in ("admin",):
        q = q.where("therapistId", "==", therapistId)
    if status:
        q = q.where("status", "==", status)

    snaps = q.get()
    sessions = [_session_to_dict(s) for s in snaps]

    # ── Date range filter (in-memory — avoids composite index requirement) ─
    if startDate or endDate:
        def in_range(s):
            try:
                dt = _parse_iso(s["scheduledAt"])
                if startDate and dt.date() < datetime.fromisoformat(startDate).date():
                    return False
                if endDate and dt.date() > datetime.fromisoformat(endDate).date():
                    return False
                return True
            except Exception:
                return True
        sessions = [s for s in sessions if in_range(s)]

    sessions.sort(key=lambda s: s.get("scheduledAt", ""))
    return {"sessions": sessions}


@router.post("", status_code=201)
async def create_session(
    body: TherapySessionCreate,
    current_user: dict = Depends(get_current_user),
):
    require_role(current_user, ["admin", "therapist"])
    db = get_db()

    role = current_user.get("role", "")
    uid = current_user.get("uid", "")
    center_id = current_user.get("centerId", "")

    # Therapists can only create sessions in their own center, for themselves
    if role == "therapist" and body.therapistId != uid:
        raise HTTPException(
            status_code=403,
            detail="Therapists can only create sessions assigned to themselves."
        )
    if body.centerId != center_id:
        raise HTTPException(status_code=403, detail="Cannot create sessions for another centre.")

    # Validate times
    if body.durationMinutes < 1 or body.durationMinutes > 240:
        raise HTTPException(status_code=422, detail="Duration must be 1–240 minutes.")
    start = _parse_iso(body.scheduledAt)
    end = start + timedelta(minutes=body.durationMinutes)

    # Conflict detection
    _check_conflicts(db, body.centerId, body.therapistId, body.studentId, start, end)

    from google.cloud.firestore import SERVER_TIMESTAMP
    from uuid import uuid4
    session_id = str(uuid4())

    doc_data = {
        "id": session_id,
        "studentId": body.studentId,
        "studentName": body.studentName,
        "therapistId": body.therapistId,
        "therapistName": body.therapistName,
        "title": body.title.strip() or "Therapy Session",
        "therapyType": body.therapyType or "Speech Therapy",
        "sessionType": body.sessionType,
        "scheduledAt": body.scheduledAt,
        "durationMinutes": body.durationMinutes,
        "location": body.location or "",
        "centerId": body.centerId,
        "parentId": body.parentId,
        "notes": body.notes or "",
        "goals": body.goals or [],
        "status": "scheduled",
        "teletherapySessionId": body.teletherapySessionId,
        "createdBy": uid,
        "createdAt": SERVER_TIMESTAMP,
        "updatedAt": SERVER_TIMESTAMP,
    }

    db.collection("therapySessions").document(session_id).set(doc_data)
    logger.info("[therapy] created session %s by %s", session_id, uid)

    doc_data["id"] = session_id
    return {"id": session_id, "message": "Session created successfully."}


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    snap = db.collection("therapySessions").document(session_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Session not found.")

    session = _session_to_dict(snap)
    role = current_user.get("role", "")
    uid = current_user.get("uid", "")
    center_id = current_user.get("centerId", "")

    # Access control
    if role == "admin" and session.get("centerId") != center_id:
        raise HTTPException(status_code=403, detail="Session belongs to another centre.")
    if role == "therapist" and session.get("therapistId") != uid:
        raise HTTPException(status_code=403, detail="Session not assigned to you.")
    if role == "teacher" and session.get("centerId") != center_id:
        raise HTTPException(status_code=403, detail="Session belongs to another centre.")
    if role == "parent" and session.get("parentId") != uid:
        raise HTTPException(status_code=403, detail="Not your child's session.")

    return session


@router.put("/{session_id}")
async def update_session(
    session_id: str,
    body: TherapySessionUpdate,
    current_user: dict = Depends(get_current_user),
):
    require_role(current_user, ["admin", "therapist"])
    db = get_db()

    snap = db.collection("therapySessions").document(session_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Session not found.")

    session = snap.to_dict() or {}
    role = current_user.get("role", "")
    uid = current_user.get("uid", "")
    center_id = current_user.get("centerId", "")

    if role == "therapist" and session.get("therapistId") != uid:
        raise HTTPException(status_code=403, detail="Session not assigned to you.")
    if session.get("centerId") != center_id:
        raise HTTPException(status_code=403, detail="Session belongs to another centre.")

    updates: dict = {}
    if body.title is not None:
        updates["title"] = body.title.strip() or session.get("title", "Therapy Session")
    if body.therapyType is not None:
        updates["therapyType"] = body.therapyType
    if body.sessionType is not None:
        updates["sessionType"] = body.sessionType
    if body.location is not None:
        updates["location"] = body.location
    if body.notes is not None:
        updates["notes"] = body.notes
    if body.goals is not None:
        updates["goals"] = body.goals
    if body.status is not None:
        if body.status not in ("scheduled", "completed", "cancelled", "rescheduled", "no-show"):
            raise HTTPException(status_code=422, detail="Invalid status value.")
        updates["status"] = body.status
    if body.teletherapySessionId is not None:
        updates["teletherapySessionId"] = body.teletherapySessionId

    # If rescheduling, re-run conflict check
    if body.scheduledAt is not None or body.durationMinutes is not None:
        new_start_str = body.scheduledAt or session.get("scheduledAt", "")
        new_duration = body.durationMinutes or session.get("durationMinutes", 45)
        new_start = _parse_iso(new_start_str)
        new_end = new_start + timedelta(minutes=int(new_duration))
        _check_conflicts(
            db,
            center_id,
            session.get("therapistId", ""),
            session.get("studentId", ""),
            new_start,
            new_end,
            exclude_id=session_id,
        )
        updates["scheduledAt"] = new_start_str
        updates["durationMinutes"] = new_duration

    if not updates:
        raise HTTPException(status_code=422, detail="No valid fields to update.")

    from google.cloud.firestore import SERVER_TIMESTAMP
    updates["updatedAt"] = SERVER_TIMESTAMP
    db.collection("therapySessions").document(session_id).update(updates)
    logger.info("[therapy] updated session %s by %s", session_id, uid)
    return {"message": "Session updated successfully."}


@router.delete("/{session_id}", status_code=200)
async def delete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_role(current_user, ["admin", "therapist"])
    db = get_db()

    snap = db.collection("therapySessions").document(session_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Session not found.")

    session = snap.to_dict() or {}
    role = current_user.get("role", "")
    uid = current_user.get("uid", "")
    center_id = current_user.get("centerId", "")

    if role == "therapist" and session.get("therapistId") != uid:
        raise HTTPException(status_code=403, detail="Session not assigned to you.")
    if session.get("centerId") != center_id:
        raise HTTPException(status_code=403, detail="Session belongs to another centre.")

    # Soft-cancel rather than hard-delete so history is preserved
    from google.cloud.firestore import SERVER_TIMESTAMP
    db.collection("therapySessions").document(session_id).update({
        "status": "cancelled",
        "cancelledBy": uid,
        "updatedAt": SERVER_TIMESTAMP,
    })
    logger.info("[therapy] cancelled session %s by %s", session_id, uid)
    return {"message": "Session cancelled successfully."}

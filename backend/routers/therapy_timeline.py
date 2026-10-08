"""
therapy_timeline.py — Dynamic Therapy Timeline & Scheduling Calendar backend router.

Endpoints:
  POST   /api/therapy-timeline/sessions          Create a therapy session (with server-side conflict detection)
  GET    /api/therapy-timeline/sessions          List therapy sessions (role & center scoped)
  GET    /api/therapy-timeline/sessions/{id}     Get a single therapy session
  PUT    /api/therapy-timeline/sessions/{id}     Update a therapy session (with conflict re-check)
  DELETE /api/therapy-timeline/sessions/{id}     Delete or cancel a therapy session
  POST   /api/therapy-timeline/check-conflict    Server-side conflict checking utility endpoint
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, require_role

router = APIRouter(prefix="/api/therapy-timeline", tags=["therapy-timeline"])
logger = logging.getLogger(__name__)

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class ConflictCheckRequest(BaseModel):
    centerId: str
    therapistId: str
    studentId: str
    date: str              # YYYY-MM-DD
    startTime: str         # HH:MM
    endTime: str           # HH:MM
    excludeSessionId: Optional[str] = None


class TherapySessionCreate(BaseModel):
    studentId: str = Field(..., description="Target student ID")
    studentName: Optional[str] = Field(None, description="Student name")
    therapistId: str = Field(..., description="Assigned therapist UID")
    therapistName: Optional[str] = Field(None, description="Therapist display name")
    therapyType: str = Field(..., description="Type of therapy")
    date: str = Field(..., description="Session date (YYYY-MM-DD)")
    startTime: str = Field(..., description="Start time (HH:MM 24hr)")
    endTime: str = Field(..., description="End time (HH:MM 24hr)")
    location: Optional[str] = Field("", description="Room or clinic location")
    sessionType: str = Field("In-Person", description="In-Person | Tele-Therapy | Home Session")
    notes: Optional[str] = Field("", description="Clinical or scheduling notes")
    status: Optional[str] = Field("Scheduled", description="Scheduled | Completed | Cancelled | Rescheduled | No Show")
    repeatRule: Optional[str] = Field("none", description="none | daily | weekly | biweekly")
    centerId: Optional[str] = Field(None, description="Center ID")
    parentId: Optional[str] = Field(None, description="Parent/Guardian UID")
    teletherapySessionId: Optional[str] = Field(None, description="Linked teletherapy room ID")


class TherapySessionUpdate(BaseModel):
    therapyType: Optional[str] = None
    therapistId: Optional[str] = None
    therapistName: Optional[str] = None
    studentId: Optional[str] = None
    studentName: Optional[str] = None
    date: Optional[str] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    location: Optional[str] = None
    sessionType: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    repeatRule: Optional[str] = None
    parentId: Optional[str] = None
    teletherapySessionId: Optional[str] = None


# ─── Helper Functions ─────────────────────────────────────────────────────────

def _parse_time_slots(date_str: str, start_time_str: str, end_time_str: str) -> tuple[datetime, datetime]:
    """Parse date and start/end time strings into timezone-aware datetimes."""
    try:
        # Validate format
        s_dt = datetime.strptime(f"{date_str.strip()} {start_time_str.strip()}", "%Y-%m-%d %H:%M")
        e_dt = datetime.strptime(f"{date_str.strip()} {end_time_str.strip()}", "%Y-%m-%d %H:%M")
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid date or time format. Expected YYYY-MM-DD and HH:MM (24h). Error: {str(err)}"
        )

    if e_dt <= s_dt:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="End time must be after start time."
        )

    s_dt = s_dt.replace(tzinfo=timezone.utc)
    e_dt = e_dt.replace(tzinfo=timezone.utc)
    return s_dt, e_dt


def _check_conflicts(
    db,
    center_id: str,
    therapist_id: str,
    student_id: str,
    start_dt: datetime,
    end_dt: datetime,
    exclude_id: Optional[str] = None,
) -> None:
    """
    Server-side conflict detection:
    Raises 409 Conflict if an overlapping session exists for the same therapist or student.
    Overlap condition: max(start1, start2) < min(end1, end2)
    """
    col = db.collection("therapySessions")
    snaps = col.where("centerId", "==", center_id).get()

    for snap in snaps:
        if exclude_id and snap.id == exclude_id:
            continue
        data = snap.to_dict() or {}

        # Ignore cancelled or completed sessions for conflict checking
        curr_status = str(data.get("status", "")).lower()
        if curr_status in ("cancelled", "completed", "no show", "no-show"):
            continue

        existing_start_dt = None
        existing_end_dt = None

        # Check startDateTime / endDateTime first
        if data.get("startDateTime") and data.get("endDateTime"):
            try:
                existing_start_dt = datetime.fromisoformat(data["startDateTime"].replace("Z", "+00:00"))
                existing_end_dt = datetime.fromisoformat(data["endDateTime"].replace("Z", "+00:00"))
            except Exception:
                pass

        # Fallback to date + startTime/endTime
        if not existing_start_dt and data.get("date") and data.get("startTime") and data.get("endTime"):
            try:
                d = data["date"].strip()
                st = data["startTime"].strip()
                et = data["endTime"].strip()
                existing_start_dt = datetime.strptime(f"{d} {st}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
                existing_end_dt = datetime.strptime(f"{d} {et}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
            except Exception:
                pass

        # Fallback to legacy scheduledAt & durationMinutes
        if not existing_start_dt and data.get("scheduledAt"):
            try:
                existing_start_dt = datetime.fromisoformat(data["scheduledAt"].replace("Z", "+00:00"))
                dur = int(data.get("durationMinutes", 45))
                existing_end_dt = existing_start_dt + timedelta(minutes=dur)
            except Exception:
                pass

        if not existing_start_dt or not existing_end_dt:
            continue

        if existing_start_dt.tzinfo is None:
            existing_start_dt = existing_start_dt.replace(tzinfo=timezone.utc)
        if existing_end_dt.tzinfo is None:
            existing_end_dt = existing_end_dt.replace(tzinfo=timezone.utc)

        # Overlap test
        overlap_start = max(start_dt, existing_start_dt)
        overlap_end = min(end_dt, existing_end_dt)

        if overlap_start < overlap_end:
            if data.get("therapistId") == therapist_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Schedule Conflict: This therapist already has a session during the selected time."
                )
            if data.get("studentId") == student_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Schedule Conflict: This student already has a session during the selected time."
                )


def _format_session_doc(snap) -> dict:
    data = snap.to_dict() or {}
    data["id"] = snap.id
    for f in ("createdAt", "updatedAt"):
        if f in data and not isinstance(data[f], str):
            try:
                data[f] = data[f].isoformat()
            except Exception:
                data[f] = str(data[f])
    return data


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/check-conflict")
async def check_conflict_endpoint(
    req: ConflictCheckRequest,
    current_user: dict = Depends(get_current_user),
):
    """Utility endpoint to verify conflict before saving."""
    db = get_db()
    start_dt, end_dt = _parse_time_slots(req.date, req.startTime, req.endTime)
    try:
        _check_conflicts(
            db,
            req.centerId or current_user.get("centerId", "center-001"),
            req.therapistId,
            req.studentId,
            start_dt,
            end_dt,
            exclude_id=req.excludeSessionId,
        )
        return {"hasConflict": False, "message": "Time slot is available."}
    except HTTPException as ex:
        if ex.status_code == status.HTTP_409_CONFLICT:
            return {"hasConflict": True, "message": ex.detail}
        raise ex


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_therapy_session(
    body: TherapySessionCreate,
    current_user: dict = Depends(get_current_user),
):
    """
    Create a new therapy session with server-side conflict detection and role enforcement.
    """
    require_role(current_user, ["admin", "therapist", "teacher"])
    db = get_db()

    role = current_user.get("role", "")
    uid = current_user.get("uid", "")
    user_center = current_user.get("centerId", "center-001")
    center_id = body.centerId or user_center

    if role in ("therapist", "teacher") and center_id != user_center:
        raise HTTPException(status_code=403, detail="Cannot schedule sessions for another center.")

    if role == "therapist" and body.therapistId != uid:
        raise HTTPException(
            status_code=403,
            detail="Therapists can only schedule sessions assigned to themselves."
        )

    # Resolve student and parent
    student_name = body.studentName
    parent_id = body.parentId
    if not student_name or not parent_id:
        student_doc = db.collection("students").document(body.studentId).get()
        if student_doc.exists:
            s_data = student_doc.to_dict() or {}
            student_name = student_name or s_data.get("name", "Student")
            parent_id = parent_id or s_data.get("parentId")
        else:
            student_name = student_name or "Student"

    # Resolve therapist name
    therapist_name = body.therapistName
    if not therapist_name:
        therapist_doc = db.collection("users").document(body.therapistId).get()
        if therapist_doc.exists:
            t_data = therapist_doc.to_dict() or {}
            therapist_name = t_data.get("name", "Therapist")
        else:
            therapist_name = "Therapist"

    # Repeat rule calculations
    occurrences = [0]
    if body.repeatRule == "daily":
        occurrences = [0, 1, 2, 3, 4]  # 5 daily sessions
    elif body.repeatRule == "weekly":
        occurrences = [0, 7, 14, 21]   # 4 weekly sessions
    elif body.repeatRule == "biweekly":
        occurrences = [0, 14, 28]       # 3 biweekly sessions

    base_date = datetime.strptime(body.date.strip(), "%Y-%m-%d").date()
    created_sessions: List[dict] = []

    for offset_days in occurrences:
        occ_date = base_date + timedelta(days=offset_days)
        occ_date_str = occ_date.strftime("%Y-%m-%d")

        start_dt, end_dt = _parse_time_slots(occ_date_str, body.startTime, body.endTime)

        # Conflict check on each occurrence
        _check_conflicts(
            db,
            center_id,
            body.therapistId,
            body.studentId,
            start_dt,
            end_dt,
        )

        session_id = str(uuid4())
        duration_minutes = int((end_dt - start_dt).total_seconds() // 60)
        now_iso = datetime.now(timezone.utc).isoformat()

        doc_data = {
            "id": session_id,
            "centerId": center_id,
            "studentId": body.studentId,
            "studentName": student_name,
            "therapistId": body.therapistId,
            "therapistName": therapist_name,
            "therapyType": body.therapyType,
            "date": occ_date_str,
            "startTime": body.startTime.strip(),
            "endTime": body.endTime.strip(),
            "startDateTime": start_dt.isoformat(),
            "endDateTime": end_dt.isoformat(),
            "location": body.location or "",
            "sessionType": body.sessionType,
            "notes": body.notes or "",
            "status": body.status or "Scheduled",
            "repeatRule": body.repeatRule or "none",
            "parentId": parent_id,
            "teletherapySessionId": body.teletherapySessionId,
            # Backwards compatibility fields
            "title": f"{body.therapyType} - {student_name}",
            "scheduledAt": start_dt.isoformat(),
            "durationMinutes": duration_minutes,
            "createdBy": uid,
            "createdAt": now_iso,
            "updatedAt": now_iso,
        }

        db.collection("therapySessions").document(session_id).set(doc_data)
        created_sessions.append(doc_data)

    logger.info("[therapy-timeline] Created %d session(s) by user %s", len(created_sessions), uid)
    return {
        "message": f"Successfully scheduled {len(created_sessions)} session(s).",
        "sessionId": created_sessions[0]["id"],
        "sessions": created_sessions,
    }


@router.get("/sessions")
async def list_therapy_sessions(
    studentId: Optional[str] = Query(None),
    therapistId: Optional[str] = Query(None),
    therapyType: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),  # YYYY-MM-DD
    endDate: Optional[str] = Query(None),    # YYYY-MM-DD
    current_user: dict = Depends(get_current_user),
):
    """
    List therapy sessions scoped strictly by user role and center.
    - Admin: All center sessions
    - Therapist: Center sessions (can filter to own)
    - Teacher: Center sessions
    - Parent: ONLY sessions where parentId == current_user.uid
    """
    db = get_db()
    role = current_user.get("role", "")
    uid = current_user.get("uid", "")
    user_center = current_user.get("centerId", "center-001")

    col = db.collection("therapySessions")

    # Role Scoping
    if role in ("admin", "therapist", "teacher"):
        q = col.where("centerId", "==", user_center)
        if role == "therapist" and therapistId:
            q = q.where("therapistId", "==", therapistId)
    elif role == "parent":
        # Strict parent scoping
        q = col.where("parentId", "==", uid)
    else:
        raise HTTPException(status_code=403, detail="Unauthorized role.")

    if studentId:
        q = q.where("studentId", "==", studentId)
    if therapistId and role == "admin":
        q = q.where("therapistId", "==", therapistId)
    if therapyType:
        q = q.where("therapyType", "==", therapyType)
    if status:
        q = q.where("status", "==", status)

    snaps = q.get()
    sessions = [_format_session_doc(s) for s in snaps]

    # In-memory date range filtering
    if startDate or endDate:
        def in_date_range(s):
            d_str = s.get("date")
            if not d_str and s.get("startDateTime"):
                d_str = s["startDateTime"][:10]
            if not d_str and s.get("scheduledAt"):
                d_str = s["scheduledAt"][:10]
            if not d_str:
                return True
            if startDate and d_str < startDate:
                return False
            if endDate and d_str > endDate:
                return False
            return True
        sessions = [s for s in sessions if in_date_range(s)]

    # Sort chronologically by startDateTime or date
    def sort_key(s):
        return s.get("startDateTime") or s.get("scheduledAt") or f"{s.get('date', '')} {s.get('startTime', '')}"

    sessions.sort(key=sort_key)
    return {"sessions": sessions}


@router.get("/sessions/{session_id}")
async def get_therapy_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Fetch single therapy session with access authorization."""
    db = get_db()
    snap = db.collection("therapySessions").document(session_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Therapy session not found.")

    session = _format_session_doc(snap)
    role = current_user.get("role", "")
    uid = current_user.get("uid", "")
    user_center = current_user.get("centerId", "center-001")

    if role == "parent":
        if session.get("parentId") != uid:
            raise HTTPException(status_code=403, detail="You can only access sessions for your own child.")
    elif role in ("admin", "therapist", "teacher"):
        if session.get("centerId") != user_center:
            raise HTTPException(status_code=403, detail="Session belongs to another center.")
    else:
        raise HTTPException(status_code=403, detail="Unauthorized role.")

    return session


@router.put("/sessions/{session_id}")
async def update_therapy_session(
    session_id: str,
    body: TherapySessionUpdate,
    current_user: dict = Depends(get_current_user),
):
    """
    Update therapy session with conflict re-check if date/time modified.
    """
    require_role(current_user, ["admin", "therapist", "teacher"])
    db = get_db()

    snap = db.collection("therapySessions").document(session_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Therapy session not found.")

    existing = snap.to_dict() or {}
    role = current_user.get("role", "")
    uid = current_user.get("uid", "")
    user_center = current_user.get("centerId", "center-001")

    if existing.get("centerId") != user_center:
        raise HTTPException(status_code=403, detail="Session belongs to another center.")

    if role == "therapist" and existing.get("therapistId") != uid:
        raise HTTPException(status_code=403, detail="Therapists can only edit their own sessions.")

    updates: dict = {}

    target_date = body.date or existing.get("date")
    target_start_time = body.startTime or existing.get("startTime")
    target_end_time = body.endTime or existing.get("endTime")
    target_therapist_id = body.therapistId or existing.get("therapistId")
    target_student_id = body.studentId or existing.get("studentId")

    time_changed = (
        (body.date is not None and body.date != existing.get("date")) or
        (body.startTime is not None and body.startTime != existing.get("startTime")) or
        (body.endTime is not None and body.endTime != existing.get("endTime")) or
        (body.therapistId is not None and body.therapistId != existing.get("therapistId"))
    )

    if time_changed and target_date and target_start_time and target_end_time:
        start_dt, end_dt = _parse_time_slots(target_date, target_start_time, target_end_time)
        _check_conflicts(
            db,
            user_center,
            target_therapist_id,
            target_student_id,
            start_dt,
            end_dt,
            exclude_id=session_id,
        )
        updates["date"] = target_date
        updates["startTime"] = target_start_time
        updates["endTime"] = target_end_time
        updates["startDateTime"] = start_dt.isoformat()
        updates["endDateTime"] = end_dt.isoformat()
        updates["scheduledAt"] = start_dt.isoformat()
        updates["durationMinutes"] = int((end_dt - start_dt).total_seconds() // 60)

    if body.therapyType is not None:
        updates["therapyType"] = body.therapyType
        updates["title"] = f"{body.therapyType} - {existing.get('studentName', 'Student')}"
    if body.therapistId is not None:
        updates["therapistId"] = body.therapistId
    if body.therapistName is not None:
        updates["therapistName"] = body.therapistName
    if body.location is not None:
        updates["location"] = body.location
    if body.sessionType is not None:
        updates["sessionType"] = body.sessionType
    if body.notes is not None:
        updates["notes"] = body.notes
    if body.status is not None:
        updates["status"] = body.status
    if body.parentId is not None:
        updates["parentId"] = body.parentId
    if body.teletherapySessionId is not None:
        updates["teletherapySessionId"] = body.teletherapySessionId

    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update.")

    updates["updatedAt"] = datetime.now(timezone.utc).isoformat()
    db.collection("therapySessions").document(session_id).update(updates)

    logger.info("[therapy-timeline] Updated session %s by %s", session_id, uid)
    return {"message": "Session updated successfully.", "updates": updates}


@router.delete("/sessions/{session_id}")
async def delete_therapy_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Delete or mark cancelled a therapy session.
    Admin can delete any center session. Therapist can delete own session.
    """
    require_role(current_user, ["admin", "therapist"])
    db = get_db()

    snap = db.collection("therapySessions").document(session_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Therapy session not found.")

    existing = snap.to_dict() or {}
    role = current_user.get("role", "")
    uid = current_user.get("uid", "")
    user_center = current_user.get("centerId", "center-001")

    if existing.get("centerId") != user_center:
        raise HTTPException(status_code=403, detail="Session belongs to another center.")

    if role == "therapist" and existing.get("therapistId") != uid:
        raise HTTPException(status_code=403, detail="Therapists can only delete their own sessions.")

    # Hard delete document from Firestore
    db.collection("therapySessions").document(session_id).delete()
    logger.info("[therapy-timeline] Deleted session %s by %s", session_id, uid)
    return {"message": "Session deleted successfully."}

from fastapi import APIRouter, Depends, Query
from models.schemas import PanicAlertCreate, PanicAlertResolve
from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, require_role
from config import DEFAULT_CENTER_ID
from datetime import datetime, timezone
import logging
import uuid

router = APIRouter(prefix="/api/panic", tags=["panic"])


@router.post("/alert")
async def create_panic_alert(
    body: PanicAlertCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Fan out an alert the client has already recorded.

    The frontend writes the panicAlerts document itself so the admin console
    updates in real time even when this API is unreachable, then calls here
    with that alert's id. This endpoint used to mint a *second* uuid and write
    a duplicate document, so every emergency produced two alert records and two
    rounds of admin notifications.

    Notifying staff requires reading the centre's user directory, which
    firestore.rules only grants to admins — so a teacher or therapist raising
    an alert could never notify anyone from the browser. That fan-out lives
    here, where the Admin SDK is not subject to those rules.
    """
    require_role(current_user, ["teacher", "therapist", "admin"])
    db = get_db()

    # Trust the caller's own centre, not a centerId supplied in the body.
    center_id = current_user.get("centerId") or body.centerId
    alert_id = body.alertId or str(uuid.uuid4())

    data = {
        "id":            alert_id,
        "studentId":     body.studentId,
        "centerId":      center_id,
        "reportedBy":    body.reportedBy,
        "emergencyType": body.emergencyType,
        "description":   body.description,
        "location":      body.location,
        "timestamp":     datetime.now(timezone.utc).isoformat(),
        "status":        "active",
        "resolvedAt":    None,
        "resolvedBy":    None,
    }

    # Upsert the same id the client used: creates the record if the client
    # write failed, and leaves an existing one otherwise.
    alert_ref = db.collection("panicAlerts").document(alert_id)
    if not alert_ref.get().exists:
        alert_ref.set(data)

    # Notify every member of staff at the centre, not just admins.
    notified = 0
    try:
        staff_docs = (
            db.collection("users")
            .where("centerId", "==", center_id)
            .where("status", "==", "approved")
            .stream()
        )
        reporter_uid = (body.reportedBy or {}).get("uid") if isinstance(body.reportedBy, dict) else None
        for staff in staff_docs:
            staff_data = staff.to_dict() or {}
            if staff_data.get("role") not in ("admin", "teacher", "therapist"):
                continue
            if staff.id == reporter_uid:
                continue
            db.collection("notifications").add({
                "recipientId": staff.id,
                "type":        "panic_alert",
                "alertId":     alert_id,
                "title":       "Panic Alert",
                "message":     f"PANIC ALERT: {body.emergencyType} in {body.location}",
                "read":        False,
                "createdAt":   datetime.now(timezone.utc).isoformat(),
            })
            notified += 1
    except Exception as e:
        logging.error(f"[Panic] Staff notification fan-out failed: {e}")

    # Send email notifications to admins
    emailed = False
    try:
        from utils.email_util import send_panic_email_alert
        emailed = send_panic_email_alert(data)
    except Exception as e:
        logging.error(f"[Panic] Email send error (non-critical): {e}")

    return {
        "message": "Panic alert dispatched",
        "id": alert_id,
        "staffNotified": notified,
        "emailSent": emailed,
    }


@router.get("/alerts")
async def list_alerts(
    centerId: str = Query(DEFAULT_CENTER_ID),
    status: str   = Query("all"),
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["admin"])
    db    = get_db()
    query = db.collection("panicAlerts").where("centerId", "==", centerId)
    if status in ("active", "resolved"):
        query = query.where("status", "==", status)
    docs = query.order_by("timestamp", direction="DESCENDING").stream()
    return [{"id": doc.id, **doc.to_dict()} for doc in docs]


@router.put("/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    body: PanicAlertResolve,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["admin"])
    db      = get_db()
    updates = {
        "status":     "resolved",
        "resolvedAt": datetime.now(timezone.utc).isoformat(),
        "resolvedBy": body.resolvedBy,
    }
    db.collection("panicAlerts").document(alert_id).update(updates)
    return {"message": "Alert resolved"}

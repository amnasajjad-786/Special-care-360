from fastapi import APIRouter, Depends, Query
from models.schemas import PanicAlertCreate, PanicAlertResolve
from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, require_role
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/api/panic", tags=["panic"])


@router.post("/alert")
async def create_panic_alert(
    body: PanicAlertCreate,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["teacher", "therapist", "admin"])
    db       = get_db()
    alert_id = str(uuid.uuid4())
    data = {
        "id":            alert_id,
        "studentId":     body.studentId,
        "centerId":      body.centerId,
        "reportedBy":    body.reportedBy,
        "emergencyType": body.emergencyType,
        "description":   body.description,
        "location":      body.location,
        "timestamp":     datetime.now(timezone.utc).isoformat(),
        "status":        "active",
        "resolvedAt":    None,
        "resolvedBy":    None,
    }
    db.collection("panicAlerts").document(alert_id).set(data)

    # Notify all admins in the same center
    try:
        admin_docs = (
            db.collection("users")
            .where("centerId", "==", body.centerId)
            .where("role", "==", "admin")
            .stream()
        )
        for admin in admin_docs:
            db.collection("notifications").add({
                "recipientId": admin.id,
                "type":        "panic_alert",
                "alertId":     alert_id,
                "message":     f"🚨 PANIC ALERT: {body.emergencyType} in {body.location}",
                "read":        False,
                "createdAt":   datetime.now(timezone.utc).isoformat(),
            })
    except Exception as e:
        print(f"[Panic] Notification error (non-critical): {e}")

    return {"message": "Panic alert sent", "id": alert_id}


@router.get("/alerts")
async def list_alerts(
    centerId: str = Query("demo-center-001"),
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

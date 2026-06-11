from fastapi import APIRouter, Depends, Query
from models.schemas import PanicAlertCreate, PanicAlertResolve
from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, require_role
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/api/panic", tags=["panic"])

MOCK_ALERTS = [
    {
        "id": "a1", "studentId": "s1", "centerId": "demo-center-001",
        "reportedBy": {"uid": "t1", "name": "Ms. Fatima"},
        "emergencyType": "Severe Meltdown", "description": "Student having major meltdown after transition",
        "location": "Classroom A", "timestamp": "2026-04-22T10:30:00Z",
        "status": "active", "resolvedAt": None, "resolvedBy": None
    }
]


def _get_db_safe():
    try:
        return get_db()
    except RuntimeError:
        return None


@router.post("/alert")
async def create_panic_alert(
    body: PanicAlertCreate,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["teacher", "therapist", "admin"])
    alert_id = str(uuid.uuid4())
    data = {
        "id": alert_id,
        "studentId": body.studentId,
        "centerId": body.centerId,
        "reportedBy": body.reportedBy,
        "emergencyType": body.emergencyType,
        "description": body.description,
        "location": body.location,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "active",
        "resolvedAt": None,
        "resolvedBy": None,
    }

    db = _get_db_safe()
    if not db:
        return {"message": "Alert sent (placeholder mode)", "id": alert_id}

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
            admin_data = admin.to_dict()
            db.collection("notifications").add({
                "recipientId": admin.id,
                "type": "panic_alert",
                "alertId": alert_id,
                "message": f"🚨 PANIC ALERT: {body.emergencyType} in {body.location}",
                "read": False,
                "createdAt": datetime.now(timezone.utc).isoformat(),
            })
    except Exception as e:
        print(f"Notification error (non-critical): {e}")

    return {"message": "Panic alert sent", "id": alert_id}


@router.get("/alerts")
async def list_alerts(
    centerId: str = Query("demo-center-001"),
    status: str = Query("all"),
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["admin"])
    db = _get_db_safe()
    if not db:
        if status == "active":
            return [a for a in MOCK_ALERTS if a["status"] == "active"]
        return MOCK_ALERTS

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
    db = _get_db_safe()
    updates = {
        "status": "resolved",
        "resolvedAt": datetime.now(timezone.utc).isoformat(),
        "resolvedBy": body.resolvedBy,
    }

    if not db:
        return {"message": "Alert resolved (placeholder mode)"}

    db.collection("panicAlerts").document(alert_id).update(updates)
    return {"message": "Alert resolved"}

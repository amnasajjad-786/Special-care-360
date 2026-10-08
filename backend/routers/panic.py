from datetime import datetime, timezone
import uuid
from fastapi import APIRouter, Depends, Query, HTTPException
from models.schemas import PanicAlertCreate, PanicAlertResolve
from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, require_role
from middleware.student_access import authorize_student, valid_id
from panic_delivery import dispatch_alert

router = APIRouter(prefix="/api/panic", tags=["panic"])


@router.post("/alert")
def create_panic_alert(body: PanicAlertCreate, current_user: dict = Depends(get_current_user)):
    require_role(current_user, ["teacher", "therapist", "admin"])
    db = get_db()
    student = authorize_student(body.studentId, current_user, db)
    alert_id = valid_id(body.alertId or str(uuid.uuid4()))
    reference = db.collection("panicAlerts").document(alert_id)
    old = reference.get()
    if old.exists:
        data = old.to_dict() or {}
        if (data.get("studentId") != body.studentId or data.get("centerId") != current_user["centerId"]
                or data.get("reportedBy", {}).get("uid") != current_user["uid"]):
            raise HTTPException(403, "Alert reference mismatch")
    else:
        reference.create({"id": alert_id, "studentId": body.studentId,
            "centerId": student["centerId"], "parentId": student.get("parentId"),
            "reportedBy": {"uid": current_user["uid"], "name": current_user.get("name", "Staff")},
            "emergencyType": body.emergencyType, "description": body.description, "location": body.location,
            "timestamp": datetime.now(timezone.utc).isoformat(), "status": "active",
            "deliveryStatus": "pending", "resolvedAt": None, "resolvedBy": None})
    # FastAPI runs this synchronous route in its request thread pool.
    result = dispatch_alert(db, reference)
    return {"id": alert_id, "deliveryStatus": result.get("deliveryStatus", "pending"),
        "staffNotified": result.get("staffNotified", 0), "deliveryLatencyMs": result.get("deliveryLatencyMs"),
        "message": "Notifications delivered" if result.get("deliveryStatus") == "delivered" else "Alert recorded; delivery pending retry"}


@router.get("/alerts")
def list_alerts(centerId: str | None = Query(None), status: str = Query("all"), current_user: dict = Depends(get_current_user)):
    require_role(current_user, ["admin"])
    if centerId and centerId != current_user["centerId"]:
        raise HTTPException(403, "Centre mismatch")
    query = get_db().collection("panicAlerts").where("centerId", "==", current_user["centerId"])
    if status in ("active", "resolved"):
        query = query.where("status", "==", status)
    return [{"id": doc.id, **doc.to_dict()} for doc in query.order_by("timestamp", direction="DESCENDING").stream()]


@router.put("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: str, body: PanicAlertResolve, current_user: dict = Depends(get_current_user)):
    require_role(current_user, ["admin"])
    reference = get_db().collection("panicAlerts").document(valid_id(alert_id))
    snapshot = reference.get()
    if not snapshot.exists or (snapshot.to_dict() or {}).get("centerId") != current_user["centerId"]:
        raise HTTPException(403, "Alert access denied")
    reference.update({"status": "resolved", "resolvedAt": datetime.now(timezone.utc).isoformat(), "resolvedBy": current_user["uid"]})
    return {"message": "Alert resolved"}

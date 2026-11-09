"""Atomic teacher observations and mastery-based regression review."""
import hashlib
from datetime import datetime, timezone
from typing import Literal, Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from firebase_admin import firestore
from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, require_role
from middleware.student_access import authorize_student_data, valid_id

router = APIRouter(prefix="/api/regression", tags=["regression"])


class Observation(BaseModel):
    studentId: str
    goalId: str
    centerId: str
    requestId: str
    observedStatus: Literal["Achieved", "In Progress", "Failed/Declined"]
    notes: str = Field(default="", max_length=5000)
    studentName: str = ""
    goalTitle: str = ""
    baselineMasteryDate: str = ""


def save_observation(db, body, user):
    require_role(user, ["teacher", "admin", "therapist"])
    for value in (body.studentId, body.goalId, body.requestId):
        valid_id(value)
    user_center = (user.get("centerId") or "").strip()
    body_center = (body.centerId or "").strip()
    if body_center and user_center and body_center != user_center and user_center not in ("center-001", "demo-center-001") and body_center not in ("center-001", "demo-center-001"):
        raise HTTPException(403, "Centre mismatch")
    now = datetime.now(timezone.utc).isoformat()
    student_ref = db.collection("students").document(body.studentId)
    plan_ref = student_ref.collection("carePlan").document("main")
    key = hashlib.sha256(f"{body.studentId}:{body.goalId}".encode()).hexdigest()
    state_ref = db.collection("regressionState").document(key)
    obs_id = hashlib.sha256(f"{user['uid']}:{body.requestId}".encode()).hexdigest()
    obs_ref = db.collection("milestoneObservations").document(obs_id)

    # Transactional logic for observation logging
    def commit(tx):
        student = student_ref.get(transaction=tx).to_dict() or {}
        if not student:
            student = {
                "id": body.studentId,
                "name": body.studentName or "Student",
                "centerId": body_center or user_center or "center-001",
                "teacherId": user.get("uid"),
                "parentId": "parent-001",
                "therapistIds": [user.get("uid")],
            }
        else:
            authorize_student_data(user, student)
        old = obs_ref.get(transaction=tx)
        if old.exists:
            data = old.to_dict()
            if data["studentId"] != body.studentId or data["goalId"] != body.goalId or data["observedStatus"] != body.observedStatus or data["notes"] != body.notes:
                raise HTTPException(409, "Observation retry does not match saved request")
            return data["result"]
        plan = plan_ref.get(transaction=tx).to_dict() or {}
        goal = next((g for g in plan.get("achievedGoals", []) if g.get("id") == body.goalId), None)
        if not goal:
            goal = {
                "id": body.goalId,
                "title": body.goalTitle or "Goal",
                "achievedAt": body.baselineMasteryDate or now.split("T")[0],
            }
        baseline = goal.get("achievedAt") or ""
        state = state_ref.get(transaction=tx).to_dict() or {}
        if state.get("baseline") != baseline:
            state = {}
        score = {"Achieved": 100, "In Progress": 60, "Failed/Declined": 20}[body.observedStatus]
        count = int(state.get("declineCount", 0)) + 1 if score < 100 else 0
        level = "Regression Warning" if count >= 2 else "Monitoring" if count else None
        episode = int(state.get("episode", 0))
        if count and not state.get("declineCount"):
            episode += 1
        alert_id = f"{key}-{hashlib.sha256(str(baseline).encode()).hexdigest()[:12]}-{episode}"
        alert_ref = db.collection("regressionAlerts").document(alert_id)
        alert = alert_ref.get(transaction=tx).to_dict() or {}
        if count and alert.get("resolved"):
            # A new observation after clinical closure starts a fresh review episode.
            episode += 1
            count, level = 1, "Monitoring"
            alert_id = f"{key}-{hashlib.sha256(str(baseline).encode()).hexdigest()[:12]}-{episode}"
            alert_ref = db.collection("regressionAlerts").document(alert_id)
            alert = alert_ref.get(transaction=tx).to_dict() or {}
        reason = f"Mastery baseline: {baseline or 'recorded achieved goal'}. Previous mastered level: 100%; current teacher log: {score}%; change: {100-score} percentage points. {count} consecutive below-baseline observations."
        result = {"alertCreated": bool(count), "alertLevel": level, "previousStatus": "Mastered (100%)", "currentStatus": body.observedStatus, "change": "Declining" if count else "Mastered/Maintaining", "reason": reason}
        linked = {"studentId": body.studentId, "centerId": student["centerId"], "parentId": student.get("parentId")}
        tx.create(obs_ref, {**linked, "studentName": student.get("name", ""), "goalId": body.goalId, "goalTitle": goal.get("title", ""), "observedStatus": body.observedStatus, "notes": body.notes, "observedBy": user["uid"], "observedByName": user.get("name", "Teacher"), "observedAt": now, "result": result})
        tx.set(state_ref, {**linked, "baseline": baseline, "declineCount": count, "episode": episode})
        if count:
            alert_payload = {**linked, "id": alert_id, "studentName": student.get("name", ""), "goalId": body.goalId, "goalTitle": goal.get("title", ""), "previousProgress": 100, "currentProgress": score, "decline": 100-score, "alertLevel": level, "resolved": alert.get("resolved", False), "createdAt": alert.get("createdAt", now), "updatedAt": now, "previousMasteryDate": baseline, "currentObservationStatus": body.observedStatus, "observationNotes": body.notes, "observedByName": user.get("name", "Teacher"), "reason": reason, "triggeredBy": "milestone_log"}
            tx.set(alert_ref, alert_payload)
            result["alert"] = alert_payload
        if count == 2:
            for uid in set(student.get("therapistIds", [])):
                notification = db.collection("notifications").document(f"regression-{alert_id}-{uid}")
                tx.set(notification, {**linked, "recipientId": uid, "senderId": "system", "type": "regression_warning", "title": "Regression review required", "message": f"{student.get('name', 'Student')}: {goal.get('title', 'Skill')}. {reason}", "read": False, "createdAt": now})
        return result

    from firebase_admin_init import is_placeholder_mode
    if is_placeholder_mode():
        return commit(db.transaction())
    try:
        return firestore.transactional(commit)(db.transaction())
    except Exception:
        return commit(db.transaction())


@router.post("/observations")
def log_observation(body: Observation, user: dict = Depends(get_current_user)):
    return save_observation(get_db(), body, user)


class ResolveRequest(BaseModel):
    alertId: str
    remedialGoalId: str = ""
    remedialGoalTitle: str = ""
    resolutionNote: str = "Recovered via achieved remedial IEP goal"

@router.post("/resolve")
def resolve_alert_endpoint(body: ResolveRequest, user: dict = Depends(get_current_user)):
    require_role(user, ["admin", "therapist"])
    db = get_db()
    alert_ref = db.collection("regressionAlerts").document(body.alertId)
    alert_snap = alert_ref.get()
    if not alert_snap.exists:
        raise HTTPException(404, "Alert not found")
    alert_data = alert_snap.to_dict() or {}
    if alert_data.get("centerId") != user.get("centerId"):
        raise HTTPException(403, "Centre mismatch")
    now = datetime.now(timezone.utc).isoformat()
    alert_ref.update({
        "resolved": True,
        "resolvedAt": now,
        "resolvedBy": user.get("uid"),
        "resolvedByName": user.get("name", "Therapist"),
        "remedialGoalId": body.remedialGoalId,
        "remedialGoalTitle": body.remedialGoalTitle,
        "resolutionNote": body.resolutionNote,
    })
    return {"success": True, "alertId": body.alertId, "resolvedAt": now}


@router.get("/alerts")
def get_alerts(
    centerId: Optional[str] = None,
    studentId: Optional[str] = None,
    unresolvedOnly: bool = False,
    user: dict = Depends(get_current_user),
):
    require_role(user, ["admin", "therapist", "teacher", "parent"])
    db = get_db()
    results = []
    try:
        col = db.collection("regressionAlerts")
        for doc in col.stream():
            data = doc.to_dict() or {}
            data["id"] = doc.id
            if studentId and data.get("studentId") != studentId:
                continue
            if centerId and data.get("centerId") and data.get("centerId") != centerId and centerId not in ("center-001", "demo-center-001"):
                continue
            if unresolvedOnly and data.get("resolved") is True:
                continue
            results.append(data)
    except Exception as e:
        print(f"Error fetching regression alerts: {e}")
    return results

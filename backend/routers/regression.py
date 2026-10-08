"""Atomic teacher observations and mastery-based regression review."""
import hashlib
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
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


def save_observation(db, body, user):
    require_role(user, ["teacher"])
    for value in (body.studentId, body.goalId, body.requestId):
        valid_id(value)
    if body.centerId != user["centerId"]:
        raise HTTPException(403, "Centre mismatch")
    now = datetime.now(timezone.utc).isoformat()
    student_ref = db.collection("students").document(body.studentId)
    plan_ref = student_ref.collection("carePlan").document("main")
    key = hashlib.sha256(f"{body.studentId}:{body.goalId}".encode()).hexdigest()
    state_ref = db.collection("regressionState").document(key)
    obs_id = hashlib.sha256(f"{user['uid']}:{body.requestId}".encode()).hexdigest()
    obs_ref = db.collection("milestoneObservations").document(obs_id)

    @firestore.transactional
    def commit(tx):
        student = student_ref.get(transaction=tx).to_dict() or {}
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
            raise HTTPException(400, "Goal must exist in finalized achieved-goal history")
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
            tx.set(alert_ref, {**linked, "studentName": student.get("name", ""), "goalId": body.goalId, "goalTitle": goal.get("title", ""), "previousProgress": 100, "currentProgress": score, "decline": 100-score, "alertLevel": level, "resolved": alert.get("resolved", False), "createdAt": alert.get("createdAt", now), "updatedAt": now, "previousMasteryDate": baseline, "currentObservationStatus": body.observedStatus, "observationNotes": body.notes, "observedByName": user.get("name", "Teacher"), "reason": reason, "triggeredBy": "milestone_log"})
        if count == 2:
            for uid in set(student.get("therapistIds", [])):
                notification = db.collection("notifications").document(f"regression-{alert_id}-{uid}")
                tx.set(notification, {**linked, "recipientId": uid, "senderId": "system", "type": "regression_warning", "title": "Regression review required", "message": f"{student.get('name', 'Student')}: {goal.get('title', 'Skill')}. {reason}", "read": False, "createdAt": now})
        return result

    return commit(db.transaction())


@router.post("/observations")
def log_observation(body: Observation, user: dict = Depends(get_current_user)):
    return save_observation(get_db(), body, user)

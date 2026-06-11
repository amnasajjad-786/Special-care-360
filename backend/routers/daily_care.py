from fastapi import APIRouter, HTTPException, Depends, Query
from models.schemas import DailyCareSubmit
from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, require_role
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/api/daily-care", tags=["daily-care"])

MOCK_JOURNAL = {
    "studentId": "s1",
    "date": "2026-04-22",
    "meals": {
        "breakfast": {"ate": "fully", "notes": "Enjoyed oatmeal"},
        "lunch": {"ate": "partially", "notes": "Left some rice"},
        "snack": {"ate": "fully", "notes": "Loved the banana"}
    },
    "hygiene": {"teethBrushed": True, "handsWashed": True, "diaperAssisted": False, "hairCombed": True},
    "moodTimeline": [
        {"slot": "Morning", "mood": "happy"},
        {"slot": "Midday", "mood": "neutral"},
        {"slot": "After Lunch", "mood": "happy"},
        {"slot": "End of Day", "mood": "tired"},
    ],
    "physicalActivity": "Active",
    "activityNotes": "Participated in outdoor play",
    "incidents": "",
    "teacherNotes": "Ali had a great day overall!",
    "submittedBy": "teacher-001",
    "submittedAt": "2026-04-22T14:00:00Z"
}


def _get_db_safe():
    try:
        return get_db()
    except RuntimeError:
        return None


@router.post("")
async def submit_journal(
    body: DailyCareSubmit,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["teacher", "admin"])
    doc_id = f"{body.date}_{body.studentId}"
    data = body.model_dump()
    data["submittedAt"] = datetime.now(timezone.utc).isoformat()

    db = _get_db_safe()
    if not db:
        return {"message": "Journal submitted (placeholder mode)", "docId": doc_id}

    db.collection("dailyCareJournals").document(doc_id).set(data)

    # Trigger notification (in placeholder mode, just log)
    # In production: update a notifications subcollection for the parent
    try:
        student_doc = db.collection("students").document(body.studentId).get()
        if student_doc.exists:
            student_data = student_doc.to_dict()
            parent_id = student_data.get("parentId")
            if parent_id:
                db.collection("notifications").add({
                    "recipientId": parent_id,
                    "type": "daily_journal",
                    "studentId": body.studentId,
                    "date": body.date,
                    "message": f"Daily journal for {body.date} has been submitted.",
                    "read": False,
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                })
    except Exception:
        pass  # Notification failure shouldn't block journal submission

    return {"message": "Journal submitted successfully", "docId": doc_id}


@router.get("/{student_id}/{date}")
async def get_journal(
    student_id: str,
    date: str,
    current_user: dict = Depends(get_current_user)
):
    db = _get_db_safe()
    if not db:
        return MOCK_JOURNAL

    doc_id = f"{date}_{student_id}"
    doc = db.collection("dailyCareJournals").document(doc_id).get()
    if not doc.exists:
        return None
    return doc.to_dict()


@router.get("/{student_id}/history")
async def get_history(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = _get_db_safe()
    if not db:
        # Return 5 days of mock history
        today = datetime.now(timezone.utc)
        history = []
        moods = ["happy", "neutral", "happy", "sad", "happy"]
        for i in range(5):
            d = (today - timedelta(days=i)).strftime("%Y-%m-%d")
            entry = dict(MOCK_JOURNAL)
            entry["date"] = d
            entry["moodTimeline"][0]["mood"] = moods[i]
            history.append(entry)
        return history

    # Last 30 days — query by studentId
    docs = (
        db.collection("dailyCareJournals")
        .where("studentId", "==", student_id)
        .order_by("date", direction="DESCENDING")
        .limit(30)
        .stream()
    )
    return [doc.to_dict() for doc in docs]

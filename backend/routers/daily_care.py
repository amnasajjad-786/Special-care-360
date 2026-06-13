from fastapi import APIRouter, HTTPException, Depends
from models.schemas import DailyCareSubmit
from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, require_role
from datetime import datetime, timezone

router = APIRouter(prefix="/api/daily-care", tags=["daily-care"])


@router.post("")
async def submit_journal(
    body: DailyCareSubmit,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["teacher", "admin"])
    db     = get_db()
    doc_id = f"{body.date}_{body.studentId}"
    data   = body.model_dump()
    data["submittedAt"] = datetime.now(timezone.utc).isoformat()
    data["submittedBy"] = current_user.get("uid", "")

    db.collection("dailyCareJournals").document(doc_id).set(data)

    # Notify the parent of this student
    try:
        student_doc = db.collection("students").document(body.studentId).get()
        if student_doc.exists:
            parent_id = student_doc.to_dict().get("parentId")
            if parent_id:
                db.collection("notifications").add({
                    "recipientId": parent_id,
                    "type":        "daily_journal",
                    "studentId":   body.studentId,
                    "date":        body.date,
                    "message":     f"Daily journal for {body.date} has been submitted.",
                    "read":        False,
                    "createdAt":   datetime.now(timezone.utc).isoformat(),
                })
    except Exception:
        pass  # Notification failure must not block journal submission

    return {"message": "Journal submitted successfully", "docId": doc_id}


@router.get("/{student_id}/{date}")
async def get_journal(
    student_id: str,
    date: str,
    current_user: dict = Depends(get_current_user)
):
    db     = get_db()
    doc_id = f"{date}_{student_id}"
    doc    = db.collection("dailyCareJournals").document(doc_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Journal not found for this date")
    return doc.to_dict()


@router.get("/{student_id}/history")
async def get_history(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    db   = get_db()
    docs = (
        db.collection("dailyCareJournals")
        .where("studentId", "==", student_id)
        .order_by("date", direction="DESCENDING")
        .limit(30)
        .stream()
    )
    return [doc.to_dict() for doc in docs]

"""Student documents and reports: upload, list, download (Charter scope).

Assessments, medical letters, progress reports and similar files are stored in
private Firebase Storage (see ``file_storage``). Browsers have no direct access
(``storage.rules`` denies everything); they receive only a five-minute signed
link issued after this API re-checks that the caller may see the child.

Metadata lives in Firestore ``studentDocuments`` with the usual denormalised
``centerId``/``parentId`` so the browser can list it under the same rules as
every other child record. Browsers cannot write that collection; only this
API can, after validating the file.
"""
import re
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from starlette.concurrency import run_in_threadpool

from audit import record_audit
from firebase_admin_init import get_db, is_placeholder_mode
from middleware.auth_middleware import get_current_user, require_role
from middleware.student_access import authorize_student, valid_id
import file_storage

router = APIRouter(prefix="/api/documents", tags=["documents"])

MAX_BYTES = 10 * 1024 * 1024
CATEGORIES = {"assessment", "medical", "progress_report", "iep", "consent", "other"}
# Detected from the file's own bytes; the declared type and extension must agree.
SIGNATURES = (
    (b"%PDF-", "application/pdf", (".pdf",)),
    (b"\x89PNG\r\n\x1a\n", "image/png", (".png",)),
    (b"\xff\xd8\xff", "image/jpeg", (".jpg", ".jpeg")),
    (b"PK\x03\x04", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", (".docx",)),
)


def object_path(student_id: str, document_id: str) -> str:
    return f"student-documents/{student_id}/{document_id}"


def detect_type(head: bytes, filename: str) -> str:
    lower = filename.lower()
    for magic, content_type, extensions in SIGNATURES:
        if head.startswith(magic) and lower.endswith(extensions):
            return content_type
    raise HTTPException(415, "Upload a PDF, PNG, JPEG or Word (.docx) file.")


def safe_filename(filename: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._ -]", "_", filename).strip()[:120]
    return cleaned or "document"


def context(student_id: str, user: dict):
    require_role(user, ["admin", "teacher", "therapist", "parent", "caregiver"])
    if is_placeholder_mode():
        raise HTTPException(503, "Document sharing requires live Firebase authentication.")
    db = get_db()
    return db, authorize_student(student_id, user, db)


def notify_team(db, student: dict, student_id: str, user: dict, title: str) -> None:
    recipients = {student.get("parentId"), student.get("teacherId"), *student.get("therapistIds", []), *student.get("caregiverIds", [])}
    recipients.discard(None)
    recipients.discard("")
    recipients.discard(user["uid"])
    now = datetime.now(timezone.utc).isoformat()
    for uid in recipients:
        try:
            db.collection("notifications").add({
                "recipientId": uid, "senderId": user["uid"], "type": "student_document",
                "title": "New document shared", "message": f"{user.get('name') or 'A care team member'} shared \"{title}\" for {student.get('name', 'your child')}.",
                "studentId": student_id, "centerId": student.get("centerId"), "parentId": student.get("parentId"),
                "read": False, "createdAt": now,
            })
        except Exception:
            pass  # Notification delivery never undoes a saved document.


@router.post("/{student_id}", status_code=201)
async def upload_document(student_id: str, request: Request,
                          title: str = Query(..., min_length=1, max_length=120),
                          category: str = Query("other"),
                          filename: str = Query(..., min_length=1, max_length=200),
                          user=Depends(get_current_user)):
    if category not in CATEGORIES:
        raise HTTPException(422, "Choose a valid document category.")
    db, student = await run_in_threadpool(context, student_id, user)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BYTES:
            raise HTTPException(413, "Documents are limited to 10 MB.")
    if not body:
        raise HTTPException(422, "The file is empty.")
    content_type = detect_type(bytes(body[:16]), filename)

    document_id = uuid4().hex
    path = object_path(student_id, document_id)
    await run_in_threadpool(file_storage.put, path, bytes(body), content_type)

    record = {
        "id": document_id, "studentId": student_id, "centerId": student["centerId"], "parentId": student.get("parentId"),
        "title": title.strip(), "category": category, "fileName": safe_filename(filename), "contentType": content_type,
        "size": len(body), "uploadedBy": user["uid"], "uploadedByName": str(user.get("name") or ""), "uploadedByRole": user["role"],
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await run_in_threadpool(db.collection("studentDocuments").document(document_id).set, record)
    except Exception as exc:
        await run_in_threadpool(file_storage.delete, path)
        raise HTTPException(503, "Could not register the uploaded document.") from exc

    await run_in_threadpool(notify_team, db, student, student_id, user, record["title"])
    await run_in_threadpool(record_audit, db, user, "document.upload", "studentDocument", document_id, student_id,
                            f"Uploaded {category} document \"{record['title']}\" ({len(body)} bytes)", student["centerId"])
    return record


def load_document(db, student_id: str, document_id: str) -> dict:
    if not re.fullmatch(r"[a-f0-9]{32}", document_id):
        raise HTTPException(404, "Document not found.")
    data = db.collection("studentDocuments").document(document_id).get().to_dict()
    if not data or data.get("studentId") != student_id:
        raise HTTPException(404, "Document not found.")
    return data


@router.get("/{student_id}/{document_id}/download")
def download_document(student_id: str, document_id: str, response: Response, user=Depends(get_current_user)):
    db, student = context(student_id, user)
    data = load_document(db, student_id, document_id)
    url = file_storage.signed_url(object_path(student_id, document_id), data.get("fileName") or "document")
    record_audit(db, user, "document.download", "studentDocument", document_id, student_id,
                 f"Downloaded \"{data.get('title', '')}\"", student["centerId"])
    response.headers["Cache-Control"] = "no-store"
    return {"url": url, "fileName": data.get("fileName")}


@router.delete("/{student_id}/{document_id}", status_code=204)
def delete_document(student_id: str, document_id: str, user=Depends(get_current_user)):
    db, student = context(student_id, user)
    data = load_document(db, student_id, document_id)
    if data.get("uploadedBy") != user["uid"] and user["role"] != "admin":
        raise HTTPException(403, "Only the uploader or an admin can delete this document.")
    file_storage.delete(object_path(student_id, document_id))
    db.collection("studentDocuments").document(document_id).delete()
    record_audit(db, user, "document.delete", "studentDocument", document_id, student_id,
                 f"Deleted \"{data.get('title', '')}\"", student["centerId"])

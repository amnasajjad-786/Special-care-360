from fastapi import HTTPException
from firebase_admin_init import get_db
from middleware.auth_middleware import require_approved


def valid_id(value):
    if not isinstance(value, str) or not value.strip() or "/" in value or len(value) > 128:
        raise HTTPException(400, "Invalid document reference")
    return value


def authorize_student_data(user, student):
    require_approved(user)
    if student.get("archivedAt") or student.get("centerId") != user["centerId"]:
        raise HTTPException(403, "Student access denied")
    role, uid = user["role"], user["uid"]
    therapists = student.get("therapistIds", [])
    allowed = (role == "admin" or
               (role == "parent" and student.get("parentId") == uid) or
               (role == "teacher" and student.get("teacherId") == uid) or
               (role == "therapist" and isinstance(therapists, list) and uid in therapists))
    if not allowed:
        raise HTTPException(403, "Student access denied")


def authorize_student(student_id, user, db=None):
    valid_id(student_id)
    snapshot = (db or get_db()).collection("students").document(student_id).get()
    if not snapshot.exists:
        raise HTTPException(404, "Student not found")
    data = snapshot.to_dict() or {}
    authorize_student_data(user, data)
    return data


def validate_assignments(data, center_id, db):
    if data.get("centerId", center_id) != center_id:
        raise HTTPException(403, "Centre mismatch")
    assignments = [(data.get("parentId"), "parent")]
    if data.get("teacherId"):
        assignments.append((data["teacherId"], "teacher"))
    therapists = data.get("therapistIds", [])
    if not isinstance(therapists, list) or len(therapists) > 4:
        raise HTTPException(400, "At most four assigned therapists are supported")
    assignments.extend((uid, "therapist") for uid in therapists)
    for uid, role in assignments:
        valid_id(uid)
        snapshot = db.collection("users").document(uid).get()
        profile = snapshot.to_dict() or {}
        if (not snapshot.exists or profile.get("role") != role or
                profile.get("status") != "approved" or profile.get("centerId") != center_id or profile.get("uid", uid) != uid):
            raise HTTPException(400, "Assignment must reference an approved centre member")

from fastapi import APIRouter, HTTPException, Depends, Query
from models.schemas import StudentCreate, StudentUpdate, MedicalProfileUpdate
from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, require_role
from middleware.student_access import authorize_student, authorize_student_data, validate_assignments
from config import DEFAULT_CENTER_ID
from datetime import datetime, timezone
from firebase_admin import firestore
import uuid

router = APIRouter(prefix="/api/students", tags=["students"])


def check_student_access(student_id: str, current_user: dict):
    return authorize_student(student_id, current_user, get_db())


def validate_age(dob: str):
    if not dob:
        return
    try:
        date_part = dob.split("T")[0]
        dob_date = datetime.strptime(date_part, "%Y-%m-%d")
        today = datetime.now()
        age = today.year - dob_date.year - ((today.month, today.day) < (dob_date.month, dob_date.day))
        if age < 0 or age > 12:
            raise HTTPException(status_code=400, detail="Student age must be between 0 and 12 years.")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail="Invalid Date of Birth format. Expected YYYY-MM-DD.")


@router.get("")
def list_students(
    centerId: str = Query(DEFAULT_CENTER_ID),
    current_user: dict = Depends(get_current_user)
):
    db   = get_db()
    require_role(current_user, ["admin", "teacher", "therapist", "parent"])
    if centerId != current_user["centerId"]:
        raise HTTPException(403, "Centre mismatch")
    role = current_user.get("role", "")
    uid  = current_user.get("uid", "")

    query = db.collection("students").where("centerId", "==", centerId)
    docs  = query.stream()

    students = []
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        try:
            authorize_student_data(current_user, data)
        except HTTPException:
            continue
        students.append(data)
    return students


@router.post("")
def create_student(
    body: StudentCreate,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["admin"])
    validate_age(body.dob)
    db         = get_db()
    student_id = str(uuid.uuid4())
    data       = body.model_dump()
    validate_assignments(data, current_user["centerId"], db)
    data["createdAt"] = datetime.now(timezone.utc).isoformat()
    batch = db.batch()
    reference = db.collection("students").document(student_id)
    batch.create(reference, data)

    # Initialise empty sub-documents
    batch.create(reference.collection("medicalProfile").document("main"), {
          "allergies": [], "seizureHistory": {"hasHistory": False},
          "medications": [], "emergencyContact": {}, "bloodType": "",
          "specialPhysicalNeeds": ""
      })
    batch.create(reference.collection("carePlan").document("main"), {"goals": []})
    batch.commit()

    return {"id": student_id, "message": "Student created"}


@router.put("/{student_id}")
def update_student(
    student_id: str,
    body: StudentUpdate,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["admin", "therapist"])
    existing = check_student_access(student_id, current_user)
    if body.dob is not None:
        validate_age(body.dob)
    db      = get_db()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if current_user["role"] != "admin" and any(key in updates for key in ("teacherId", "therapistIds")):
        raise HTTPException(403, "Only admins may change assignments")
    if any(key in updates for key in ("teacherId", "therapistIds")):
        validate_assignments({**existing, **updates}, current_user["centerId"], db)
    updates["updatedAt"] = datetime.now(timezone.utc).isoformat()
    db.collection("students").document(student_id).update(updates)
    return {"message": "Student updated"}


@router.get("/{student_id}")
def get_student(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    check_student_access(student_id, current_user)
    db  = get_db()
    doc = db.collection("students").document(student_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Student not found")
    data       = doc.to_dict()
    data["id"] = doc.id
    return data


@router.get("/{student_id}/medical")
def get_medical_profile(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    check_student_access(student_id, current_user)
    db  = get_db()
    doc = db.collection("students").document(student_id) \
             .collection("medicalProfile").document("main").get()
    return doc.to_dict() if doc.exists else {}


@router.put("/{student_id}/medical")
def update_medical_profile(
    student_id: str,
    body: MedicalProfileUpdate,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["admin", "therapist"])
    check_student_access(student_id, current_user)
    db      = get_db()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updatedAt"] = datetime.now(timezone.utc).isoformat()
    db.collection("students").document(student_id) \
      .collection("medicalProfile").document("main").update(updates)
    return {"message": "Medical profile updated"}


@router.get("/{student_id}/careplan")
def get_care_plan(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    check_student_access(student_id, current_user)
    db  = get_db()
    doc = db.collection("students").document(student_id) \
             .collection("carePlan").document("main").get()
    return doc.to_dict() if doc.exists else {"goals": []}


@router.put("/{student_id}/careplan")
def update_care_plan(
    student_id: str,
    body: dict,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["therapist"])
    check_student_access(student_id, current_user)
    db = get_db()
    if set(body) - {"goals", "expectedVersion"} or not isinstance(body.get("goals"), list):
        raise HTTPException(400, "Expected goals and expectedVersion")
    reference = db.collection("students").document(student_id).collection("carePlan").document("main")

    @firestore.transactional
    def save(transaction):
        snapshot = reference.get(transaction=transaction)
        version = (snapshot.to_dict() or {}).get("version", 0)
        if body.get("expectedVersion", 0) != version:
            raise HTTPException(409, "Care plan changed; reload before saving")
        transaction.set(reference, {"goals": body["goals"], "version": version + 1,
            "updatedAt": datetime.now(timezone.utc).isoformat()}, merge=True)
    save(db.transaction())
    return {"message": "Care plan updated"}

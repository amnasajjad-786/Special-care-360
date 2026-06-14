from fastapi import APIRouter, HTTPException, Depends, Query
from models.schemas import StudentCreate, StudentUpdate, MedicalProfileUpdate
from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, require_role
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/api/students", tags=["students"])


def check_student_access(student_id: str, current_user: dict):
    """Parents can only access their own child's profile."""
    role = current_user.get("role", "")
    uid  = current_user.get("uid", "")
    if role != "parent":
        return

    db  = get_db()
    doc = db.collection("students").document(student_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Student not found")
    if doc.to_dict().get("parentId") != uid:
        raise HTTPException(status_code=403, detail="Unauthorized student access")


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
async def list_students(
    centerId: str = Query("demo-center-001"),
    current_user: dict = Depends(get_current_user)
):
    db   = get_db()
    role = current_user.get("role", "")
    uid  = current_user.get("uid", "")

    query = db.collection("students").where("centerId", "==", centerId)
    docs  = query.stream()

    students = []
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        # Parents only see their own child
        if role == "parent" and data.get("parentId") != uid:
            continue
        students.append(data)
    return students


@router.post("")
async def create_student(
    body: StudentCreate,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["admin"])
    validate_age(body.dob)
    db         = get_db()
    student_id = str(uuid.uuid4())
    data       = body.model_dump()
    data["createdAt"] = datetime.now(timezone.utc).isoformat()

    db.collection("students").document(student_id).set(data)

    # Initialise empty sub-documents
    db.collection("students").document(student_id) \
      .collection("medicalProfile").document("main").set({
          "allergies": [], "seizureHistory": {"hasHistory": False},
          "medications": [], "emergencyContact": {}, "bloodType": "",
          "specialPhysicalNeeds": ""
      })
    db.collection("students").document(student_id) \
      .collection("carePlan").document("main").set({"goals": []})

    return {"id": student_id, "message": "Student created"}


@router.put("/{student_id}")
async def update_student(
    student_id: str,
    body: StudentUpdate,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["admin", "therapist"])
    if body.dob is not None:
        validate_age(body.dob)
    db      = get_db()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updatedAt"] = datetime.now(timezone.utc).isoformat()
    db.collection("students").document(student_id).update(updates)
    return {"message": "Student updated"}


@router.get("/{student_id}")
async def get_student(
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
async def get_medical_profile(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    check_student_access(student_id, current_user)
    db  = get_db()
    doc = db.collection("students").document(student_id) \
             .collection("medicalProfile").document("main").get()
    return doc.to_dict() if doc.exists else {}


@router.put("/{student_id}/medical")
async def update_medical_profile(
    student_id: str,
    body: MedicalProfileUpdate,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["admin", "therapist"])
    db      = get_db()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updatedAt"] = datetime.now(timezone.utc).isoformat()
    db.collection("students").document(student_id) \
      .collection("medicalProfile").document("main").update(updates)
    return {"message": "Medical profile updated"}


@router.get("/{student_id}/careplan")
async def get_care_plan(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    check_student_access(student_id, current_user)
    db  = get_db()
    doc = db.collection("students").document(student_id) \
             .collection("carePlan").document("main").get()
    return doc.to_dict() if doc.exists else {"goals": []}


@router.put("/{student_id}/careplan")
async def update_care_plan(
    student_id: str,
    body: dict,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["admin", "therapist", "teacher"])
    db = get_db()
    db.collection("students").document(student_id) \
      .collection("carePlan").document("main").set(body)
    return {"message": "Care plan updated"}

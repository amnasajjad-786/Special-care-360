from fastapi import APIRouter, HTTPException, Depends, Query
from models.schemas import StudentCreate, StudentUpdate, MedicalProfileUpdate
from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user, require_role
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/api/students", tags=["students"])

MOCK_STUDENTS = [
    {"id": "s1", "name": "Ali Hassan", "dob": "2015-03-12", "diagnosis": "ASD",
     "centerId": "demo-center-001", "teacherId": "t1", "therapistIds": ["th1"],
     "enrollmentDate": "2022-09-01", "iepStatus": "Active", "photoUrl": "", "parentId": "parent-001"},
    {"id": "s2", "name": "Sara Ahmed", "dob": "2016-07-24", "diagnosis": "ADHD",
     "centerId": "demo-center-001", "teacherId": "t1", "therapistIds": [],
     "enrollmentDate": "2023-01-15", "iepStatus": "Active", "photoUrl": ""},
    {"id": "s3", "name": "Omar Malik", "dob": "2014-11-05", "diagnosis": "Down Syndrome",
     "centerId": "demo-center-001", "teacherId": "t2", "therapistIds": ["th1", "th2"],
     "enrollmentDate": "2021-06-01", "iepStatus": "Under Review", "photoUrl": ""},
]


def _get_db_safe():
    try:
        return get_db()
    except RuntimeError:
        return None


def check_student_access(student_id: str, current_user: dict, db=None):
    role = current_user.get("role", "")
    uid = current_user.get("uid", "")
    if role != "parent":
        return

    if not db:
        student = next((s for s in MOCK_STUDENTS if s["id"] == student_id), None)
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        if student.get("parentId") != uid:
            raise HTTPException(status_code=403, detail="Unauthorized student access")
        return

    doc = db.collection("students").document(student_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Student not found")
    if doc.to_dict().get("parentId") != uid:
        raise HTTPException(status_code=403, detail="Unauthorized student access")


@router.get("")
async def list_students(
    centerId: str = Query("demo-center-001"),
    current_user: dict = Depends(get_current_user)
):
    db = _get_db_safe()
    role = current_user.get("role", "")
    uid = current_user.get("uid", "")

    if not db:
        if role == "parent":
            return [s for s in MOCK_STUDENTS if s.get("parentId") == uid]
        return MOCK_STUDENTS

    query = db.collection("students").where("centerId", "==", centerId)

    docs = query.stream()
    students = []
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        # Parents only see their child
        if role == "parent":
            if data.get("parentId") != uid:
                continue
        students.append(data)
    return students


@router.post("")
async def create_student(
    body: StudentCreate,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["admin"])
    db = _get_db_safe()
    student_id = str(uuid.uuid4())
    data = body.model_dump()
    data["createdAt"] = datetime.now(timezone.utc).isoformat()

    if not db:
        return {"id": student_id, "message": "Created (placeholder mode)", **data}

    db.collection("students").document(student_id).set(data)
    # Init empty subcollections
    db.collection("students").document(student_id).collection("medicalProfile").document("main").set({
        "allergies": [], "seizureHistory": {"hasHistory": False},
        "medications": [], "emergencyContact": {}, "bloodType": "", "specialPhysicalNeeds": ""
    })
    db.collection("students").document(student_id).collection("carePlan").document("main").set({
        "goals": []
    })
    return {"id": student_id, "message": "Student created"}


@router.put("/{student_id}")
async def update_student(
    student_id: str,
    body: StudentUpdate,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["admin", "therapist"])
    db = _get_db_safe()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updatedAt"] = datetime.now(timezone.utc).isoformat()

    if not db:
        return {"message": "Updated (placeholder mode)", "id": student_id}

    db.collection("students").document(student_id).update(updates)
    return {"message": "Student updated"}


@router.get("/{student_id}")
async def get_student(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = _get_db_safe()
    check_student_access(student_id, current_user, db)

    if not db:
        student = next((s for s in MOCK_STUDENTS if s["id"] == student_id), None)
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        return student

    doc = db.collection("students").document(student_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Student not found")
    data = doc.to_dict()
    data["id"] = doc.id
    return data


@router.get("/{student_id}/medical")
async def get_medical_profile(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = _get_db_safe()
    check_student_access(student_id, current_user, db)

    if not db:
        return {
            "allergies": ["Peanuts", "Latex"],
            "seizureHistory": {"hasHistory": True, "frequency": "Monthly", "lastOccurrence": "2026-03-15", "protocol": "Place on side, do not restrain, call nurse"},
            "medications": [
                {"name": "Ritalin", "dosage": "10mg", "frequency": "Daily", "time": "8:00 AM", "administeredBy": "Nurse"},
            ],
            "emergencyContact": {"name": "Ahmed Hassan", "relation": "Father", "phone": "+92-300-1234567"},
            "bloodType": "A+",
            "specialPhysicalNeeds": "Wheelchair accessible classroom required"
        }

    doc = db.collection("students").document(student_id).collection("medicalProfile").document("main").get()
    if not doc.exists:
        return {}
    return doc.to_dict()


@router.put("/{student_id}/medical")
async def update_medical_profile(
    student_id: str,
    body: MedicalProfileUpdate,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["admin", "therapist"])
    db = _get_db_safe()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updatedAt"] = datetime.now(timezone.utc).isoformat()

    if not db:
        return {"message": "Medical profile updated (placeholder mode)"}

    db.collection("students").document(student_id).collection("medicalProfile").document("main").update(updates)
    return {"message": "Medical profile updated"}


@router.get("/{student_id}/careplan")
async def get_care_plan(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = _get_db_safe()
    check_student_access(student_id, current_user, db)

    if not db:
        return {"goals": [
            {"id": "g1", "title": "Improve verbal communication", "status": "In Progress", "progressPercent": 60},
            {"id": "g2", "title": "Independent dressing", "status": "Mastered", "progressPercent": 100},
            {"id": "g3", "title": "Social interaction with peers", "status": "In Progress", "progressPercent": 35},
        ]}

    doc = db.collection("students").document(student_id).collection("carePlan").document("main").get()
    return doc.to_dict() if doc.exists else {"goals": []}


@router.put("/{student_id}/careplan")
async def update_care_plan(
    student_id: str,
    body: dict,
    current_user: dict = Depends(get_current_user)
):
    require_role(current_user, ["admin", "therapist", "teacher"])
    db = _get_db_safe()
    if not db:
        return {"message": "Care plan updated (placeholder mode)"}
    db.collection("students").document(student_id).collection("carePlan").document("main").set(body)
    return {"message": "Care plan updated"}

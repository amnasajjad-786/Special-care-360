from typing import Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime


# ──────────────────────────── AUTH ────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str          # admin | teacher | therapist | parent
    centerId: str = "demo-center-001"


class LoginRequest(BaseModel):
    email: str
    password: str
    role: str


# ──────────────────────────── STUDENTS ────────────────────────

class StudentCreate(BaseModel):
    name: str
    dob: str
    diagnosis: str
    centerId: str = "demo-center-001"
    teacherId: Optional[str] = None
    therapistIds: list[str] = []
    enrollmentDate: str
    iepStatus: str = "Active"


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    dob: Optional[str] = None
    diagnosis: Optional[str] = None
    teacherId: Optional[str] = None
    therapistIds: Optional[list[str]] = None
    enrollmentDate: Optional[str] = None
    iepStatus: Optional[str] = None
    photoUrl: Optional[str] = None


class MedicalProfileUpdate(BaseModel):
    allergies: Optional[list[str]] = None
    seizureHistory: Optional[dict] = None
    medications: Optional[list[dict]] = None
    emergencyContact: Optional[dict] = None
    bloodType: Optional[str] = None
    specialPhysicalNeeds: Optional[str] = None


# ──────────────────────────── DAILY CARE ──────────────────────

class DailyCareSubmit(BaseModel):
    studentId: str
    date: str           # yyyy-mm-dd
    meals: dict         # { breakfast: {ate, notes}, lunch: ..., snack: ... }
    hygiene: dict       # { teethBrushed, handsWashed, diaperAssisted, hairCombed }
    moodTimeline: list  # [{ slot, mood }]
    physicalActivity: str
    activityNotes: Optional[str] = ""
    incidents: Optional[str] = ""
    teacherNotes: Optional[str] = ""
    submittedBy: str    # uid


# ──────────────────────────── ABC TRACKER ─────────────────────

class ABCIncidentCreate(BaseModel):
    studentId: str
    centerId: str = "demo-center-001"
    loggedBy: str       # uid
    timestamp: str      # ISO string
    antecedent: dict    # { text, tags[] }
    behavior: dict      # { text, tags[] }
    consequence: dict   # { text, tags[] }
    severity: int       # 1–5
    durationMinutes: int
    location: str


# ──────────────────────────── PANIC ALERT ─────────────────────

class PanicAlertCreate(BaseModel):
    studentId: str
    centerId: str = "demo-center-001"
    reportedBy: dict    # { uid, name }
    emergencyType: str
    description: Optional[str] = ""
    location: str


class PanicAlertResolve(BaseModel):
    resolvedBy: str     # uid

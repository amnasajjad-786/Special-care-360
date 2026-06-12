"""
seed_firestore.py — One-time script to populate Firestore with demo data.

Run from the backend directory:
    python seed_firestore.py

Requires: serviceAccountKey.json in the same directory.
"""

import sys
import os

# Bootstrap Firebase
sys.path.insert(0, os.path.dirname(__file__))
from firebase_admin_init import init_firebase, get_db

init_firebase()
db = get_db()

print("🌱 Seeding Firestore for Special Care 360...\n")


# ── 1. Users ──────────────────────────────────────────────────────────────────
USERS = [
    {
        "uid": "OUsJTDmRYtd1EUK9Ywsr36gz50t2",
        "name": "Dr. Amna Raza",
        "email": "admin@specialcare360.com",
        "role": "admin",
        "centerId": "center-001",
        "status": "approved",
    },
    {
        "uid": "45qodSioggZKyyw72gkPt1vrlFv2",
        "name": "Ms. Fatima Khan",
        "email": "teacher@specialcare360.com",
        "role": "teacher",
        "centerId": "center-001",
        "status": "approved",
    },
    {
        "uid": "cxcgtI5tqmdwxhoW7sK3C96q6sw2",
        "name": "Dr. Zara Ahmed",
        "email": "therapist@specialcare360.com",
        "role": "therapist",
        "centerId": "center-001",
        "status": "approved",
    },
    {
        "uid": "SypFxQwk4NZ95lAh9aznOu4Zk2G3",
        "name": "Mr. Ali Hassan",
        "email": "parent@specialcare360.com",
        "role": "parent",
        "centerId": "center-001",
        "status": "approved",
    },
]

for u in USERS:
    db.collection("users").document(u["uid"]).set(u)
    print(f"  ✅ User: {u['name']} ({u['role']})")


# ── 2. Students ───────────────────────────────────────────────────────────────
STUDENTS = [
    {
        "id": "student-001",
        "name": "Ahmed Hassan",
        "dob": "2015-03-12",
        "diagnosis": "ASD",
        "centerId": "center-001",
        "teacherId": "45qodSioggZKyyw72gkPt1vrlFv2",
        "therapistIds": ["cxcgtI5tqmdwxhoW7sK3C96q6sw2"],
        "enrollmentDate": "2022-09-01",
        "iepStatus": "Active",
        "photoUrl": "",
        "parentId": "SypFxQwk4NZ95lAh9aznOu4Zk2G3",
    },
    {
        "id": "student-002",
        "name": "Sara Ahmed",
        "dob": "2016-07-24",
        "diagnosis": "ADHD",
        "centerId": "center-001",
        "teacherId": "45qodSioggZKyyw72gkPt1vrlFv2",
        "therapistIds": [],
        "enrollmentDate": "2023-01-15",
        "iepStatus": "Active",
        "photoUrl": "",
        "parentId": "",
    },
    {
        "id": "student-003",
        "name": "Omar Malik",
        "dob": "2014-11-05",
        "diagnosis": "Down Syndrome",
        "centerId": "center-001",
        "teacherId": "45qodSioggZKyyw72gkPt1vrlFv2",
        "therapistIds": ["cxcgtI5tqmdwxhoW7sK3C96q6sw2"],
        "enrollmentDate": "2021-06-01",
        "iepStatus": "Under Review",
        "photoUrl": "",
        "parentId": "",
    },
    {
        "id": "student-004",
        "name": "Zara Khan",
        "dob": "2017-04-19",
        "diagnosis": "Cerebral Palsy",
        "centerId": "center-001",
        "teacherId": "45qodSioggZKyyw72gkPt1vrlFv2",
        "therapistIds": ["cxcgtI5tqmdwxhoW7sK3C96q6sw2"],
        "enrollmentDate": "2023-08-10",
        "iepStatus": "Active",
        "photoUrl": "",
        "parentId": "",
    },
]

for s in STUDENTS:
    sid = s.pop("id")
    db.collection("students").document(sid).set(s)

    # Medical profile sub-document
    db.collection("students").document(sid).collection("medicalProfile").document("main").set({
        "allergies": ["Peanuts", "Latex"] if sid == "student-001" else [],
        "bloodType": "A+" if sid == "student-001" else "",
        "specialPhysicalNeeds": "Wheelchair accessible classroom required" if sid == "student-001" else "",
        "seizureHistory": {
            "hasHistory": sid == "student-001",
            "frequency": "Monthly" if sid == "student-001" else "",
            "lastOccurrence": "2026-03-15" if sid == "student-001" else "",
            "protocol": "Place on side, do not restrain, call nurse" if sid == "student-001" else "",
        },
        "medications": [
            {"name": "Ritalin", "dosage": "10mg", "frequency": "Daily", "time": "8:00 AM", "administeredBy": "Nurse"}
        ] if sid == "student-001" else [],
        "emergencyContact": {
            "name": "Ahmed Hassan Sr.", "relation": "Father", "phone": "+92-300-1234567"
        } if sid == "student-001" else {},
    })

    # Care plan sub-document
    db.collection("students").document(sid).collection("carePlan").document("main").set({
        "goals": [
            {"id": "g1", "title": "Improve verbal communication", "status": "In Progress", "progressPercent": 60},
            {"id": "g2", "title": "Independent dressing", "status": "Mastered", "progressPercent": 100},
            {"id": "g3", "title": "Social interaction with peers", "status": "In Progress", "progressPercent": 35},
            {"id": "g4", "title": "Following 2-step instructions", "status": "Regressed", "progressPercent": 20},
        ] if sid == "student-001" else []
    })

    print(f"  ✅ Student: {s['name']}")


# ── 3. ABC Incidents ──────────────────────────────────────────────────────────
from datetime import datetime, timezone, timedelta

INCIDENTS = [
    {
        "studentId": "student-001", "centerId": "center-001", "loggedBy": "45qodSioggZKyyw72gkPt1vrlFv2",
        "timestamp": (datetime.now(timezone.utc) - timedelta(days=0, hours=3)).isoformat(),
        "antecedent": {"text": "Loud announcement on intercom", "tags": ["Loud Noise"]},
        "behavior": {"text": "Covered ears, started rocking", "tags": ["Screaming"]},
        "consequence": {"text": "Moved to quiet corner", "tags": ["Redirected"]},
        "severity": 3, "durationMinutes": 8, "location": "Classroom A",
    },
    {
        "studentId": "student-001", "centerId": "center-001", "loggedBy": "45qodSioggZKyyw72gkPt1vrlFv2",
        "timestamp": (datetime.now(timezone.utc) - timedelta(days=1, hours=2)).isoformat(),
        "antecedent": {"text": "Activity changed without warning", "tags": ["Transition", "Unexpected Change"]},
        "behavior": {"text": "Threw material off desk", "tags": ["Hitting", "Screaming"]},
        "consequence": {"text": "Verbal prompt to calm down", "tags": ["Verbal Prompt"]},
        "severity": 4, "durationMinutes": 15, "location": "Classroom A",
    },
    {
        "studentId": "student-001", "centerId": "center-001", "loggedBy": "cxcgtI5tqmdwxhoW7sK3C96q6sw2",
        "timestamp": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
        "antecedent": {"text": "Request denied", "tags": ["Denied Request"]},
        "behavior": {"text": "Crying and withdrawal", "tags": ["Crying", "Withdrawal"]},
        "consequence": {"text": "Ignored briefly then redirected", "tags": ["Ignored", "Redirected"]},
        "severity": 2, "durationMinutes": 5, "location": "Therapy Room",
    },
    {
        "studentId": "student-001", "centerId": "center-001", "loggedBy": "45qodSioggZKyyw72gkPt1vrlFv2",
        "timestamp": (datetime.now(timezone.utc) - timedelta(days=3)).isoformat(),
        "antecedent": {"text": "Crowded lunch hall", "tags": ["Crowded Space"]},
        "behavior": {"text": "Self-stimulatory behavior", "tags": ["Self-harm"]},
        "consequence": {"text": "Physical support provided", "tags": ["Physical Support"]},
        "severity": 4, "durationMinutes": 12, "location": "Cafeteria",
    },
    {
        "studentId": "student-001", "centerId": "center-001", "loggedBy": "45qodSioggZKyyw72gkPt1vrlFv2",
        "timestamp": (datetime.now(timezone.utc) - timedelta(days=4)).isoformat(),
        "antecedent": {"text": "Loud music in therapy room", "tags": ["Loud Noise"]},
        "behavior": {"text": "Running out of room", "tags": ["Running away"]},
        "consequence": {"text": "Teacher followed calmly", "tags": ["Physical Support"]},
        "severity": 3, "durationMinutes": 6, "location": "Therapy Room",
    },
]

import uuid
for inc in INCIDENTS:
    iid = str(uuid.uuid4())
    inc["id"] = iid
    inc["createdAt"] = datetime.now(timezone.utc).isoformat()
    db.collection("abcIncidents").document(iid).set(inc)
print(f"  ✅ {len(INCIDENTS)} ABC incidents seeded")


# ── 4. Daily Care Journal ─────────────────────────────────────────────────────
today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

for date, notes in [(today, "Ahmed had a great day! Very engaged during circle time."),
                    (yesterday, "A bit restless in the morning, but settled well after snack.")]:
    doc_id = f"{date}_student-001"
    db.collection("dailyCareJournals").document(doc_id).set({
        "studentId": "student-001",
        "date": date,
        "meals": {
            "breakfast": {"ate": "fully", "notes": "Enjoyed oatmeal"},
            "lunch": {"ate": "partially", "notes": "Left some rice"},
            "snack": {"ate": "fully", "notes": "Loved the banana"},
        },
        "hygiene": {"teethBrushed": True, "handsWashed": True, "diaperAssisted": False, "hairCombed": True},
        "moodTimeline": [
            {"slot": "Morning", "mood": "happy"},
            {"slot": "Midday", "mood": "neutral"},
            {"slot": "After Lunch", "mood": "happy"},
            {"slot": "End of Day", "mood": "tired"},
        ],
        "physicalActivity": "Active",
        "activityNotes": "Participated in outdoor play and ball games",
        "incidents": "",
        "teacherNotes": notes,
        "submittedBy": "45qodSioggZKyyw72gkPt1vrlFv2",
        "submittedAt": datetime.now(timezone.utc).isoformat(),
    })
print(f"  ✅ Daily care journals seeded for today and yesterday")


print("\n✅ Firestore seeding complete!")
print("\nNext steps:")
print("  1. Go to Firebase Console → Authentication → Users → Add User")
print("     Create accounts for: admin@specialcare360.com, teacher@specialcare360.com,")
print("                          therapist@specialcare360.com, parent@specialcare360.com")
print("     Use password: SpecialCare2026!")
print("  2. The UIDs from Firebase Auth must match the ones in Firestore users collection.")
print("     Update the user documents if the UIDs differ.")
print("  3. Run the frontend: npm run dev")
print("  4. Login with any of the above accounts.")

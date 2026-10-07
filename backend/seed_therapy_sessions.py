"""
seed_therapy_sessions.py — Demo seed script for Dynamic Therapy Timeline.

Adds 5-8 example therapy sessions covering:
- Speech Therapy
- Physiotherapy
- Behavioral Therapy
- Special Education
- Tele-Therapy
- Completed session
- Cancelled session

Run from the backend directory:
    python seed_therapy_sessions.py
"""

import sys
import os
from datetime import datetime, timedelta, timezone

# Bootstrap Firebase
sys.path.insert(0, os.path.dirname(__file__))
from firebase_admin_init import init_firebase, get_db

init_firebase()
db = get_db()

print("Seeding Dynamic Therapy Timeline sessions for Special Care 360...\n")

CENTER_ID = "center-001"
THERAPIST_ID = "cxcgtI5tqmdwxhoW7sK3C96q6sw2"
THERAPIST_NAME = "Dr. Zara Ahmed"
ADMIN_ID = "OUsJTDmRYtd1EUK9Ywsr36gz50t2"
PARENT_ID = "SypFxQwk4NZ95lAh9aznOu4Zk2G3"

# Calculate dynamic dates relative to today
today = datetime.now(timezone.utc).date()
d_minus_2 = today - timedelta(days=2)
d_minus_1 = today - timedelta(days=1)
d_today = today
d_plus_1 = today + timedelta(days=1)
d_plus_2 = today + timedelta(days=2)
d_plus_3 = today + timedelta(days=3)
d_plus_4 = today + timedelta(days=4)

SESSIONS = [
    {
        "id": "session-demo-001",
        "centerId": CENTER_ID,
        "studentId": "student-001",
        "studentName": "Ahmed Hassan",
        "therapistId": THERAPIST_ID,
        "therapistName": THERAPIST_NAME,
        "therapyType": "Speech Therapy",
        "date": d_today.strftime("%Y-%m-%d"),
        "startTime": "09:00",
        "endTime": "10:00",
        "location": "Room 201 - Speech Lab",
        "sessionType": "In-Person",
        "notes": "Targeting articulation of /r/ sounds and multi-word sentence formation.",
        "status": "Scheduled",
        "repeatRule": "weekly",
        "parentId": PARENT_ID,
        "teletherapySessionId": None,
        "createdBy": THERAPIST_ID,
    },
    {
        "id": "session-demo-002",
        "centerId": CENTER_ID,
        "studentId": "student-002",
        "studentName": "Sara Ahmed",
        "therapistId": THERAPIST_ID,
        "therapistName": THERAPIST_NAME,
        "therapyType": "Physiotherapy",
        "date": d_today.strftime("%Y-%m-%d"),
        "startTime": "10:30",
        "endTime": "11:30",
        "location": "Physical Therapy Gym",
        "sessionType": "In-Person",
        "notes": "Balance board exercises, core strengthening, and gait training.",
        "status": "Scheduled",
        "repeatRule": "none",
        "parentId": None,
        "teletherapySessionId": None,
        "createdBy": THERAPIST_ID,
    },
    {
        "id": "session-demo-003",
        "centerId": CENTER_ID,
        "studentId": "student-001",
        "studentName": "Ahmed Hassan",
        "therapistId": THERAPIST_ID,
        "therapistName": THERAPIST_NAME,
        "therapyType": "Behavioral Therapy",
        "date": d_plus_1.strftime("%Y-%m-%d"),
        "startTime": "11:00",
        "endTime": "12:00",
        "location": "Sensory & ABA Suite",
        "sessionType": "Tele-Therapy",
        "notes": "Positive reinforcement conditioning and emotional regulation practice.",
        "status": "Scheduled",
        "repeatRule": "weekly",
        "parentId": PARENT_ID,
        "teletherapySessionId": "tele-demo-room-001",
        "createdBy": THERAPIST_ID,
    },
    {
        "id": "session-demo-004",
        "centerId": CENTER_ID,
        "studentId": "student-003",
        "studentName": "Omar Malik",
        "therapistId": THERAPIST_ID,
        "therapistName": THERAPIST_NAME,
        "therapyType": "Special Education",
        "date": d_plus_2.strftime("%Y-%m-%d"),
        "startTime": "14:00",
        "endTime": "15:00",
        "location": "Learning Resource Center",
        "sessionType": "In-Person",
        "notes": "Math cognition and visual-spatial puzzle solving.",
        "status": "Scheduled",
        "repeatRule": "daily",
        "parentId": None,
        "teletherapySessionId": None,
        "createdBy": ADMIN_ID,
    },
    {
        "id": "session-demo-005",
        "centerId": CENTER_ID,
        "studentId": "student-004",
        "studentName": "Zara Khan",
        "therapistId": THERAPIST_ID,
        "therapistName": THERAPIST_NAME,
        "therapyType": "Occupational Therapy",
        "date": d_plus_3.strftime("%Y-%m-%d"),
        "startTime": "09:30",
        "endTime": "10:30",
        "location": "Home Visit",
        "sessionType": "Home Session",
        "notes": "Fine motor grip coordination and assistive eating utensils training.",
        "status": "Scheduled",
        "repeatRule": "biweekly",
        "parentId": None,
        "teletherapySessionId": None,
        "createdBy": THERAPIST_ID,
    },
    {
        "id": "session-demo-006",
        "centerId": CENTER_ID,
        "studentId": "student-001",
        "studentName": "Ahmed Hassan",
        "therapistId": THERAPIST_ID,
        "therapistName": THERAPIST_NAME,
        "therapyType": "Speech Therapy",
        "date": d_minus_2.strftime("%Y-%m-%d"),
        "startTime": "09:00",
        "endTime": "10:00",
        "location": "Room 201 - Speech Lab",
        "sessionType": "In-Person",
        "notes": "Mastered 4 new visual prompt flashcards. Great engagement throughout.",
        "status": "Completed",
        "repeatRule": "weekly",
        "parentId": PARENT_ID,
        "teletherapySessionId": None,
        "createdBy": THERAPIST_ID,
    },
    {
        "id": "session-demo-007",
        "centerId": CENTER_ID,
        "studentId": "student-002",
        "studentName": "Sara Ahmed",
        "therapistId": THERAPIST_ID,
        "therapistName": THERAPIST_NAME,
        "therapyType": "Psychology Session",
        "date": d_minus_1.strftime("%Y-%m-%d"),
        "startTime": "13:00",
        "endTime": "14:00",
        "location": "Counseling Office",
        "sessionType": "In-Person",
        "notes": "Session cancelled due to student mild fever. Rescheduled for next week.",
        "status": "Cancelled",
        "repeatRule": "none",
        "parentId": None,
        "teletherapySessionId": None,
        "createdBy": THERAPIST_ID,
    },
]

for s in SESSIONS:
    # Compute startDateTime and endDateTime
    st = s["startTime"]
    et = s["endTime"]
    d = s["date"]
    start_dt = datetime.strptime(f"{d} {st}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
    end_dt = datetime.strptime(f"{d} {et}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
    duration_min = int((end_dt - start_dt).total_seconds() // 60)

    doc_data = {
        **s,
        "startDateTime": start_dt.isoformat(),
        "endDateTime": end_dt.isoformat(),
        "title": f"{s['therapyType']} - {s['studentName']}",
        "scheduledAt": start_dt.isoformat(),
        "durationMinutes": duration_min,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    db.collection("therapySessions").document(s["id"]).set(doc_data)
    print(f"  Session: {s['therapyType']} for {s['studentName']} ({s['date']} {s['startTime']}-{s['endTime']}) -> {s['status']}")

print("\nFinished seeding therapy timeline sessions.")

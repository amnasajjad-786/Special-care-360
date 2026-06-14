import sys
import os
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from firebase_admin_init import init_firebase, get_db

init_firebase()
db = get_db()

today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

for date, notes in [(today, "Sara was very cheerful today and played well with others!"),
                    (yesterday, "Sara focused nicely on her fine motor tasks, but refused lunch.")]:
    doc_id = f"{date}_student-002"
    db.collection("dailyCareJournals").document(doc_id).set({
        "studentId": "student-002",
        "date": date,
        "meals": {
            "breakfast": {"ate": "fully", "notes": "Ate all her eggs"},
            "lunch": {"ate": "none", "notes": "Not hungry today"},
            "snack": {"ate": "partially", "notes": "Ate a few apple slices"},
        },
        "hygiene": {"teethBrushed": True, "handsWashed": True, "diaperAssisted": False, "hairCombed": True},
        "moodTimeline": [
            {"slot": "Morning", "mood": "happy"},
            {"slot": "Midday", "mood": "happy"},
            {"slot": "After Lunch", "mood": "neutral"},
            {"slot": "End of Day", "mood": "happy"},
        ],
        "physicalActivity": "Moderate",
        "activityNotes": "Enjoyed the sensory bin and some light stretching.",
        "incidents": "",
        "teacherNotes": notes,
        "submittedBy": "45qodSioggZKyyw72gkPt1vrlFv2",
        "submittedAt": datetime.now(timezone.utc).isoformat(),
    })

print("✅ Daily care journals seeded for Sara Ahmed (student-002) for today and yesterday!")

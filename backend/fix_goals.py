import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from firebase_admin_init import init_firebase, get_db

init_firebase()
db = get_db()

GOALS = [
    {"id": "g1", "title": "Improve verbal communication", "status": "In Progress", "progressPercent": 60},
    {"id": "g2", "title": "Independent dressing", "status": "Mastered", "progressPercent": 100},
    {"id": "g3", "title": "Social interaction with peers", "status": "In Progress", "progressPercent": 35},
    {"id": "g4", "title": "Following 2-step instructions", "status": "Regressed", "progressPercent": 20},
    {"id": "g5", "title": "Fine motor skills development", "status": "Not Started", "progressPercent": 0},
    {"id": "g6", "title": "Emotional regulation strategies", "status": "In Progress", "progressPercent": 40},
]

print("Populating goals for ALL students in the database...")
students = db.collection("students").stream()
count = 0
for s in students:
    db.collection("students").document(s.id).collection("carePlan").document("main").set({"goals": GOALS})
    print(f"  ✅ Goals populated for student ID: {s.id}")
    count += 1

print(f"\n✅ Finished populating goals for {count} students!")

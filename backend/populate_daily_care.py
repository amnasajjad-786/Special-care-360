import sys
import os
import random
from datetime import datetime, timezone, timedelta

# Bootstrap Firebase
sys.path.insert(0, os.path.dirname(__file__))
from firebase_admin_init import init_firebase, get_db

init_firebase()
db = get_db()

print("Seeding daily care journals for all students (15 days)...")

# Get all students
students_ref = db.collection("students")
students = list(students_ref.stream())

if not students:
    print("No students found in the database. Please run seed_firestore.py first.")
    sys.exit(1)

# Configuration options for realistic seed data
MEALS = ["breakfast", "lunch", "snack"]
MEAL_STATES = ["fully", "partially", "refused"]
MEAL_NOTES = {
    "breakfast": ["Ate all oatmeal", "Liked the apple sauce", "Refused cereal, preferred banana", "Drank whole milk bottle"],
    "lunch": ["Ate chicken and rice", "Enjoyed pasta and vegetables", "Only ate carrots, refused nuggets", "Finished potato soup"],
    "snack": ["Enjoyed apple slices", "Finished juice box", "Shared snack with peer", "Ate crackers and cheese"]
}

MOODS = ["happy", "neutral", "sad", "agitated", "tired"]
MOOD_SLOTS = ["Morning", "Midday", "After Lunch", "End of Day"]
ACTIVITIES = ["Active", "Moderate", "Low", "Bed Rest"]
ACTIVITY_NOTES = [
    "Participated in outdoor play and ball games",
    "Did indoor building blocks activity",
    "Engaged in sensory sand play",
    "Did soft mat stretching exercises",
    "Enjoyed swing and sliding board",
    "Completed physical therapy floor routines"
]

OBSERVATIONS = [
    "Had a wonderful, engaged day! Cooperated during circle time.",
    "Began restless but settled down nicely after morning snack.",
    "Showed great verbal interest in story reading today.",
    "Very helpful in picking up toys at cleanup time.",
    "Was calm and cooperative during speech therapy session.",
    "Exhibited minor agitation during transitions but calmed down with reassurance.",
    "A bit sleepy in the afternoon, took a short nap.",
    "Highly active and enthusiastic during music play."
]

INCIDENTS = [
    "", "", "", "", # Mostly blank
    "Minor transition meltdown when switching to physical therapy.",
    "Threw plastic cup on floor during lunch, redirected successfully.",
    "Exhibited brief rocking behavior when intercom announcement played."
]

journals_seeded = 0

# Seed 15 days of data for each student
for student in students:
    student_id = student.id
    student_name = student.to_dict().get("name", "Student")
    print(f"Seeding journals for: {student_name} ({student_id})")
    
    # Loop over the past 15 days
    for day_offset in range(15):
        date_obj = datetime.now(timezone.utc) - timedelta(days=day_offset)
        date_str = date_obj.strftime("%Y-%m-%d")
        
        # Unique doc ID
        doc_id = f"{date_str}_{student_id}"
        
        # Construct random, realistic entry
        journal_data = {
            "studentId": student_id,
            "date": date_str,
            "meals": {
                meal: {
                    "ate": random.choice(MEAL_STATES),
                    "notes": random.choice(MEAL_NOTES[meal])
                } for meal in MEALS
            },
            "hygiene": {
                "teethBrushed": random.choice([True, False]),
                "handsWashed": random.choice([True, True, False]), # More likely to be True
                "diaperAssisted": random.choice([True, False]),
                "hairCombed": random.choice([True, False])
            },
            "moodTimeline": [
                {"slot": slot, "mood": random.choice(MOODS)} for slot in MOOD_SLOTS
            ],
            "physicalActivity": random.choice(ACTIVITIES),
            "activityNotes": random.choice(ACTIVITY_NOTES),
            "incidents": random.choice(INCIDENTS),
            "teacherNotes": random.choice(OBSERVATIONS),
            "submittedBy": "45qodSioggZKyyw72gkPt1vrlFv2", # Ms. Fatima Khan (Teacher ID)
            "submittedAt": datetime.now(timezone.utc).isoformat()
        }
        
        # Write to firestore
        db.collection("dailyCareJournals").document(doc_id).set(journal_data)
        journals_seeded += 1

print(f"\nFirestore seeding completed! Generated {journals_seeded} daily care journals.")

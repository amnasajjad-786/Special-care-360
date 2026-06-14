import sys
import os
import random
import uuid
from datetime import datetime, timezone, timedelta

# Bootstrap Firebase
sys.path.insert(0, os.path.dirname(__file__))
from firebase_admin_init import init_firebase, get_db

init_firebase()
db = get_db()

print("Seeding 15 Days of Realistic ABC Incidents for ALL Students in Firestore...\n")

# Incident templates based on diagnosis category
TEMPLATES = {
    "autism": [
        {
            "antecedent": {"text": "Loud music in classroom", "tags": ["Loud Noise"]},
            "behavior": {"text": "Covered ears and started screaming", "tags": ["Screaming"]},
            "consequence": {"text": "Moved to a quiet corner with noise-canceling headphones", "tags": ["Redirected"]},
            "severity": 3, "durationMinutes": 8, "location": "Classroom A"
        },
        {
            "antecedent": {"text": "Transitioning to playground without warning", "tags": ["Transition", "Unexpected Change"]},
            "behavior": {"text": "Threw materials and sat on floor refusing to move", "tags": ["Hitting", "Screaming"]},
            "consequence": {"text": "Offered visual schedule and calmed down with verbal support", "tags": ["Verbal Prompt"]},
            "severity": 4, "durationMinutes": 12, "location": "Classroom A"
        },
        {
            "antecedent": {"text": "Crowded and noisy cafeteria during lunch", "tags": ["Crowded Space"]},
            "behavior": {"text": "Hand-flapping and crying loudly", "tags": ["Screaming", "Crying"]},
            "consequence": {"text": "Guided to a calmer seating area near the window", "tags": ["Redirected"]},
            "severity": 3, "durationMinutes": 10, "location": "Cafeteria"
        },
        {
            "antecedent": {"text": "Denied request to play with iPad", "tags": ["Denied Request"]},
            "behavior": {"text": "Hitting desk and vocal screaming", "tags": ["Hitting", "Screaming"]},
            "consequence": {"text": "Ignored the hitting, prompted to use communication board to ask nicely", "tags": ["Ignored", "Redirected"]},
            "severity": 4, "durationMinutes": 6, "location": "Therapy Room"
        },
        {
            "antecedent": {"text": "Bright fluorescent lights flickering", "tags": ["Sensory Overload"]},
            "behavior": {"text": "Hiding under the table, rocking", "tags": ["Withdrawal"]},
            "consequence": {"text": "Dimmed classroom lights, allowed to stay under table for a break", "tags": ["Redirected"]},
            "severity": 2, "durationMinutes": 15, "location": "Classroom A"
        }
    ],
    "adhd": [
        {
            "antecedent": {"text": "Writing task exceeding 10 minutes", "tags": ["Long Task", "Academic Frustration"]},
            "behavior": {"text": "Left seat, wandered around class, talked to peers", "tags": ["Out of Seat"]},
            "consequence": {"text": "Given a brief movement break, then returned to task", "tags": ["Break Given"]},
            "severity": 2, "durationMinutes": 5, "location": "Classroom B"
        },
        {
            "antecedent": {"text": "Waiting in line for lunch", "tags": ["Waiting", "Transition"]},
            "behavior": {"text": "Pushed peer to get ahead, shouting", "tags": ["Hitting", "Screaming"]},
            "consequence": {"text": "Verbal correction, asked to step back and wait calmly", "tags": ["Verbal Prompt"]},
            "severity": 3, "durationMinutes": 4, "location": "Cafeteria"
        },
        {
            "antecedent": {"text": "Seated near window with outdoor distractions", "tags": ["Distraction"]},
            "behavior": {"text": "Tapping pencil loudly, refusing to start worksheet", "tags": ["Task Avoidance"]},
            "consequence": {"text": "Redirected focus, seating adjusted away from window", "tags": ["Redirected"]},
            "severity": 2, "durationMinutes": 8, "location": "Classroom B"
        },
        {
            "antecedent": {"text": "Peer playing with a preferred puzzle", "tags": ["Peer Conflict"]},
            "behavior": {"text": "Snatched puzzle piece, yelled when peer resisted", "tags": ["Hitting", "Screaming"]},
            "consequence": {"text": "Puzzle removed, prompted to ask for turn with visual card", "tags": ["Verbal Prompt", "Redirected"]},
            "severity": 3, "durationMinutes": 7, "location": "Playground"
        },
        {
            "antecedent": {"text": "Direct verbal correction by teacher", "tags": ["Correction"]},
            "behavior": {"text": "Folded arms, put head on desk, refused all work", "tags": ["Withdrawal", "Task Avoidance"]},
            "consequence": {"text": "Offered choice of two tasks, given space", "tags": ["Redirected"]},
            "severity": 2, "durationMinutes": 10, "location": "Classroom B"
        }
    ],
    "down syndrome": [
        {
            "antecedent": {"text": "Difficult math coloring worksheet", "tags": ["Academic Frustration", "Difficult Task"]},
            "behavior": {"text": "Slid off chair, sat on floor, refused to get up (flopping)", "tags": ["Task Avoidance"]},
            "consequence": {"text": "Math task broken into smaller steps, given physical assist", "tags": ["Physical Support", "Verbal Prompt"]},
            "severity": 2, "durationMinutes": 12, "location": "Classroom A"
        },
        {
            "antecedent": {"text": "Routine changed: Speech therapy session postponed", "tags": ["Routine Change"]},
            "behavior": {"text": "Crying, refusing to enter classroom", "tags": ["Crying", "Withdrawal"]},
            "consequence": {"text": "Showed updated schedule board, offered comfort toy", "tags": ["Redirected"]},
            "severity": 2, "durationMinutes": 15, "location": "Corridor"
        },
        {
            "antecedent": {"text": "Prompted to clean up toys", "tags": ["Transition"]},
            "behavior": {"text": "Threw toy box, screamed 'No'", "tags": ["Screaming", "Hitting"]},
            "consequence": {"text": "Assisted hand-over-hand to put three toys away, then praised", "tags": ["Physical Support"]},
            "severity": 3, "durationMinutes": 6, "location": "Classroom A"
        },
        {
            "antecedent": {"text": "Physical fatigue during gym activity", "tags": ["Fatigue"]},
            "behavior": {"text": "Lay down on gym mat, refused instructions", "tags": ["Task Avoidance"]},
            "consequence": {"text": "Allowed rest break, offered water", "tags": ["Break Given"]},
            "severity": 1, "durationMinutes": 10, "location": "Gym"
        },
        {
            "antecedent": {"text": "Peer didn't share play-dough tool", "tags": ["Denied Request"]},
            "behavior": {"text": "Pushed peer's arm lightly", "tags": ["Hitting"]},
            "consequence": {"text": "Redirected to a different tool, prompted to share", "tags": ["Redirected"]},
            "severity": 2, "durationMinutes": 3, "location": "Therapy Room"
        }
    ],
    "cerebral palsy": [
        {
            "antecedent": {"text": "Struggling to hold adaptive eating spoon", "tags": ["Physical Frustration"]},
            "behavior": {"text": "Threw spoon, cried and vocalized loudly", "tags": ["Crying", "Screaming"]},
            "consequence": {"text": "Spoon replaced with thicker grip, hand-over-hand help given", "tags": ["Physical Support"]},
            "severity": 3, "durationMinutes": 5, "location": "Cafeteria"
        },
        {
            "antecedent": {"text": "Physical fatigue after 15 minutes of standing frame", "tags": ["Fatigue", "Physical Effort"]},
            "behavior": {"text": "Whining, muscle tensing, resisting posture support", "tags": ["Withdrawal"]},
            "consequence": {"text": "Removed from standing frame, shifted to wheelchair for rest", "tags": ["Break Given"]},
            "severity": 2, "durationMinutes": 8, "location": "Therapy Room"
        },
        {
            "antecedent": {"text": "Noisy, crowded sensory room", "tags": ["Sensory Overload"]},
            "behavior": {"text": "Increased spasticity, crying, tensing limbs", "tags": ["Crying"]},
            "consequence": {"text": "Moved to a quiet, dim classroom for calming music", "tags": ["Redirected"]},
            "severity": 3, "durationMinutes": 12, "location": "Therapy Room"
        },
        {
            "antecedent": {"text": "Prompted to transition to wheelchair after play", "tags": ["Transition"]},
            "behavior": {"text": "Stiffened body, refused to bend knees to sit", "tags": ["Task Avoidance"]},
            "consequence": {"text": "Given verbal warnings (1-min warning), allowed to hold toy", "tags": ["Verbal Prompt"]},
            "severity": 2, "durationMinutes": 7, "location": "Playground"
        },
        {
            "antecedent": {"text": "Unable to complete puzzle due to coordination slip", "tags": ["Physical Frustration"]},
            "behavior": {"text": "Vocal screeching, pushing puzzle board away", "tags": ["Screaming"]},
            "consequence": {"text": "Assisted with placement of next piece, verbally encouraged", "tags": ["Physical Support", "Verbal Prompt"]},
            "severity": 3, "durationMinutes": 4, "location": "Classroom B"
        }
    ]
}

# Clear existing incidents first to avoid duplicate clogging
print("Clearing existing ABC incidents...")
docs = db.collection("abcIncidents").stream()
count_deleted = 0
for doc in docs:
    doc.reference.delete()
    count_deleted += 1
print(f"Deleted {count_deleted} old incidents.\n")

# Seeding 15 days of data
today = datetime.now(timezone.utc)
seeded_count = 0

# Fetch all students dynamically
students_snap = db.collection("students").stream()
students_list = []
for s in students_snap:
    s_data = s.to_dict()
    s_data["id"] = s.id
    students_list.append(s_data)

print(f"Found {len(students_list)} students in Firestore. Generating incidents...")

for s in students_list:
    student_id = s["id"]
    student_name = s.get("name", "Unknown")
    diagnosis = s.get("diagnosis", "").lower().strip()
    center_id = s.get("centerId", "center-001")
    
    # Map diagnosis to category templates
    category = "autism" # Default fallback
    if "adhd" in diagnosis:
        category = "adhd"
    elif "down" in diagnosis:
        category = "down syndrome"
    elif "palsy" in diagnosis or "cerebral" in diagnosis:
        category = "cerebral palsy"
    elif "asd" in diagnosis or "autis" in diagnosis:
        category = "autism"
        
    print(f"Generating incidents for {student_name} (ID: {student_id}, Diagnosis Category: {category})...")
    
    # We will pick random days within the last 15 days to place incidents
    # Let's seed between 12 and 18 incidents per student over the 15 days
    num_incidents = random.randint(12, 18)
    incident_days = random.sample(range(0, 16), min(num_incidents, 16))
    
    for day_offset in incident_days:
        # Pick a random template incident for this diagnosis
        template = random.choice(TEMPLATES[category])
        
        # Calculate random timestamp for that day during school hours (9:00 AM - 3:00 PM)
        incident_date = today - timedelta(days=day_offset)
        hour = random.randint(9, 14)
        minute = random.randint(0, 59)
        second = random.randint(0, 59)
        
        dt = datetime(
            year=incident_date.year,
            month=incident_date.month,
            day=incident_date.day,
            hour=hour,
            minute=minute,
            second=second,
            tzinfo=timezone.utc
        )
        
        date_str = dt.strftime("%Y-%m-%d")
        time_str = dt.strftime("%I:%M %p")
        
        inc_id = str(uuid.uuid4())
        
        # Build the final incident dict
        incident = {
            "id": inc_id,
            "studentId": student_id,
            "centerId": center_id,
            "loggedBy": "45qodSioggZKyyw72gkPt1vrlFv2", # Ms. Fatima Khan (Teacher)
            "timestamp": dt.isoformat(),
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "date": date_str,
            "time": time_str,
            "location": template["location"],
            "severity": template["severity"] + random.choice([-1, 0, 1]) if template["severity"] in [2,3,4] else template["severity"],
            "durationMinutes": max(2, template["durationMinutes"] + random.randint(-3, 3)),
            "antecedent": {
                "text": template["antecedent"]["text"],
                "tags": template["antecedent"]["tags"]
            },
            "behavior": {
                "text": template["behavior"]["text"],
                "tags": template["behavior"]["tags"]
            },
            "consequence": {
                "text": template["consequence"]["text"],
                "tags": template["consequence"]["tags"]
            },
            "antecedentNotes": "Incident observed during daily class routine." if random.random() > 0.5 else "None",
            "consequenceNotes": "Staff handled transition protocol." if random.random() > 0.5 else "None"
        }
        
        # Clamp severity between 1 and 5
        incident["severity"] = max(1, min(5, incident["severity"]))
        
        # Save to database
        db.collection("abcIncidents").document(inc_id).set(incident)
        seeded_count += 1

print(f"Seeding complete! Generated {seeded_count} total incidents across {len(students_list)} students covering the last 15 days.")

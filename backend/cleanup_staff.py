import sys
import os

# Bootstrap Firebase
sys.path.insert(0, os.path.dirname(__file__))
from firebase_admin_init import init_firebase, get_db

init_firebase()
db = get_db()

print("Cleaning up duplicate staff members from Firestore...")

staff_ref = db.collection("staff")
docs = staff_ref.stream()

seen_emails = set()
duplicates_deleted = 0

for doc in docs:
    data = doc.to_dict()
    email = data.get("email")
    if not email:
        continue
    
    if email in seen_emails:
        # Delete duplicate document
        staff_ref.document(doc.id).delete()
        duplicates_deleted += 1
        print(f"Deleted duplicate staff: {data.get('name')} ({email})")
    else:
        seen_emails.add(email)

print(f"Cleanup complete! Deleted {duplicates_deleted} duplicate staff records.")

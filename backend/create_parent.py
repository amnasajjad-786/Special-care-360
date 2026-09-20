import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from firebase_admin_init import init_firebase, get_db
from firebase_admin import auth

init_firebase()
db = get_db()

# Credentials come from the environment so no working password is committed.
#   SEED_PARENT_EMAIL=... SEED_PARENT_PASSWORD=... python create_parent.py
email = os.getenv("SEED_PARENT_EMAIL", "sara.ahmed@specialcare360.com")
password = os.getenv("SEED_PARENT_PASSWORD")

if not password:
    print("SEED_PARENT_PASSWORD is not set. Export it before running this script:")
    print('  SEED_PARENT_PASSWORD="<choose-a-password>" python create_parent.py')
    sys.exit(1)

try:
    # Try to create the user in Firebase Auth
    user = auth.create_user(
        email=email,
        password=password,
        display_name="Mr. Ahmed (Sara's Parent)"
    )
    uid = user.uid
    print(f"✅ Created new Firebase Auth user with UID: {uid}")
except Exception as e:
    # If the user already exists, fetch their UID
    print(f"⚠️ Could not create user (might already exist). Error: {e}")
    try:
        user = auth.get_user_by_email(email)
        uid = user.uid
        print(f"✅ Found existing user with UID: {uid}")
    except Exception as e2:
        print(f"❌ Failed to find existing user: {e2}")
        sys.exit(1)

# Create the Firestore user document
user_doc = {
    "uid": uid,
    "name": "Mr. Ahmed (Sara's Parent)",
    "email": email,
    "role": "parent",
    "centerId": "center-001",
    "status": "approved",
}
db.collection("users").document(uid).set(user_doc)
print(f"✅ Created/Updated users collection document for {email}")

# Link to student "Sara Ahmed"
# In the seed data, Sara Ahmed's ID is "student-002"
student_id = "student-002"
db.collection("students").document(student_id).update({
    "parentId": uid
})
print(f"✅ Linked parent UID {uid} to student document {student_id} (Sara Ahmed)")

print("\nSuccess! You can now login with:")
print(f"Email: {email}")
print("Password: (the value you passed in SEED_PARENT_PASSWORD)")

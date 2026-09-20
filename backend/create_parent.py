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

# Look the account up first. The common case is re-running this to repair the
# student link for an account that already exists, and demanding a password to
# do that is pointless friction — it is only needed to create one.
uid = None
try:
    uid = auth.get_user_by_email(email).uid
    print(f"Found existing Firebase Auth user: {uid}")
except Exception:
    if not password:
        print(f"No Firebase Auth user exists for {email}, so one must be created,")
        print("and SEED_PARENT_PASSWORD is not set. Re-run as:")
        print('  SEED_PARENT_PASSWORD="<choose-a-password>" python create_parent.py')
        sys.exit(1)
    try:
        uid = auth.create_user(
            email=email,
            password=password,
            display_name="Mr. Ahmed (Sara's Parent)",
        ).uid
        print(f"Created new Firebase Auth user: {uid}")
    except Exception as err:
        print(f"Failed to create user: {err}")
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
print(f"Created/updated users document for {email}")

# Link to student "Sara Ahmed"
# In the seed data, Sara Ahmed's ID is "student-002"
student_id = "student-002"
db.collection("students").document(student_id).update({
    "parentId": uid
})
print(f"Linked parent {uid} to student {student_id} (Sara Ahmed)")

print("\nSuccess! You can now login with:")
print(f"Email: {email}")
print("Password: (the value you passed in SEED_PARENT_PASSWORD)")

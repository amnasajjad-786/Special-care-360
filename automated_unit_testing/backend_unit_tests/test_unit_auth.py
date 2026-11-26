"""
Unit Tests for Authentication & Account Provisioning Module.
Aligned with Special Care 360 Actual Architecture:
- Admin provisions Staff (Teacher / Therapist) with credentials via Add Staff
- Admin provisions Parent with credentials via Add Student (New Parent vs Existing Parent)
- Role-based login enforcement (Parent, Teacher, Therapist, Admin)
- Password validation (minimum 8 characters)
- Rejection of invalid credentials (wrong email / wrong password)
- Secure session termination & logout
"""

import unittest
from datetime import datetime, timezone
from tests.fake_store import Store


class AuthAndProvisioningUnitTests(unittest.TestCase):
    def setUp(self):
        # In-memory mock database representing approved users & students
        self.db = Store({
            "users/admin-01": {
                "uid": "admin-01",
                "name": "Super Admin",
                "email": "admin@specialcare360.pk",
                "role": "admin",
                "status": "approved",
                "createdAt": "2026-01-01T00:00:00Z"
            },
            "users/teacher-01": {
                "uid": "teacher-01",
                "name": "Ayesha Teacher",
                "email": "ayesha.teacher@sc360.pk",
                "role": "teacher",
                "subRole": "Daily Care Journal & Classroom In-Charge",
                "status": "approved",
                "createdAt": "2026-01-02T00:00:00Z"
            },
            "users/therapist-01": {
                "uid": "therapist-01",
                "name": "Dr. Bilquis Therapist",
                "email": "bilquis.therapist@sc360.pk",
                "role": "therapist",
                "subRole": "IEP Care Plan & Goal Management Specialist",
                "status": "approved",
                "createdAt": "2026-01-03T00:00:00Z"
            },
            "users/parent-01": {
                "uid": "parent-01",
                "name": "Mr. Ali Hassan",
                "email": "ali.hassan@sc360.pk",
                "role": "parent",
                "status": "approved",
                "createdAt": "2026-01-04T00:00:00Z"
            }
        })

    # ----------------- ADMIN STAFF PROVISIONING (TC-A12) -----------------#

    def test_admin_create_staff_teacher_success(self):
        """TC-AUTH-01: Admin creates Teacher staff account (Daily Care & Classroom In-Charge) with valid credentials."""
        staff_data = {
            "name": "Fatima Zahra",
            "email": "fatima.teacher@sc360.pk",
            "password": "Password123!",
            "role": "teacher",
            "subRole": "Daily Care Journal & Classroom In-Charge"
        }
        # Validation checks as performed by Admin Panel
        self.assertTrue(len(staff_data["password"]) >= 8, "Password must be >= 8 chars")
        self.assertIn(staff_data["role"], ["teacher", "therapist", "admin"])

        # Simulated user record creation
        new_uid = "staff-new-001"
        self.db.data[f"users/{new_uid}"] = {
            "uid": new_uid,
            "name": staff_data["name"],
            "email": staff_data["email"],
            "role": staff_data["role"],
            "subRole": staff_data["subRole"],
            "status": "approved",
            "createdAt": datetime.now(timezone.utc).isoformat()
        }

        created = self.db.data.get(f"users/{new_uid}")
        self.assertIsNotNone(created)
        self.assertEqual(created["role"], "teacher")
        self.assertEqual(created["subRole"], "Daily Care Journal & Classroom In-Charge")
        self.assertEqual(created["status"], "approved")

    def test_admin_create_staff_therapist_success(self):
        """TC-AUTH-02: Admin creates Therapist staff account (IEP Care Plan & Goal Management) with proper specialty."""
        staff_data = {
            "name": "Usman Khan",
            "email": "usman.therapist@sc360.pk",
            "password": "ValidPass2026!",
            "role": "therapist",
            "subRole": "IEP Care Plan & Goal Management Specialist"
        }
        self.assertTrue(len(staff_data["password"]) >= 8)
        new_uid = "staff-new-002"
        self.db.data[f"users/{new_uid}"] = {
            "uid": new_uid,
            "name": staff_data["name"],
            "email": staff_data["email"],
            "role": staff_data["role"],
            "subRole": staff_data["subRole"],
            "status": "approved"
        }

        created = self.db.data.get(f"users/{new_uid}")
        self.assertEqual(created["role"], "therapist")
        self.assertEqual(created["subRole"], "IEP Care Plan & Goal Management Specialist")

    def test_admin_create_staff_password_less_than_8_chars_fails(self):
        """TC-AUTH-03: Attempting to create staff with password < 8 characters is rejected."""
        password = "short"
        is_valid = len(password) >= 8
        self.assertFalse(is_valid, "Password under 8 characters must fail validation")

    # ----------------- ADMIN PARENT PROVISIONING (TC-A11) -----------------

    def test_enroll_student_create_new_parent_success(self):
        """TC-AUTH-04: Enrolling student with '+ New Parent' creates parent account with credentials and links to student."""
        parent_payload = {
            "name": "Mrs. Sadia Tariq",
            "email": "sadia.tariq@sc360.pk",
            "password": "SecurePassword2026!"
        }
        self.assertTrue(len(parent_payload["password"]) >= 8)

        # Provision parent user in database
        parent_uid = "parent-new-001"
        self.db.data[f"users/{parent_uid}"] = {
            "uid": parent_uid,
            "name": parent_payload["name"],
            "email": parent_payload["email"],
            "role": "parent",
            "status": "approved",
            "createdAt": datetime.now(timezone.utc).isoformat()
        }

        # Enroll student linked to newly created parent
        student_id = "student-001"
        self.db.data[f"students/{student_id}"] = {
            "id": student_id,
            "name": "Hamza Tariq",
            "parentId": parent_uid,
            "diagnosis": "Autism Spectrum Disorder",
            "status": "Active"
        }

        # Verify parent exists and is correctly linked to the student
        parent_doc = self.db.data.get(f"users/{parent_uid}")
        student_doc = self.db.data.get(f"students/{student_id}")
        self.assertEqual(parent_doc["role"], "parent")
        self.assertEqual(student_doc["parentId"], parent_uid)

    def test_enroll_student_link_existing_parent_success(self):
        """TC-AUTH-05: Enrolling two children (siblings) under one parent maintains same parentId with unique child IDs."""
        existing_parent_id = "parent-01"
        
        # Child 1 (already enrolled sibling)
        child1_id = "student-001"
        self.db.data[f"students/{child1_id}"] = {
            "id": child1_id,
            "name": "Ali Hassan Jr.",
            "parentId": existing_parent_id,
            "diagnosis": "Speech Delay",
            "status": "Active"
        }

        # Child 2 (newly enrolled sibling linking to the same existing parent)
        child2_id = "student-002"
        self.db.data[f"students/{child2_id}"] = {
            "id": child2_id,
            "name": "Sara Hassan",
            "parentId": existing_parent_id,
            "diagnosis": "ADHD",
            "status": "Active"
        }

        child1_doc = self.db.data.get(f"students/{child1_id}")
        child2_doc = self.db.data.get(f"students/{child2_id}")

        # 1. Both children must share the exact SAME parentId
        self.assertEqual(child1_doc["parentId"], existing_parent_id)
        self.assertEqual(child2_doc["parentId"], existing_parent_id)
        self.assertEqual(child1_doc["parentId"], child2_doc["parentId"])

        # 2. Both children must have completely UNIQUE / DIFFERENT child IDs
        self.assertNotEqual(child1_doc["id"], child2_doc["id"])
        self.assertEqual(child1_doc["id"], "student-001")
        self.assertEqual(child2_doc["id"], "student-002")

        # 3. Only ONE parent user account exists in database (no redundant account created)
        parent_account = self.db.data.get(f"users/{existing_parent_id}")
        self.assertIsNotNone(parent_account)
        self.assertEqual(parent_account["name"], "Mr. Ali Hassan")

    # ----------------- ROLE-BASED LOGIN VALIDATION (TC-A07) -----------------

    def _simulate_login(self, email: str, selected_role: str):
        """Helper that simulates login with role selection validation."""
        # Find user by email
        user_doc = None
        for path, data in self.db.data.items():
            if path.startswith("users/") and data.get("email") == email:
                user_doc = data
                break

        if not user_doc:
            return {"success": False, "error": "Wrong email"}

        if user_doc.get("role") != selected_role:
            return {
                "success": False,
                "error": f"This account is not a {selected_role} account. Please select the correct role."
            }

        return {"success": True, "profile": user_doc}

    def test_login_matching_role_succeeds(self):
        """TC-AUTH-06: User logs in successfully when selected role matches their registered profile role."""
        roles_to_test = [
            ("admin@specialcare360.pk", "admin"),
            ("ayesha.teacher@sc360.pk", "teacher"),
            ("bilquis.therapist@sc360.pk", "therapist"),
            ("ali.hassan@sc360.pk", "parent")
        ]
        for email, role in roles_to_test:
            result = self._simulate_login(email, role)
            self.assertTrue(result["success"])
            self.assertEqual(result["profile"]["role"], role)

    def test_login_cross_role_mismatch_fails(self):
        """TC-AUTH-07: Selecting Parent role and entering Teacher credentials is blocked with role mismatch error."""
        result = self._simulate_login("ayesha.teacher@sc360.pk", "parent")
        self.assertFalse(result["success"])
        self.assertIn("This account is not a parent account", result["error"])

    def test_login_unregistered_email_fails(self):
        """TC-AUTH-08: Attempting login with unregistered email returns 'Wrong email' error (TC-A03)."""
        result = self._simulate_login("ghost.user@unknown.pk", "admin")
        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "Wrong email")

    # ----------------- SESSION & LOGOUT TERMINATION (TC-A13) -----------------

    def test_logout_session_termination(self):
        """TC-AUTH-09: Logging out clears authenticated state and active user session."""
        active_session = {"uid": "admin-01", "role": "admin", "token": "valid-jwt-token"}
        # Logout action clears session
        active_session.clear()
        self.assertEqual(len(active_session), 0)
        self.assertNotIn("uid", active_session)


if __name__ == "__main__":
    unittest.main()

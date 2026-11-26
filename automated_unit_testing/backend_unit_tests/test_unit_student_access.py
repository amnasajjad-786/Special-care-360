"""
Unit Tests for Student Access Control and Scope Management (middleware/student_access.py).
Tests include Positive, Negative, and Edge Cases.
"""

import unittest
from fastapi import HTTPException
from middleware.student_access import valid_id, authorize_student_data


class StudentAccessUnitTests(unittest.TestCase):
    def setUp(self):
        self.student = {
            "id": "student-100",
            "name": "Alex Mercer",
            "centerId": "center-001",
            "parentId": "parent-100",
            "teacherId": "teacher-100",
            "teacherIds": ["teacher-100", "teacher-assistant-100"],
            "therapistIds": ["therapist-100", "therapist-speech"],
            "archivedAt": None,
        }

    # ----------------- POSITIVE TEST CASES -----------------

    def test_admin_access_allowed(self):
        """TC-ACCESS-01: Admin belonging to same center has access to student profile."""
        admin = {"uid": "admin-1", "role": "admin", "status": "approved", "centerId": "center-001"}
        try:
            authorize_student_data(admin, self.student)
        except HTTPException:
            self.fail("Admin should be authorized to access student data")

    def test_assigned_parent_access_allowed(self):
        """TC-ACCESS-02: Parent assigned to student has access to their child profile."""
        parent = {"uid": "parent-100", "role": "parent", "status": "approved", "centerId": "center-001"}
        try:
            authorize_student_data(parent, self.student)
        except HTTPException:
            self.fail("Assigned parent should be authorized to access their child's data")

    def test_assigned_primary_teacher_access_allowed(self):
        """TC-ACCESS-03: Primary assigned teacher has access to student profile."""
        teacher = {"uid": "teacher-100", "role": "teacher", "status": "approved", "centerId": "center-001"}
        try:
            authorize_student_data(teacher, self.student)
        except HTTPException:
            self.fail("Primary assigned teacher should be authorized")

    def test_assigned_co_teacher_in_list_allowed(self):
        """TC-ACCESS-04: Co-teacher in teacherIds list has access to student profile."""
        co_teacher = {"uid": "teacher-assistant-100", "role": "teacher", "status": "approved", "centerId": "center-001"}
        try:
            authorize_student_data(co_teacher, self.student)
        except HTTPException:
            self.fail("Co-teacher in teacherIds list should be authorized")

    def test_assigned_therapist_access_allowed(self):
        """TC-ACCESS-05: Assigned clinical therapist has access to student profile."""
        therapist = {"uid": "therapist-100", "role": "therapist", "status": "approved", "centerId": "center-001"}
        try:
            authorize_student_data(therapist, self.student)
        except HTTPException:
            self.fail("Assigned therapist should be authorized")

    # ----------------- NEGATIVE TEST CASES -----------------

    def test_unassigned_parent_denied(self):
        """TC-ACCESS-06: Parent not assigned to student must be denied with 403 Forbidden."""
        unrelated_parent = {"uid": "parent-other", "role": "parent", "status": "approved", "centerId": "center-001"}
        with self.assertRaises(HTTPException) as cm:
            authorize_student_data(unrelated_parent, self.student)
        self.assertEqual(cm.exception.status_code, 403)
        self.assertEqual(cm.exception.detail, "Student access denied")

    def test_unassigned_therapist_denied(self):
        """TC-ACCESS-07: Therapist not assigned to student must be denied with 403 Forbidden."""
        unassigned_therapist = {"uid": "therapist-unassigned", "role": "therapist", "status": "approved", "centerId": "center-001"}
        with self.assertRaises(HTTPException) as cm:
            authorize_student_data(unassigned_therapist, self.student)
        self.assertEqual(cm.exception.status_code, 403)

    def test_unassigned_teacher_denied(self):
        """TC-ACCESS-14: Teacher in the same centre but not assigned is denied (BUG-01 regression)."""
        other_teacher = {"uid": "teacher-other", "role": "teacher", "status": "approved", "centerId": "center-001"}
        with self.assertRaises(HTTPException) as cm:
            authorize_student_data(other_teacher, self.student)
        self.assertEqual(cm.exception.status_code, 403)

    def test_linked_caregiver_allowed_unlinked_denied(self):
        """TC-ACCESS-15: Caregiver sees only a child an admin linked them to via caregiverIds."""
        student = dict(self.student, caregiverIds=["caregiver-1"])
        linked = {"uid": "caregiver-1", "role": "caregiver", "status": "approved", "centerId": "center-001"}
        authorize_student_data(linked, student)
        with self.assertRaises(HTTPException) as cm:
            authorize_student_data(dict(linked, uid="caregiver-2"), student)
        self.assertEqual(cm.exception.status_code, 403)

    def test_unapproved_account_denied(self):
        """TC-ACCESS-08: Pending or unapproved user must be denied access with 403 Forbidden."""
        pending_teacher = {"uid": "teacher-100", "role": "teacher", "status": "pending", "centerId": "center-001"}
        with self.assertRaises(HTTPException) as cm:
            authorize_student_data(pending_teacher, self.student)
        self.assertEqual(cm.exception.status_code, 403)

    def test_different_center_access_denied(self):
        """TC-ACCESS-09: User from another center cannot access student (403 Forbidden)."""
        foreign_admin = {"uid": "admin-foreign", "role": "admin", "status": "approved", "centerId": "center-999"}
        with self.assertRaises(HTTPException) as cm:
            authorize_student_data(foreign_admin, self.student)
        self.assertEqual(cm.exception.status_code, 403)

    def test_archived_student_access_denied(self):
        """TC-ACCESS-10: Access to archived student is blocked (403 Forbidden)."""
        archived_student = dict(self.student)
        archived_student["archivedAt"] = "2026-01-01T00:00:00Z"
        admin = {"uid": "admin-1", "role": "admin", "status": "approved", "centerId": "center-001"}
        with self.assertRaises(HTTPException) as cm:
            authorize_student_data(admin, archived_student)
        self.assertEqual(cm.exception.status_code, 403)

    # ----------------- EDGE CASES -----------------

    def test_valid_id_accepts_clean_alphanumeric_and_dash(self):
        """TC-ACCESS-11: valid_id helper accepts clean string identifiers."""
        self.assertEqual(valid_id("valid-id-123_abc"), "valid-id-123_abc")

    def test_valid_id_rejects_empty_or_whitespace(self):
        """TC-ACCESS-12: valid_id helper rejects empty or whitespace-only strings."""
        for bad in ["", "   ", None, 12345]:
            with self.assertRaises(HTTPException) as cm:
                valid_id(bad)
            self.assertEqual(cm.exception.status_code, 400)

    def test_valid_id_rejects_path_traversal_and_slashes(self):
        """TC-ACCESS-13: valid_id helper rejects forward slashes and long identifiers."""
        with self.assertRaises(HTTPException):
            valid_id("../etc/secret")
        with self.assertRaises(HTTPException):
            valid_id("collection/doc")
        with self.assertRaises(HTTPException):
            valid_id("a" * 150)


if __name__ == "__main__":
    unittest.main()

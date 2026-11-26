"""Caregiver role: sees only children an admin linked them to."""
import unittest

from fastapi import HTTPException

from middleware.student_access import authorize_student_data


def caregiver(uid="cg-1"):
    return {"uid": uid, "role": "caregiver", "status": "approved", "centerId": "center-9"}


STUDENT = {"centerId": "center-9", "parentId": "p-1", "teacherId": "t-1", "therapistIds": [], "caregiverIds": ["cg-1"]}


class CaregiverAccessTests(unittest.TestCase):
    def test_linked_caregiver_is_allowed(self):
        authorize_student_data(caregiver(), dict(STUDENT))

    def test_unlinked_caregiver_is_denied(self):
        with self.assertRaises(HTTPException) as caught:
            authorize_student_data(caregiver("cg-2"), dict(STUDENT))
        self.assertEqual(caught.exception.status_code, 403)

    def test_student_without_caregivers_denies(self):
        student = {k: v for k, v in STUDENT.items() if k != "caregiverIds"}
        with self.assertRaises(HTTPException):
            authorize_student_data(caregiver(), student)

    def test_caregiver_cannot_borrow_parent_link(self):
        student = dict(STUDENT, caregiverIds=[], parentId="cg-1")
        with self.assertRaises(HTTPException):
            authorize_student_data(caregiver(), student)


if __name__ == "__main__":
    unittest.main()

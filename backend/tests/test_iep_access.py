import unittest

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from middleware.auth_middleware import get_current_user
from routers.ai_insights import authorize_iep_student, router as ai_router


app = FastAPI()
app.include_router(ai_router)
client = TestClient(app)


class IEPAccessTests(unittest.TestCase):
    def setUp(self):
        self.student = {
            "centerId": "center-001",
            "therapistIds": ["therapist-1"],
        }
        self.therapist = {
            "uid": "therapist-1",
            "role": "therapist",
            "status": "approved",
            "centerId": "center-001",
        }

    def test_assigned_therapist_can_access_student(self):
        authorize_iep_student(self.therapist, self.student)

    def test_unassigned_therapist_is_denied(self):
        user = {**self.therapist, "uid": "therapist-2"}
        with self.assertRaises(HTTPException) as raised:
            authorize_iep_student(user, self.student)
        self.assertEqual(raised.exception.status_code, 403)

    def test_unapproved_account_is_denied(self):
        user = {**self.therapist, "status": "pending"}
        with self.assertRaises(HTTPException) as raised:
            authorize_iep_student(user, self.student)
        self.assertEqual(raised.exception.status_code, 403)

    def test_cross_center_access_is_denied(self):
        user = {**self.therapist, "centerId": "center-002"}
        with self.assertRaises(HTTPException) as raised:
            authorize_iep_student(user, self.student)
        self.assertEqual(raised.exception.status_code, 403)

    def test_approved_admin_can_access_center_student(self):
        admin = {
            "uid": "admin-1",
            "role": "admin",
            "status": "approved",
            "centerId": "center-001",
        }
        authorize_iep_student(admin, self.student)

    def test_iep_endpoint_rejects_missing_authentication(self):
        response = client.post("/ai-insights/iep/student-1")
        self.assertEqual(response.status_code, 401)

    def test_next_goal_endpoint_rejects_missing_authentication(self):
        response = client.post(
            "/ai-insights/iep/student-1/next-goal",
            json={"achieved_goal": {}},
        )
        self.assertEqual(response.status_code, 401)

    def test_iep_endpoint_rejects_parent_role_before_loading_student(self):
        app.dependency_overrides[get_current_user] = lambda: {
            "uid": "parent-1",
            "role": "parent",
            "status": "approved",
            "centerId": "center-001",
        }
        try:
            response = client.post("/ai-insights/iep/student-1")
        finally:
            app.dependency_overrides.clear()
        self.assertEqual(response.status_code, 403)

    def test_next_goal_endpoint_rejects_parent_role_before_loading_student(self):
        app.dependency_overrides[get_current_user] = lambda: {
            "uid": "parent-1",
            "role": "parent",
            "status": "approved",
            "centerId": "center-001",
        }
        try:
            response = client.post(
                "/ai-insights/iep/student-1/next-goal",
                json={"achieved_goal": {}},
            )
        finally:
            app.dependency_overrides.clear()
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()

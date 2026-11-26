"""
TC-PANIC-01 to TC-PANIC-09
Automated unit tests for routers/panic.py
"""
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from models.schemas import PanicAlertCreate, PanicAlertResolve
from routers.panic import create_panic_alert, list_alerts, resolve_alert
from tests.fake_store import Store


class PanicAlertUnitTests(unittest.TestCase):
    def setUp(self):
        self.store = Store()
        # Seed a student
        self.store.collection("students").document("student-p1").set({
            "id": "student-p1",
            "name": "Tommy Lee",
            "centerId": "center-alpha",
            "status": "active",
            "parentId": "parent-p1",
            "teacherIds": ["teacher-t1"],
            "therapistIds": [],
        })
        # Seed an existing panic alert (reporter: teacher-t1)
        self.store.collection("panicAlerts").document("alert-001").set({
            "id": "alert-001",
            "studentId": "student-p1",
            "centerId": "center-alpha",
            "reportedBy": {"uid": "teacher-t1", "name": "Ms. Alice"},
            "emergencyType": "medical",
            "description": "Seizure episode",
            "location": "Room 101",
            "timestamp": "2026-11-20T10:00:00+00:00",
            "status": "active",
            "deliveryStatus": "delivered",
            "resolvedAt": None,
            "resolvedBy": None,
        })

    # ─────────────────────────── helpers ────────────────────────────
    def _make_body(self, **overrides):
        """Build a valid PanicAlertCreate instance with sensible defaults."""
        defaults = {
            "studentId": "student-p1",
            "reportedBy": {"uid": "teacher-t1", "name": "Ms. Alice"},
            "emergencyType": "medical",
            "description": "Child having a breathing episode",
            "location": "Playground",
        }
        defaults.update(overrides)
        return PanicAlertCreate(**defaults)

    def _teacher_user(self, uid="teacher-t1", centerId="center-alpha"):
        return {"uid": uid, "role": "teacher", "centerId": centerId, "status": "approved"}

    def _admin_user(self, uid="admin-1", centerId="center-alpha"):
        return {"uid": uid, "role": "admin", "centerId": centerId, "status": "approved"}

    def _parent_user(self, uid="parent-p1", centerId="center-alpha"):
        return {"uid": uid, "role": "parent", "centerId": centerId, "status": "approved"}

    # ─────────────────── TC-PANIC-01: success path ──────────────────
    @patch("routers.panic.get_db")
    @patch("routers.panic.dispatch_alert")
    def test_create_panic_alert_authorized_teacher_success(self, mock_dispatch, mock_get_db):
        """TC-PANIC-01: Authorized teacher triggers alert → 200 with deliveryStatus 'delivered'."""
        mock_get_db.return_value = self.store
        mock_dispatch.return_value = {
            "deliveryStatus": "delivered",
            "staffNotified": 3,
            "deliveryLatencyMs": 142,
        }
        body = self._make_body()
        res = create_panic_alert(body, self._teacher_user())
        self.assertEqual(res["deliveryStatus"], "delivered")
        self.assertEqual(res["staffNotified"], 3)
        self.assertIn("delivered", res["message"])

    # ─────────────────── TC-PANIC-02: role enforcement ──────────────
    @patch("routers.panic.get_db")
    def test_create_panic_alert_parent_role_forbidden(self, mock_get_db):
        """TC-PANIC-02: Parent role is forbidden from staff panic endpoint → HTTP 403."""
        mock_get_db.return_value = self.store
        body = self._make_body(reportedBy={"uid": "parent-p1", "name": "Parent"})
        with self.assertRaises(HTTPException) as cm:
            create_panic_alert(body, self._parent_user())
        self.assertEqual(cm.exception.status_code, 403)

    # ─────────────────── TC-PANIC-03: cross-center ──────────────────
    @patch("routers.panic.get_db")
    def test_create_panic_alert_cross_center_forbidden(self, mock_get_db):
        """TC-PANIC-03: Teacher from center-beta cannot alert on center-alpha student → HTTP 403."""
        mock_get_db.return_value = self.store
        body = self._make_body(reportedBy={"uid": "teacher-other", "name": "Outsider"})
        with self.assertRaises(HTTPException) as cm:
            create_panic_alert(body, self._teacher_user(uid="teacher-other", centerId="center-beta"))
        self.assertEqual(cm.exception.status_code, 403)

    # ─────────────────── TC-PANIC-04: idempotency ───────────────────
    @patch("routers.panic.get_db")
    @patch("routers.panic.dispatch_alert")
    def test_create_panic_alert_deduplication_idempotency(self, mock_dispatch, mock_get_db):
        """TC-PANIC-04: Same alertId by same reporter is idempotent; dispatch still called."""
        mock_get_db.return_value = self.store
        mock_dispatch.return_value = {"deliveryStatus": "delivered", "staffNotified": 2}
        body = self._make_body(alertId="alert-001")
        res = create_panic_alert(body, self._teacher_user())
        self.assertEqual(res["id"], "alert-001")

    # ─────────────────── TC-PANIC-05: hijack rejection ──────────────
    @patch("routers.panic.get_db")
    def test_create_panic_alert_mismatched_reporter_hijack_rejected(self, mock_get_db):
        """TC-PANIC-05: Different teacher reusing existing alertId is rejected with 403.

        The attacker is an assigned co-teacher, so student access passes and the
        alert-reference check is what must stop them. (An unassigned teacher is
        already rejected earlier with "Student access denied"; see TC-PANIC-03.)
        """
        mock_get_db.return_value = self.store
        self.store.collection("students").document("student-p1").update({"teacherIds": ["teacher-t1", "teacher-t2"]})
        body = self._make_body(
            alertId="alert-001",
            reportedBy={"uid": "teacher-t2", "name": "Attacker"},
        )
        with self.assertRaises(HTTPException) as cm:
            create_panic_alert(body, self._teacher_user(uid="teacher-t2"))
        self.assertEqual(cm.exception.status_code, 403)
        self.assertIn("mismatch", cm.exception.detail)

    # ─────────────────── TC-PANIC-06: list role enforcement ─────────
    @patch("routers.panic.get_db")
    def test_list_alerts_non_admin_role_forbidden(self, mock_get_db):
        """TC-PANIC-06: Non-admin teacher listing all panic alerts is rejected with 403."""
        mock_get_db.return_value = self.store
        with self.assertRaises(HTTPException) as cm:
            list_alerts(current_user=self._teacher_user())
        self.assertEqual(cm.exception.status_code, 403)

    # ─────────────────── TC-PANIC-07: list center mismatch ──────────
    @patch("routers.panic.get_db")
    def test_list_alerts_admin_centre_mismatch_rejected(self, mock_get_db):
        """TC-PANIC-07: Admin specifying a foreign centerId in query is rejected with 403."""
        mock_get_db.return_value = self.store
        with self.assertRaises(HTTPException) as cm:
            list_alerts(centerId="center-beta", current_user=self._admin_user())
        self.assertEqual(cm.exception.status_code, 403)
        self.assertIn("Centre mismatch", cm.exception.detail)

    # ─────────────────── TC-PANIC-08: resolve success ───────────────
    @patch("routers.panic.get_db")
    def test_resolve_alert_admin_success(self, mock_get_db):
        """TC-PANIC-08: Admin resolves active alert; Firestore document updated."""
        mock_get_db.return_value = self.store
        body = PanicAlertResolve(resolvedBy="admin-1")
        res = resolve_alert("alert-001", body, self._admin_user())
        self.assertEqual(res["message"], "Alert resolved")
        updated = self.store.collection("panicAlerts").document("alert-001").get().to_dict()
        self.assertEqual(updated["status"], "resolved")
        self.assertEqual(updated["resolvedBy"], "admin-1")

    # ─────────────────── TC-PANIC-09: resolve non-existent ──────────
    @patch("routers.panic.get_db")
    def test_resolve_nonexistent_alert_rejected(self, mock_get_db):
        """TC-PANIC-09: Attempting to resolve a non-existent alert returns HTTP 403."""
        mock_get_db.return_value = self.store
        body = PanicAlertResolve(resolvedBy="admin-1")
        with self.assertRaises(HTTPException) as cm:
            resolve_alert("alert-does-not-exist", body, self._admin_user())
        self.assertEqual(cm.exception.status_code, 403)

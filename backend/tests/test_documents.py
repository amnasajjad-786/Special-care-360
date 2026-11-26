import unittest
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from routers import documents
from tests.fake_store import Store


class FakeStorage:
    """Stands in for file_storage (Firebase Storage)."""
    def __init__(self):
        self.objects = {}

    def put(self, key, data, content_type):
        assert key not in self.objects, "objects are never overwritten"
        self.objects[key] = (data, content_type)

    def delete(self, key):
        self.objects.pop(key, None)

    def signed_url(self, key, download_name=None):
        assert key in self.objects
        return f"https://storage.example/{key}?sig=abc&name={download_name}"


PDF = b"%PDF-1.7\n" + b"x" * 64


class DocumentTests(unittest.TestCase):
    def setUp(self):
        self.db = Store({
            "students/s1": dict(name="Sara", centerId="c1", parentId="p1", teacherId="t1", therapistIds=["h1"]),
        })
        self.users = {
            "p1": dict(uid="p1", role="parent", status="approved", centerId="c1", name="Parent"),
            "t1": dict(uid="t1", role="teacher", status="approved", centerId="c1", name="Teacher"),
            "x9": dict(uid="x9", role="teacher", status="approved", centerId="c1", name="Other"),
            "a1": dict(uid="a1", role="admin", status="approved", centerId="c1", name="Admin"),
        }
        for target in ("routers.documents.get_db",):
            p = patch(target, return_value=self.db); p.start(); self.addCleanup(p.stop)
        p = patch("routers.documents.is_placeholder_mode", lambda: False); p.start(); self.addCleanup(p.stop)
        self.storage = FakeStorage()
        for name in ("put", "delete", "signed_url"):
            p = patch(f"routers.documents.file_storage.{name}", getattr(self.storage, name)); p.start(); self.addCleanup(p.stop)
        from main import app
        from middleware.auth_middleware import get_current_user
        self.app, self.dep = app, get_current_user
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)

    def as_user(self, uid):
        self.app.dependency_overrides[self.dep] = lambda: self.users[uid]

    def upload(self, uid="p1", content=PDF, filename="report.pdf"):
        self.as_user(uid)
        return self.client.post("/api/documents/s1", params={"title": "Assessment", "category": "assessment", "filename": filename}, content=content)

    def test_detects_type_from_bytes_and_extension(self):
        self.assertEqual(documents.detect_type(PDF[:16], "a.PDF"), "application/pdf")
        with self.assertRaises(HTTPException):
            documents.detect_type(PDF[:16], "a.exe")
        with self.assertRaises(HTTPException):
            documents.detect_type(b"MZ\x90\x00", "a.pdf")

    def test_parent_upload_stores_metadata_and_notifies_team(self):
        response = self.upload()
        self.assertEqual(response.status_code, 201, response.text)
        record = response.json()
        stored = self.db.data[f"studentDocuments/{record['id']}"]
        self.assertEqual(self.storage.objects[f"student-documents/s1/{record['id']}"][1], "application/pdf")
        self.assertEqual((stored["centerId"], stored["parentId"], stored["uploadedByRole"]), ("c1", "p1", "parent"))
        recipients = {v["recipientId"] for k, v in self.db.data.items() if k.startswith("notifications/")}
        self.assertEqual(recipients, {"t1", "h1"})
        self.assertTrue(any(v.get("action") == "document.upload" for k, v in self.db.data.items() if k.startswith("auditLogs/")))

    def test_rejects_disguised_files_and_unassigned_staff(self):
        self.assertEqual(self.upload(content=b"MZ" + b"0" * 40).status_code, 415)
        self.assertEqual(self.upload(uid="x9").status_code, 403)
        self.assertEqual(self.storage.objects, {})

    def test_download_link_and_delete_permissions(self):
        doc_id = self.upload().json()["id"]
        self.as_user("t1")
        link = self.client.get(f"/api/documents/s1/{doc_id}/download")
        self.assertEqual(link.status_code, 200)
        self.assertIn("name=report.pdf", link.json()["url"])
        self.assertEqual(self.client.delete(f"/api/documents/s1/{doc_id}").status_code, 403)
        self.as_user("a1")
        self.assertEqual(self.client.delete(f"/api/documents/s1/{doc_id}").status_code, 204)
        self.assertNotIn(f"studentDocuments/{doc_id}", self.db.data)
        self.assertEqual(self.storage.objects, {})


if __name__ == "__main__":
    unittest.main()

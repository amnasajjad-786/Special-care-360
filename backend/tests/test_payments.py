import hashlib
import hmac
import json
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from routers import payments
from tests.fake_store import Store

ENV = {"SAFEPAY_ENVIRONMENT": "sandbox", "SAFEPAY_API_KEY": "sec_test", "SAFEPAY_SECRET_KEY": "secret",
       "SAFEPAY_WEBHOOK_SECRET": "whsec", "FRONTEND_URL": "https://app.example"}
TRACKER = "track_0123456789abcdef"


class FakeSafepay:
    def __init__(self):
        self.state, self.amount, self.calls = "TRACKER_STARTED", 250000, []

    def __call__(self, cfg, method, path, body=None):
        self.calls.append((method, path, body))
        if path == "/order/payments/v3/":
            return {"tracker": {"token": TRACKER}}
        if path == "/client/passport/v1/token":
            return "tbt_token"
        if path.startswith("/reporter/api/v1/payments/"):
            return {"tracker": {"token": TRACKER, "state": self.state, "amount": self.amount}}
        raise AssertionError(path)


class PaymentTests(unittest.TestCase):
    def setUp(self):
        self.db = Store({
            "invoices/inv1": dict(studentId="s1", studentName="Sara", parentId="p1", centerId="c1", amount=2500, status="pending"),
            "invoices/inv2": dict(studentId="s2", studentName="Ali", parentId="p2", centerId="c1", amount=1000, status="pending"),
            "users/a1": dict(uid="a1", role="admin", centerId="c1"),
        })
        self.gateway = FakeSafepay()
        for target, value in (("routers.payments.get_db", lambda: self.db), ("routers.payments.is_placeholder_mode", lambda: False),
                              ("routers.payments.safepay", self.gateway), ("audit.SERVER_TIMESTAMP", "now")):
            p = patch(target, value, create=True); p.start(); self.addCleanup(p.stop)
        p = patch.dict(os.environ, ENV); p.start(); self.addCleanup(p.stop)
        from main import app
        from middleware.auth_middleware import get_current_user
        self.app, self.dep = app, get_current_user
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)
        self.users = {"p1": dict(uid="p1", role="parent", status="approved", centerId="c1"),
                      "p2": dict(uid="p2", role="parent", status="approved", centerId="c1"),
                      "a1": dict(uid="a1", role="admin", status="approved", centerId="c1")}

    def as_user(self, uid):
        self.app.dependency_overrides[self.dep] = lambda: self.users[uid]

    def checkout(self, uid="p1", invoice="inv1"):
        self.as_user(uid)
        return self.client.post("/api/payments/safepay/checkout", json={"invoiceId": invoice})

    def payments(self):
        return {k: v for k, v in self.db.data.items() if k.startswith("payments/")}

    def test_disabled_until_configured(self):
        self.as_user("p1")
        with patch.dict(os.environ, {"SAFEPAY_SECRET_KEY": ""}):
            self.assertEqual(self.client.get("/api/payments/config").json(), {"safepay": False})
            self.assertEqual(self.checkout().status_code, 503)
        self.assertEqual(self.client.get("/api/payments/config").json(), {"safepay": True})

    def test_checkout_uses_invoice_amount_in_paisa_and_records_session(self):
        response = self.checkout()
        self.assertEqual(response.status_code, 200, response.text)
        url = response.json()["url"]
        self.assertTrue(url.startswith("https://sandbox.api.getsafepay.com/embedded/?"))
        self.assertIn("tracker=" + TRACKER, url)
        self.assertIn("redirect_url=https%3A%2F%2Fapp.example%2Fdashboard%2Ffees", url)
        body = self.gateway.calls[0][2]
        self.assertEqual((body["amount"], body["currency"], body["metadata"]), (250000, "PKR", {"order_id": "inv1"}))
        self.assertEqual(self.db.data[f"onlinePayments/{TRACKER}"]["status"], "created")

    def test_parent_cannot_pay_another_familys_or_a_paid_invoice(self):
        self.assertEqual(self.checkout(invoice="inv2").status_code, 404)
        self.db.data["invoices/inv1"]["status"] = "paid"
        self.assertEqual(self.checkout().status_code, 409)
        self.assertEqual(self.checkout(uid="a1").status_code, 403)

    def test_confirm_records_payment_only_when_safepay_says_paid(self):
        self.checkout()
        self.assertEqual(self.client.post("/api/payments/safepay/confirm", json={"tracker": TRACKER}).json()["status"], "unpaid")
        self.assertEqual(self.payments(), {})
        self.gateway.state = "TRACKER_ENDED"
        self.assertEqual(self.client.post("/api/payments/safepay/confirm", json={"tracker": TRACKER}).json()["status"], "paid")
        self.assertEqual(self.client.post("/api/payments/safepay/confirm", json={"tracker": TRACKER}).json()["status"], "paid")
        recorded = list(self.payments().values())
        self.assertEqual(len(recorded), 1)
        self.assertEqual((recorded[0]["amount"], recorded[0]["gatewayReference"]), (2500, TRACKER))
        self.assertEqual(self.db.data["invoices/inv1"]["status"], "paid")
        self.assertTrue(any(v.get("type") == "fee_payment" for k, v in self.db.data.items() if k.startswith("notifications/")))

    def test_another_parent_cannot_confirm(self):
        self.checkout()
        self.as_user("p2")
        self.assertEqual(self.client.post("/api/payments/safepay/confirm", json={"tracker": TRACKER}).status_code, 404)

    def test_amount_mismatch_is_not_recorded(self):
        self.checkout()
        self.gateway.state, self.gateway.amount = "TRACKER_ENDED", 100
        self.assertEqual(self.client.post("/api/payments/safepay/confirm", json={"tracker": TRACKER}).status_code, 409)
        self.assertEqual(self.payments(), {})

    def test_webhook_requires_valid_signature_and_is_idempotent(self):
        self.checkout()
        self.gateway.state = "TRACKER_ENDED"
        raw = json.dumps({"type": "payment.succeeded", "data": {"tracker": TRACKER}}).encode()
        bad = self.client.post("/api/payments/safepay/webhook", content=raw, headers={"X-SFPY-SIGNATURE": "00"})
        self.assertEqual(bad.status_code, 401)
        sig = hmac.new(b"whsec", raw, hashlib.sha512).hexdigest()
        for _ in range(2):
            ok = self.client.post("/api/payments/safepay/webhook", content=raw, headers={"X-SFPY-SIGNATURE": sig})
            self.assertEqual(ok.json(), {"status": "paid"})
        self.assertEqual(len(self.payments()), 1)

    def test_payment_after_bank_transfer_is_flagged_for_refund(self):
        self.checkout()
        self.db.data["invoices/inv1"]["status"] = "paid"
        self.gateway.state = "TRACKER_ENDED"
        self.assertEqual(self.client.post("/api/payments/safepay/confirm", json={"tracker": TRACKER}).json()["status"], "duplicate")
        self.assertEqual(self.payments(), {})


if __name__ == "__main__":
    unittest.main()

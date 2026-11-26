"""Online fee payment through Safepay Hosted Checkout.

Flow
1. A parent asks to pay one of their own unpaid invoices. The API creates a
   Safepay payment session (tracker) for exactly the invoice amount, stores a
   server-only ``onlinePayments/{tracker}`` record linking tracker → invoice,
   and returns the Hosted Checkout URL.
2. The parent pays on Safepay's page and is redirected back to the fees page,
   which calls ``/confirm``. Safepay also calls ``/webhook``.
3. Either path calls ``settle``. It never trusts the browser or the webhook
   body for the outcome: it fetches the payment from Safepay and only if the
   tracker is ``TRACKER_ENDED`` records a ``payments`` document and marks the
   invoice paid. The payment id is derived from the tracker, so a redirect and
   a webhook (or webhook retries) record it once.

Configuration (backend/.env): SAFEPAY_ENVIRONMENT (sandbox | production),
SAFEPAY_API_KEY, SAFEPAY_SECRET_KEY, SAFEPAY_WEBHOOK_SECRET, FRONTEND_URL.
Until the keys are set the feature reports itself as disabled and the fees
page keeps offering bank transfer only.
"""
import hashlib
import hmac
import json
import logging
import os
import re
from datetime import datetime, timezone
from urllib.parse import quote, urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from audit import record_audit
from firebase_admin_init import get_db, is_placeholder_mode
from middleware.auth_middleware import get_current_user, require_role
from middleware.student_access import valid_id

router = APIRouter(prefix="/api/payments", tags=["payments"])
logger = logging.getLogger(__name__)

API_BASE = {"sandbox": "https://sandbox.api.getsafepay.com", "production": "https://api.getsafepay.com"}
CHECKOUT_BASE = {"sandbox": "https://sandbox.api.getsafepay.com", "production": "https://getsafepay.com"}
PAID_STATE = "TRACKER_ENDED"
TRACKER = re.compile(r"track_[A-Za-z0-9-]{8,80}")


def settings(require_webhook: bool = False) -> dict:
    env = os.getenv("SAFEPAY_ENVIRONMENT", "sandbox").strip().lower()
    cfg = {
        "env": env,
        "api_key": os.getenv("SAFEPAY_API_KEY", "").strip(),
        "secret": os.getenv("SAFEPAY_SECRET_KEY", "").strip(),
        "webhook_secret": os.getenv("SAFEPAY_WEBHOOK_SECRET", "").strip(),
        "frontend": os.getenv("FRONTEND_URL", "").strip().rstrip("/"),
        "currency": os.getenv("SAFEPAY_CURRENCY", "PKR").strip().upper(),
    }
    ok = env in API_BASE and cfg["api_key"] and cfg["secret"] and re.fullmatch(r"https?://[^\s/]+", cfg["frontend"] or "")
    if not ok or (require_webhook and not cfg["webhook_secret"]):
        raise HTTPException(503, "Online payment is not configured yet. Please pay by bank transfer.")
    return cfg


def enabled() -> bool:
    try:
        settings()
        return not is_placeholder_mode()
    except HTTPException:
        return False


def safepay(cfg: dict, method: str, path: str, body: dict | None = None) -> dict:
    try:
        response = httpx.request(method, API_BASE[cfg["env"]] + path, json=body, timeout=30, headers={
            "Content-Type": "application/json", "Accept": "application/json",
            "X-SFPY-MERCHANT-SECRET": cfg["secret"],
        })
    except httpx.RequestError as exc:
        raise HTTPException(502, "Could not reach the payment provider.") from exc
    try:
        payload = response.json()
    except ValueError:
        payload = None
    if not response.is_success or not isinstance(payload, dict) or "data" not in payload:
        logger.warning("Safepay %s %s failed with HTTP %s", method, path, response.status_code)
        raise HTTPException(502, "The payment provider rejected the request.")
    return payload["data"]


def verify_signature(raw: bytes, signature: str, secret: str) -> bool:
    """HMAC-SHA512 of the body with the endpoint's shared secret (hex), as in
    Safepay's SDKs: the raw body first, then its compact JSON re-encoding."""
    if not signature or not secret:
        return False
    signature = signature.strip().lower()
    digest = lambda message: hmac.new(secret.encode(), message, hashlib.sha512).hexdigest()  # noqa: E731
    if hmac.compare_digest(digest(raw), signature):
        return True
    try:
        compact = json.dumps(json.loads(raw), separators=(",", ":")).encode()
    except ValueError:
        return False
    return compact != raw and hmac.compare_digest(digest(compact), signature)


def find_tracker(value) -> str | None:
    """The tracker token appears in different places across webhook versions."""
    if isinstance(value, str):
        return value if TRACKER.fullmatch(value) else None
    if isinstance(value, dict):
        for key in ("tracker", "token", "data", "payload", "notification"):
            found = find_tracker(value.get(key))
            if found:
                return found
    return None


def to_paisa(amount) -> int:
    try:
        paisa = round(float(amount) * 100)
    except (TypeError, ValueError):
        paisa = 0
    if paisa < 1:
        raise HTTPException(422, "This invoice has no payable amount.")
    return paisa


class CheckoutRequest(BaseModel):
    invoiceId: str = Field(min_length=1, max_length=128)


class ConfirmRequest(BaseModel):
    tracker: str = Field(min_length=1, max_length=100)


@router.get("/config")
def config(user=Depends(get_current_user)):
    return {"safepay": enabled()}


@router.post("/safepay/checkout")
def create_checkout(body: CheckoutRequest, user=Depends(get_current_user)):
    require_role(user, ["parent"])
    cfg = settings()
    if is_placeholder_mode():
        raise HTTPException(503, "Online payment requires live Firebase.")
    db = get_db()
    invoice_id = valid_id(body.invoiceId)
    invoice = db.collection("invoices").document(invoice_id).get().to_dict()
    if not invoice or invoice.get("parentId") != user["uid"] or invoice.get("centerId") != user["centerId"]:
        raise HTTPException(404, "Invoice not found.")
    if invoice.get("status") not in ("pending", "overdue"):
        raise HTTPException(409, "This invoice is not awaiting payment.")
    amount = to_paisa(invoice.get("amount"))

    session = safepay(cfg, "POST", "/order/payments/v3/", {
        "merchant_api_key": cfg["api_key"], "intent": "CYBERSOURCE", "mode": "payment",
        "currency": cfg["currency"], "amount": amount, "include_fees": False,
        "metadata": {"order_id": invoice_id},
    })
    tracker = ((session.get("tracker") or {}).get("token") if isinstance(session, dict) else None) or ""
    if not TRACKER.fullmatch(tracker):
        raise HTTPException(502, "The payment provider returned an invalid session.")
    tbt = safepay(cfg, "POST", "/client/passport/v1/token")
    if not isinstance(tbt, str) or not tbt:
        raise HTTPException(502, "The payment provider returned an invalid session.")

    now = datetime.now(timezone.utc).isoformat()
    db.collection("onlinePayments").document(tracker).set({
        "provider": "safepay", "tracker": tracker, "invoiceId": invoice_id, "studentId": invoice.get("studentId"),
        "centerId": invoice.get("centerId"), "parentId": invoice.get("parentId"), "amountPaisa": amount,
        "currency": cfg["currency"], "status": "created", "createdBy": user["uid"], "createdAt": now,
    })
    back = f"{cfg['frontend']}/dashboard/fees?invoice={quote(invoice_id)}"
    url = f"{CHECKOUT_BASE[cfg['env']]}/embedded/?" + urlencode({
        "tbt": tbt, "tracker": tracker, "environment": cfg["env"], "source": "hosted",
        "redirect_url": back + "&safepay=return", "cancel_url": back + "&safepay=cancel", "order_id": invoice_id,
    })
    record_audit(db, user, "payment.checkout", "invoice", invoice_id, invoice.get("studentId"),
                 f"Started online payment of {cfg['currency']} {amount / 100:.2f}", invoice.get("centerId"))
    return {"url": url, "tracker": tracker}


def settle(db, tracker: str, cfg: dict, actor: dict | None = None) -> dict:
    """Record the payment if Safepay confirms it. Safe to call repeatedly."""
    if not TRACKER.fullmatch(tracker or ""):
        raise HTTPException(404, "Payment not found.")
    session_ref = db.collection("onlinePayments").document(tracker)
    session = session_ref.get().to_dict()
    if not session:
        raise HTTPException(404, "Payment not found.")
    if session.get("status") in ("paid", "duplicate"):
        return {"status": session["status"], "invoiceId": session["invoiceId"]}

    remote = safepay(cfg, "GET", f"/reporter/api/v1/payments/{quote(tracker, safe='')}")
    state = ((remote or {}).get("tracker") or {}).get("state") if isinstance(remote, dict) else None
    if state != PAID_STATE:
        return {"status": "unpaid", "state": state, "invoiceId": session["invoiceId"]}
    remote_amount = ((remote.get("tracker") or {}).get("amount"))
    if isinstance(remote_amount, (int, float)) and int(remote_amount) != int(session["amountPaisa"]):
        logger.error("Safepay amount mismatch for %s: %s != %s", tracker, remote_amount, session["amountPaisa"])
        session_ref.update({"status": "amount_mismatch", "checkedAt": datetime.now(timezone.utc).isoformat()})
        raise HTTPException(409, "The paid amount does not match the invoice. The centre has been alerted.")

    invoice_ref = db.collection("invoices").document(session["invoiceId"])
    invoice = invoice_ref.get().to_dict() or {}
    now = datetime.now(timezone.utc).isoformat()
    if invoice.get("status") == "paid":
        # Paid twice (e.g. bank transfer recorded first): keep for refund.
        session_ref.update({"status": "duplicate", "settledAt": now})
        notify_admins(db, session, "Duplicate online payment", f"Invoice {session['invoiceId']} was already paid; Safepay payment {tracker} needs a refund.")
        return {"status": "duplicate", "invoiceId": session["invoiceId"]}

    payment_id = "safepay-" + hashlib.sha256(tracker.encode()).hexdigest()[:32]
    batch = db.batch()
    batch.create(db.collection("payments").document(payment_id), {
        "invoiceId": session["invoiceId"], "studentId": invoice.get("studentId"), "studentName": invoice.get("studentName"),
        "parentId": invoice.get("parentId"), "centerId": invoice.get("centerId"), "amount": invoice.get("amount"),
        "method": "Online (Safepay)", "gateway": "safepay", "gatewayReference": tracker, "date": now,
        "recordedBy": "safepay", "createdAt": now,
    })
    batch.update(invoice_ref, {"status": "paid", "paymentId": payment_id, "paidAt": now})
    batch.update(session_ref, {"status": "paid", "settledAt": now, "paymentId": payment_id})
    try:
        batch.commit()
    except Exception as exc:
        if "exist" in str(exc).lower() or type(exc).__name__ in ("AlreadyExists", "Conflict"):
            return {"status": "paid", "invoiceId": session["invoiceId"]}
        raise
    notify_admins(db, session, "Online payment received",
                  f"{invoice.get('studentName') or 'A student'}: {session.get('currency', 'PKR')} {session['amountPaisa'] / 100:,.2f} paid via Safepay.")
    record_audit(db, actor or {"uid": "safepay", "role": "system", "name": "Safepay"}, "payment.online", "invoice",
                 session["invoiceId"], invoice.get("studentId"), f"Online payment {tracker} recorded", invoice.get("centerId"))
    return {"status": "paid", "invoiceId": session["invoiceId"]}


def notify_admins(db, session: dict, title: str, message: str) -> None:
    try:
        admins = db.collection("users").where("centerId", "==", session.get("centerId")).where("role", "==", "admin").stream()
        for admin in admins:
            db.collection("notifications").document(f"pay-{session['tracker'][-20:]}-{admin.id}-{title[:8]}").set({
                "recipientId": admin.id, "senderId": "system", "type": "fee_payment", "title": title, "message": message,
                "studentId": session.get("studentId"), "centerId": session.get("centerId"), "parentId": session.get("parentId"),
                "read": False, "createdAt": datetime.now(timezone.utc).isoformat(),
            })
    except Exception:
        logger.exception("Could not notify admins about payment %s", session.get("tracker"))


@router.post("/safepay/confirm")
def confirm(body: ConfirmRequest, user=Depends(get_current_user)):
    require_role(user, ["parent", "admin"])
    cfg = settings()
    db = get_db()
    session = db.collection("onlinePayments").document(body.tracker).get().to_dict() if TRACKER.fullmatch(body.tracker) else None
    if not session or session.get("centerId") != user["centerId"] or (user["role"] == "parent" and session.get("parentId") != user["uid"]):
        raise HTTPException(404, "Payment not found.")
    return settle(db, body.tracker, cfg, user)


@router.post("/safepay/webhook")
async def webhook(request: Request):
    cfg = settings(require_webhook=True)
    raw = await request.body()
    if len(raw) > 64 * 1024 or not verify_signature(raw, request.headers.get("X-SFPY-SIGNATURE", ""), cfg["webhook_secret"]):
        raise HTTPException(401, "Invalid signature.")
    try:
        tracker = find_tracker(json.loads(raw))
    except ValueError:
        tracker = None
    if not tracker:
        return {"ignored": True}
    try:
        result = settle(get_db(), tracker, cfg)
    except HTTPException as exc:
        if exc.status_code == 404:  # not one of ours
            return {"ignored": True}
        raise
    return {"status": result["status"]}

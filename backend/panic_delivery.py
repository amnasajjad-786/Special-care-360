"""Durable in-app panic outbox. Notification IDs make retries idempotent."""
import logging
import os
from datetime import datetime, timezone, timedelta
from firebase_admin import firestore
from firebase_admin_init import get_db
from middleware.student_access import valid_id

logger = logging.getLogger(__name__)


def dispatch_alert(db, reference, now=None):
    explicit_clock = now is not None
    now = now or datetime.now(timezone.utc)
    snapshot = reference.get()
    data = snapshot.to_dict() or {}
    if not snapshot.exists or data.get("deliveryStatus") == "delivered":
        return data
    attempts = int(data.get("deliveryAttempts", 0)) + 1
    try:
        reporter = data.get("reportedBy", {}).get("uid")
        valid_id(reporter)
        profile = db.collection("users").document(reporter).get().to_dict() or {}
        # Authority was checked when the immutable outbox event was created.
        # Archiving/offboarding afterward must not cancel a recorded emergency.
        student_id = valid_id(data.get("studentId"))
        student_snapshot = db.collection("students").document(student_id).get()
        student = student_snapshot.to_dict() or {}
        if (not student_snapshot.exists or profile.get("role") not in ("admin", "teacher", "therapist")
                or profile.get("status") not in ("approved", "disabled") or profile.get("uid", reporter) != reporter
                or profile.get("centerId") != student.get("centerId")):
            raise ValueError("Invalid recorded emergency actor")
        if data.get("centerId") != student["centerId"] or data.get("parentId") != student.get("parentId"):
            raise ValueError("Invalid alert references")
        recipients = set()
        for member in db.collection("users").where("centerId", "==", student["centerId"]).stream():
            user = member.to_dict() or {}
            if user.get("uid") == member.id and user.get("status") == "approved" and (
                user.get("role") in ("admin", "teacher", "therapist")
                or (user.get("role") == "parent" and member.id == student.get("parentId"))
            ):
                recipients.add(member.id)
        recipients.discard(None)
        recipients.discard(reporter)
        if not recipients:
            raise RuntimeError("No eligible emergency recipients")

        @firestore.transactional
        def deliver(transaction):
            current = reference.get(transaction=transaction).to_dict() or {}
            if current.get("deliveryStatus") == "delivered":
                return False
            targets = [(uid, db.collection("notifications").document(f"panic-{reference.id}-{uid}")) for uid in sorted(recipients)]
            existing = [target.get(transaction=transaction) for _, target in targets]
            for (uid, target), old in zip(targets, existing):
                if not old.exists:
                    transaction.create(target, {
                        "recipientId": uid, "senderId": "system", "type": "panic_alert",
                        "alertId": reference.id, "centerId": student["centerId"],
                        "title": "Emergency alert", "message": f"Emergency assistance requested in {data.get('location', 'the centre')}.",
                        "read": False, "createdAt": firestore.SERVER_TIMESTAMP,
                    })
            requested = datetime.fromisoformat(data["timestamp"].replace("Z", "+00:00"))
            latency_ms = max(0, int((now - requested).total_seconds() * 1000))
            transaction.update(reference, {"deliveryStatus": "delivered", "deliveryAttempts": attempts,
                "deliveredAt": now.isoformat(), "deliveryLatencyMs": latency_ms,
                "emailStatus": "pending" if os.getenv("SMTP_HOST") else "unconfigured",
                "staffNotified": len(recipients), "deliveryError": None})
            return True

        committed = deliver(db.transaction())
        # Include the transaction commit itself in the observed delivery latency.
        completed_at = now if explicit_clock else datetime.now(timezone.utc)
        requested_at = datetime.fromisoformat(data["timestamp"].replace("Z", "+00:00"))
        if committed:
            try:
                reference.update({"deliveredAt": completed_at.isoformat(), "deliveryLatencyMs": max(0, int((completed_at - requested_at).total_seconds() * 1000))})
            except Exception:
                logger.warning("Delivery succeeded but latency metric could not be persisted", exc_info=True)
        logger.info("panic_delivery alert=%s latency_ms=%s", reference.id,
                    (reference.get().to_dict() or {}).get("deliveryLatencyMs"))
    except Exception:
        # Keep the outbox entry. Worker retries after outage/restart; no fake success.
        logger.exception("Panic delivery deferred for %s", reference.id)
        @firestore.transactional
        def defer(transaction):
            current = reference.get(transaction=transaction).to_dict() or {}
            if current.get("deliveryStatus") != "delivered":
                transaction.update(reference, {"deliveryStatus": "retry", "deliveryAttempts": attempts,
                    "deliveryError": "Delivery unavailable; retry scheduled",
                    "retryAt": (now + timedelta(seconds=min(30, 2 ** min(attempts, 5)))).isoformat()})
        try:
            defer(db.transaction())
        except Exception:
            # If storage is unavailable, the original pending event remains in
            # the backlog. A competing successful dispatch must never be undone.
            logger.warning("Could not persist retry status; durable event remains pending", exc_info=True)
    return reference.get().to_dict() or {}


def process_pending_alerts(now=None):
    explicit_clock = now is not None
    now = now or datetime.now(timezone.utc)
    db = get_db()
    completed = 0
    # Streaming avoids a limit letting delayed records permanently starve later ones.
    for snapshot in db.collection("panicAlerts").where("deliveryStatus", "in", ["pending", "retry"]).stream():
        data = snapshot.to_dict() or {}
        if data.get("retryAt") and datetime.fromisoformat(data["retryAt"]) > now:
            continue
        result = dispatch_alert(db, snapshot.reference, now if explicit_clock else None)
        completed += result.get("deliveryStatus") == "delivered"
    return completed


def process_pending_emails(now=None):
    """Email is a separate retryable channel; SMTP cannot block in-app dispatch.

    SMTP is at-least-once after a crash, unlike transactional in-app notifications.
    A lease prevents simultaneous workers sending the same alert normally.
    """
    from utils.email_util import send_panic_email_alert
    now = now or datetime.now(timezone.utc)
    db = get_db()
    for snapshot in db.collection("panicAlerts").where("emailStatus", "in", ["pending", "retry", "sending"]).stream():
        reference = snapshot.reference

        @firestore.transactional
        def claim(transaction):
            data = reference.get(transaction=transaction).to_dict() or {}
            until = data.get("emailRetryAt")
            if data.get("emailStatus") == "sent" or (until and datetime.fromisoformat(until) > now):
                return None
            transaction.update(reference, {"emailStatus": "sending", "emailRetryAt": (now + timedelta(seconds=60)).isoformat()})
            return data

        data = claim(db.transaction())
        if data is None:
            continue
        sent = send_panic_email_alert(data)
        reference.update({"emailStatus": "sent" if sent else "retry",
            "emailRetryAt": None if sent else (now + timedelta(seconds=30)).isoformat()})

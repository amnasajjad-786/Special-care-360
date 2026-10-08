"""Background missed-dose detection for scheduled medication administrations."""

import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from firebase_admin import firestore

from firebase_admin_init import get_db, is_placeholder_mode
from medication_schedule import (
    dose_id,
    dose_is_overdue,
    notification_id,
    scheduled_times,
)

logger = logging.getLogger(__name__)
GRACE_MINUTES = 60


def _commit_missed_dose(
    db, dose_ref, notification_targets, dose_data, student_name, medication_name
):
    transaction = db.transaction()

    @firestore.transactional
    def commit(transaction):
        dose_snapshot = dose_ref.get(transaction=transaction)
        should_alert = not dose_snapshot.exists
        if dose_snapshot.exists:
            existing = dose_snapshot.to_dict() or {}
            should_alert = (
                existing.get("status") in ("not_administered", "missed")
                and not existing.get("alertSent", False)
                and bool(notification_targets)
            )

        notification_snapshots = []
        if should_alert:
            notification_snapshots = [
                reference.get(transaction=transaction)
                for _, reference in notification_targets
            ]

        if not dose_snapshot.exists:
            transaction.create(dose_ref, {
                **dose_data,
                "status": "missed",
                "alertSent": bool(notification_targets),
                "createdAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            })
        elif should_alert:
            transaction.update(dose_ref, {
                "alertSent": True,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            })

        if should_alert:
            for (recipient_id, reference), snapshot in zip(
                notification_targets, notification_snapshots
            ):
                if not snapshot.exists:
                    transaction.create(reference, {
                        "recipientId": recipient_id,
                        "senderId": "system",
                        "type": "missed_medication",
                        "title": "Missed medication dose",
                        "message": (
                            f"{student_name} has a missed dose of {medication_name} "
                            f"scheduled for {dose_data['scheduledTime']}."
                        ),
                        "studentId": dose_data["studentId"],
                        "medicationId": dose_data["medicationId"],
                        "doseId": dose_ref.id,
                        "read": False,
                        "createdAt": firestore.SERVER_TIMESTAMP,
                    })
        return should_alert

    return commit(transaction)


def check_missed_medication_doses(now=None):
    """Create missed records and recipient notifications once their grace expires."""
    if is_placeholder_mode():
        logger.info("Skipping medication monitor while using placeholder Firestore.")
        return 0

    timezone = ZoneInfo("Asia/Karachi")
    now = now or datetime.now(timezone)
    now = now.astimezone(timezone)
    db = get_db()
    checkpoint_ref = db.collection("systemState").document("medicationMonitor")
    checkpoint = checkpoint_ref.get().to_dict() or {}
    previous = checkpoint.get("checkedThrough")
    first_day = datetime.fromisoformat(previous).astimezone(timezone).date() if previous else now.date() - timedelta(days=1)
    # Bound each scan, but persist the cursor so arbitrarily long outages catch up.
    last_day = min(now.date(), first_day + timedelta(days=6))
    days = [(first_day + timedelta(days=offset)).isoformat()
            for offset in range((last_day - first_day).days + 1)]
    failed = False

    recipients_by_center = {}
    for user_snapshot in db.collection("users").stream():
        user = user_snapshot.to_dict() or {}
        if user.get("status") != "approved" or user.get("role") != "admin":
            continue
        recipients_by_center.setdefault(user.get("centerId"), set()).add(user_snapshot.id)

    created_or_alerted = 0
    for student_snapshot in db.collection("students").stream():
        student = student_snapshot.to_dict() or {}
        if student.get("archivedAt"):
            continue
        center_id = student.get("centerId")
        recipients = set(recipients_by_center.get(center_id, set()))
        parent_id = student.get("parentId")
        if parent_id:
            recipients.add(parent_id)

        medical_snapshot = (
            db.collection("students")
            .document(student_snapshot.id)
            .collection("medicalProfile")
            .document("main")
            .get()
        )
        medications = (medical_snapshot.to_dict() or {}).get("medications", [])
        if not isinstance(medications, list):
            continue

        for index, medication in enumerate(medications):
            if not isinstance(medication, dict):
                continue
            medication_id = str(medication.get("id") or f"legacy-{index}")
            medication_name = str(medication.get("name") or "Medication")
            for day, scheduled_time in ((day, time) for day in days for time in scheduled_times(medication)):
                if medication.get("startDate") and day < medication["startDate"][:10]:
                    continue
                if medication.get("endDate") and day > medication["endDate"][:10]:
                    continue
                due_at = datetime.strptime(
                    f"{day} {scheduled_time}", "%Y-%m-%d %H:%M"
                ).replace(tzinfo=timezone)
                if not dose_is_overdue(now, due_at, GRACE_MINUTES):
                    continue

                dose_document_id = dose_id(
                    student_snapshot.id, medication_id, day, scheduled_time
                )
                dose_data = {
                    "studentId": student_snapshot.id,
                    "studentName": str(student.get("name") or "Student"),
                    "centerId": center_id,
                    "parentId": parent_id,
                    "medicationId": medication_id,
                    "medicationName": medication_name,
                    "dosage": str(medication.get("dosage") or ""),
                    "date": day,
                    "scheduledTime": scheduled_time,
                }
                dose_ref = (
                    db.collection("students")
                    .document(student_snapshot.id)
                    .collection("medicationAdministrations")
                    .document(dose_document_id)
                )
                notification_targets = [
                    (
                        recipient_id,
                        db.collection("notifications").document(
                            notification_id(recipient_id, dose_document_id)
                        ),
                    )
                    for recipient_id in sorted(recipients)
                ]
                try:
                    if _commit_missed_dose(
                        db,
                        dose_ref,
                        notification_targets,
                        dose_data,
                        dose_data["studentName"],
                        medication_name,
                    ):
                        created_or_alerted += 1
                except Exception:
                    failed = True
                    logger.exception(
                        "Failed to process missed dose %s for student %s",
                        dose_document_id,
                        student_snapshot.id,
                    )
    if not failed:
        through = now if last_day == now.date() else datetime.combine(last_day + timedelta(days=1), datetime.min.time(), timezone)
        checkpoint_ref.set({"checkedThrough": through.isoformat()})
    return created_or_alerted

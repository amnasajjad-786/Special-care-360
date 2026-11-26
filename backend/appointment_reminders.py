"""Automated appointment reminders (Charter scope; Jira SCRUM-13/14).

A background loop scans upcoming sessions and sends in-app reminders to the
child's guardian and the therapist:

* 24 hours before the session, and
* 1 hour before the session.

Both scheduling surfaces are covered: teletherapy video sessions
(``teletherapySessions``) and in-centre therapy appointments
(``therapySessions``). A timeline session that links to a teletherapy session
is skipped, so one appointment never produces two reminders.

Each reminder is written in one batch together with a marker document in
``appointmentReminders`` whose id is derived from the session, its start time
and the reminder window. The marker is created with ``create``, which fails if
it already exists, so a reminder is sent at most once even when several
backend workers run the scan. Rescheduling changes the start time, and so the
marker id, which means a moved session is reminded again for its new time.
"""

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, List, Optional
from zoneinfo import ZoneInfo

from firebase_admin import firestore

from firebase_admin_init import get_db, is_placeholder_mode

logger = logging.getLogger(__name__)
PAKISTAN = ZoneInfo("Asia/Karachi")

# (window id, lead time, wording)
WINDOWS = (
    ("1h", timedelta(hours=1), "in about 1 hour"),
    ("24h", timedelta(hours=24), "tomorrow"),
)


@dataclass
class Reminder:
    key: str
    collection: str
    session_id: str
    window: str
    start: datetime
    title: str
    student_id: str
    student_name: str
    center_id: str
    parent_id: Optional[str]
    therapist_id: Optional[str]
    therapist_name: str
    when_text: str


def _parse(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        moment = value
    else:
        try:
            moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    # A naive time was entered on a centre clock, which runs on Pakistan time.
    return moment if moment.tzinfo else moment.replace(tzinfo=PAKISTAN)


def _window_for(lead: timedelta) -> Optional[tuple]:
    """The single reminder due for a session starting ``lead`` from now."""
    if lead <= timedelta(0):
        return None
    for window in WINDOWS:  # shortest first
        if lead <= window[1]:
            return window
    return None


def _start_of(collection: str, data: dict) -> Optional[datetime]:
    if collection == "teletherapySessions":
        return _parse(data.get("scheduledAt"))
    start = _parse(data.get("startDateTime") or data.get("scheduledAt"))
    if start is None and data.get("date") and data.get("startTime"):
        start = _parse(f"{data['date']}T{data['startTime']}")
    return start


def due_reminders(collection: str, sessions: Iterable[tuple], now: datetime) -> List[Reminder]:
    """Pure selection: which (session, window) reminders are due at ``now``."""
    due = []
    for session_id, data in sessions:
        if str(data.get("status", "")).lower() not in ("scheduled", "rescheduled"):
            continue
        if collection == "therapySessions" and data.get("teletherapySessionId"):
            continue
        start = _start_of(collection, data)
        if start is None:
            continue
        window = _window_for(start - now)
        if window is None:
            continue
        window_id, _, wording = window
        key = hashlib.sha256(f"{collection}:{session_id}:{start.isoformat()}:{window_id}".encode()).hexdigest()
        local = start.astimezone(PAKISTAN)
        due.append(Reminder(
            key=key, collection=collection, session_id=session_id, window=window_id, start=start,
            title=str(data.get("title") or data.get("therapyType") or "Therapy session"),
            student_id=str(data.get("studentId") or ""), student_name=str(data.get("studentName") or "your child"),
            center_id=str(data.get("centerId") or ""), parent_id=data.get("parentId") or None,
            therapist_id=data.get("therapistId") or None, therapist_name=str(data.get("therapistName") or "the therapist"),
            when_text=f"{wording} ({local.strftime('%d %b %Y, %I:%M %p')} Pakistan time)",
        ))
    return due


def _caregivers(db, student_id: str) -> list:
    if not student_id:
        return []
    try:
        student = db.collection("students").document(student_id).get().to_dict() or {}
    except Exception:
        logger.warning("Could not read caregivers for student %s", student_id)
        return []
    ids = student.get("caregiverIds") or []
    return [uid for uid in ids if isinstance(uid, str) and uid][:3]


def _deliver(db, reminder: Reminder) -> bool:
    """Write the marker and notifications atomically. False if already sent."""
    batch = db.batch()
    batch.create(db.collection("appointmentReminders").document(reminder.key), {
        "collection": reminder.collection, "sessionId": reminder.session_id, "window": reminder.window,
        "start": reminder.start.isoformat(), "centerId": reminder.center_id, "sentAt": firestore.SERVER_TIMESTAMP,
    })
    linked = {"studentId": reminder.student_id, "centerId": reminder.center_id, "parentId": reminder.parent_id}
    recipients = []
    if reminder.parent_id:
        recipients.append((reminder.parent_id, f"{reminder.title} for {reminder.student_name} with {reminder.therapist_name} starts {reminder.when_text}."))
    if reminder.parent_id:
        # Caregivers an admin linked to the child hear what the guardian hears.
        for uid in _caregivers(db, reminder.student_id):
            recipients.append((uid, f"{reminder.title} for {reminder.student_name} with {reminder.therapist_name} starts {reminder.when_text}."))
    if reminder.therapist_id:
        recipients.append((reminder.therapist_id, f"{reminder.title} with {reminder.student_name} starts {reminder.when_text}."))
    if not recipients:
        return False
    for uid, message in recipients:
        batch.set(db.collection("notifications").document(f"reminder-{reminder.key[:40]}-{uid}"), {
            **linked, "recipientId": uid, "senderId": "system", "type": "appointment_reminder",
            "title": "Upcoming appointment" if reminder.window == "24h" else "Appointment starting soon",
            "message": message, "sessionId": reminder.session_id, "sessionCollection": reminder.collection,
            "read": False, "createdAt": firestore.SERVER_TIMESTAMP,
        })
    try:
        batch.commit()
    except Exception as error:  # AlreadyExists on the marker means another run sent it
        if "exist" in str(error).lower() or type(error).__name__ in ("AlreadyExists", "Conflict"):
            return False
        raise
    return True


def send_appointment_reminders(db=None, now: Optional[datetime] = None) -> int:
    """One scan. Returns the number of reminders sent."""
    if db is None:
        if is_placeholder_mode():
            return 0
        db = get_db()
    now = now or datetime.now(timezone.utc)
    sent = 0
    for collection, statuses in (("teletherapySessions", ["scheduled"]), ("therapySessions", ["Scheduled", "Rescheduled"])):
        snapshots = db.collection(collection).where("status", "in", statuses).stream()
        rows = ((snap.id, snap.to_dict() or {}) for snap in snapshots)
        for reminder in due_reminders(collection, rows, now):
            try:
                if _deliver(db, reminder):
                    sent += 1
            except Exception:
                logger.exception("Reminder failed for %s/%s (%s)", collection, reminder.session_id, reminder.window)
    return sent

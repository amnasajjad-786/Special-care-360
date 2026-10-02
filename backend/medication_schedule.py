"""Pure helpers for deterministic medication dose scheduling."""

import hashlib
from datetime import datetime, timedelta


def scheduled_times(medication):
    configured_times = medication.get("times")
    legacy_time = medication.get("time")
    if isinstance(configured_times, list) and configured_times:
        configured = configured_times
    elif isinstance(legacy_time, str):
        configured = legacy_time.split(",")
    else:
        configured = []

    times = set()
    for value in configured:
        if not isinstance(value, str):
            continue
        value = value.strip()
        for time_format in ("%H:%M", "%I:%M %p"):
            try:
                times.add(datetime.strptime(value, time_format).strftime("%H:%M"))
                break
            except ValueError:
                continue
    return sorted(times)


def dose_id(student_id, medication_id, date, time):
    safe_medication_id = "".join(
        char if char.isalnum() or char in "_-" else "_" for char in medication_id
    )
    return f"{student_id}__{safe_medication_id}__{date}__{time.replace(':', '')}"


def notification_id(recipient_id, dose_id_value):
    digest = hashlib.sha256(
        f"{recipient_id}:{dose_id_value}".encode()
    ).hexdigest()
    return f"missed-medication-{digest}"


def dose_is_overdue(now, scheduled_at, grace_minutes=60):
    return now >= scheduled_at + timedelta(minutes=grace_minutes)

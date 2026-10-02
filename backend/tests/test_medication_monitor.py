import unittest
from datetime import datetime, timedelta, timezone

from medication_schedule import (
    dose_id,
    dose_is_overdue,
    notification_id,
    scheduled_times,
)


class MedicationMonitorTests(unittest.TestCase):
    def test_scheduled_times_normalizes_and_deduplicates_legacy_values(self):
        self.assertEqual(
            scheduled_times({"time": "8:00 AM, 20:00, 08:00"}),
            ["08:00", "20:00"],
        )

    def test_scheduled_times_prefers_multiple_configured_times(self):
        self.assertEqual(
            scheduled_times({"times": ["07:30", "19:45"], "time": "08:00 AM"}),
            ["07:30", "19:45"],
        )

    def test_invalid_times_are_ignored(self):
        self.assertEqual(scheduled_times({"time": "25:00, not a time"}), [])

    def test_dose_ids_are_stable_and_notification_ids_are_recipient_specific(self):
        dose = dose_id("student-1", "medication / a", "2026-04-20", "08:00")
        self.assertEqual(dose, "student-1__medication___a__2026-04-20__0800")
        self.assertEqual(
            notification_id("parent-1", dose),
            notification_id("parent-1", dose),
        )
        self.assertNotEqual(
            notification_id("parent-1", dose),
            notification_id("admin-1", dose),
        )

    def test_grace_period_boundary_is_inclusive(self):
        scheduled_at = datetime(2026, 4, 20, 8, 0, tzinfo=timezone.utc)
        self.assertFalse(
            dose_is_overdue(scheduled_at + timedelta(minutes=59), scheduled_at)
        )
        self.assertTrue(
            dose_is_overdue(scheduled_at + timedelta(minutes=60), scheduled_at)
        )


if __name__ == "__main__":
    unittest.main()

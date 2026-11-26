import unittest
from datetime import datetime, timedelta, timezone

from appointment_reminders import due_reminders, send_appointment_reminders
from tests.fake_store import Store

NOW = datetime(2026, 11, 21, 6, 0, tzinfo=timezone.utc)


def at(delta):
    return (NOW + delta).isoformat()


class AppointmentReminderTests(unittest.TestCase):
    def setUp(self):
        base = dict(studentId='s1', studentName='Sara', centerId='c1', parentId='p1', therapistId='h1', therapistName='Dr. H')
        self.db = Store({
            'teletherapySessions/tomorrow': dict(base, status='scheduled', title='Speech', scheduledAt=at(timedelta(hours=20))),
            'teletherapySessions/soon': dict(base, status='scheduled', title='OT', scheduledAt=at(timedelta(minutes=40))),
            'teletherapySessions/later': dict(base, status='scheduled', title='Far', scheduledAt=at(timedelta(days=3))),
            'teletherapySessions/past': dict(base, status='scheduled', title='Past', scheduledAt=at(timedelta(hours=-1))),
            'teletherapySessions/cancelled': dict(base, status='cancelled', title='Off', scheduledAt=at(timedelta(hours=2))),
            'therapySessions/room': dict(base, status='Scheduled', therapyType='Physio', startDateTime=at(timedelta(hours=5))),
            'therapySessions/linked': dict(base, status='Scheduled', startDateTime=at(timedelta(hours=5)), teletherapySessionId='tomorrow'),
        })

    def notifications(self):
        return {k: v for k, v in self.db.data.items() if k.startswith('notifications/')}

    def test_sends_one_window_per_due_session_to_parent_and_therapist(self):
        self.assertEqual(send_appointment_reminders(self.db, NOW), 3)
        notes = self.notifications()
        self.assertEqual(len(notes), 6)
        self.assertEqual({n['recipientId'] for n in notes.values()}, {'p1', 'h1'})
        self.assertTrue(all(n['type'] == 'appointment_reminder' and n['centerId'] == 'c1' for n in notes.values()))
        titles = sorted(n['title'] for n in notes.values() if n['recipientId'] == 'p1')
        self.assertEqual(titles, ['Appointment starting soon', 'Upcoming appointment', 'Upcoming appointment'])

    def test_repeat_scan_sends_nothing_new(self):
        send_appointment_reminders(self.db, NOW)
        self.assertEqual(send_appointment_reminders(self.db, NOW + timedelta(minutes=5)), 0)
        self.assertEqual(len(self.notifications()), 6)

    def test_one_hour_reminder_follows_the_day_ahead_reminder(self):
        send_appointment_reminders(self.db, NOW)
        later = NOW + timedelta(hours=19, minutes=30)
        self.assertEqual(send_appointment_reminders(self.db, later), 1)  # 'tomorrow' now within 1h

    def test_rescheduled_session_is_reminded_for_its_new_time(self):
        send_appointment_reminders(self.db, NOW)
        self.db.data['teletherapySessions/tomorrow']['scheduledAt'] = at(timedelta(hours=22))
        self.assertEqual(send_appointment_reminders(self.db, NOW), 1)

    def test_linked_caregivers_are_reminded_too(self):
        self.db.data['students/s1'] = {'caregiverIds': ['cg1']}
        send_appointment_reminders(self.db, NOW)
        self.assertEqual({n['recipientId'] for n in self.notifications().values()}, {'p1', 'h1', 'cg1'})
        self.assertEqual(len(self.notifications()), 9)

    def test_naive_times_are_read_as_pakistan_time(self):
        rows = [('x', {'status': 'Scheduled', 'date': '2026-11-21', 'startTime': '11:30'})]  # 06:30 UTC
        due = due_reminders('therapySessions', rows, NOW)
        self.assertEqual([d.window for d in due], ['1h'])


if __name__ == '__main__':
    unittest.main()

import unittest
from unittest.mock import patch
from fastapi import HTTPException
from routers.regression import Observation, save_observation
from tests.fake_store import Store, transactional


class RegressionTests(unittest.TestCase):
    def setUp(self):
        self.user = dict(uid='t1', role='teacher', status='approved', centerId='c1')
        self.db = Store({'students/s1': dict(centerId='c1', parentId='p1', teacherId='t1', therapistIds=['h1']),
            'students/s1/carePlan/main': {'achievedGoals': [{'id': 'g1', 'title': 'Skill', 'achievedAt': '2026-06-01'}]}})
        self.patch = patch('routers.regression.firestore.transactional', transactional)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def save(self, request, status='Failed/Declined', **kw):
        data = dict(studentId='s1', goalId='g1', centerId='c1', requestId=request, observedStatus=status)
        data.update(kw)
        return save_observation(self.db, Observation(**data), self.user)

    def test_monitor_escalate_retry_and_saved_history(self):
        self.assertEqual(self.save('first')['alertLevel'], 'Monitoring')
        self.assertEqual(self.save('second')['alertLevel'], 'Regression Warning')
        self.save('second')
        self.assertEqual(sum(p.startswith('milestoneObservations/') for p in self.db.data), 2)
        self.assertEqual(sum(p.startswith('regressionAlerts/') for p in self.db.data), 1)
        self.assertEqual(sum(p.startswith('notifications/') for p in self.db.data), 1)

    def test_developing_declines_and_restored_mastery_resets_streak(self):
        self.assertEqual(self.save('one', 'In Progress')['alertLevel'], 'Monitoring')
        self.assertEqual(self.save('two', 'In Progress')['alertLevel'], 'Regression Warning')
        self.assertIsNone(self.save('three', 'Achieved')['alertLevel'])
        self.assertEqual(self.save('four')['alertLevel'], 'Monitoring')

    def test_unauthorized_or_missing_goal_never_partially_saves(self):
        for changes in [dict(centerId='c2'), dict(goalId='unknown'), dict(studentId='../bad')]:
            old = dict(self.db.data)
            with self.assertRaises(HTTPException): self.save('bad', **changes)
            self.assertEqual(self.db.data, old)
        for changes in [dict(uid='other'), dict(status='pending'), dict(role='therapist')]:
            original = self.user.copy()
            self.user.update(changes)
            with self.assertRaises(HTTPException): self.save('bad')
            self.user = original

    def test_failed_transaction_preserves_everything(self):
        old = dict(self.db.data)
        self.db.fail_commit = True
        with self.assertRaises(PermissionError): self.save('outage')
        self.assertEqual(self.db.data, old)
        self.db.fail_commit = False
        self.assertEqual(self.save('outage')['alertLevel'], 'Monitoring')

    def test_concurrent_observations_create_one_warning(self):
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=2) as pool:
            levels = list(pool.map(lambda n: self.save(str(n))['alertLevel'], range(2)))
        self.assertCountEqual(levels, ['Monitoring', 'Regression Warning'])
        self.assertEqual(sum(p.startswith('notifications/') for p in self.db.data), 1)

    def test_changed_payload_cannot_reuse_request(self):
        self.save('retry')
        with self.assertRaises(HTTPException): self.save('retry', 'Achieved')

    def test_new_decline_after_resolution_starts_new_review(self):
        self.save('first')
        alert = next(data for path,data in self.db.data.items() if path.startswith('regressionAlerts/'))
        alert['resolved'] = True
        self.assertEqual(self.save('second')['alertLevel'], 'Monitoring')
        self.assertEqual(sum(path.startswith('regressionAlerts/') for path in self.db.data), 2)

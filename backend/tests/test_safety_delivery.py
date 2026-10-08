import asyncio
import json
import time
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
import httpx
from fake_store import Store, transactional
from panic_delivery import dispatch_alert, process_pending_alerts, process_pending_emails
from medication_monitor import check_missed_medication_doses
from medication_schedule import dose_id
from routers.ai_insights import request_cohere


class SafetyTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 6, 0, 45, tzinfo=timezone(timedelta(hours=5)))
        self.db = Store({'users/t1': {'uid':'t1','role':'teacher','status':'approved','centerId':'c1'},
            'users/a1': {'uid':'a1','role':'admin','status':'approved','centerId':'c1'},
            'users/p1': {'uid':'p1','role':'parent','status':'approved','centerId':'c1'},
            'students/s1': {'name':'Synthetic child','centerId':'c1','parentId':'p1','teacherId':'t1','therapistIds':[]},
            'students/s1/medicalProfile/main': {'medications':[{'id':'med1','name':'Test medication','times':['23:30']}]},
            'panicAlerts/alert': {'studentId':'s1','centerId':'c1','parentId':'p1','reportedBy':{'uid':'t1'},'location':'Test room', 'timestamp':self.now.isoformat(),'status':'active','deliveryStatus':'pending'}})
        self.patches = [patch('firebase_admin.firestore.transactional', transactional),
            patch('panic_delivery.get_db', return_value=self.db),
            patch('medication_monitor.get_db', return_value=self.db),
            patch('medication_monitor.is_placeholder_mode', return_value=False)]
        for item in self.patches: item.start()

    def tearDown(self):
        for item in reversed(self.patches): item.stop()

    def test_midnight_dose_alerts_and_repeated_scans_do_not_duplicate(self):
        self.assertEqual(check_missed_medication_doses(self.now), 1)
        key = 'students/s1/medicationAdministrations/' + dose_id('s1','med1','2026-10-05','23:30')
        self.assertEqual(self.db.data[key]['status'], 'missed')
        notifications = [path for path in self.db.data if path.startswith('notifications/')]
        self.assertEqual(len(notifications), 2)
        self.assertEqual(check_missed_medication_doses(self.now), 0)
        self.assertEqual(len([path for path in self.db.data if path.startswith('notifications/')]), 2)

    def test_outage_backlog_catches_up_and_failure_does_not_advance_cursor(self):
        self.db.data['systemState/medicationMonitor'] = {'checkedThrough': (self.now - timedelta(days=10)).isoformat()}
        self.db.fail_commit = True
        check_missed_medication_doses(self.now)
        self.assertEqual(self.db.data['systemState/medicationMonitor']['checkedThrough'], (self.now - timedelta(days=10)).isoformat())
        self.db.fail_commit = False
        first = check_missed_medication_doses(self.now)
        second = check_missed_medication_doses(self.now)
        self.assertGreater(first, 0)
        self.assertGreater(second, 0)
        self.assertEqual(self.db.data['systemState/medicationMonitor']['checkedThrough'], self.now.isoformat())

    def test_administered_dose_is_not_reported_missed(self):
        key = 'students/s1/medicationAdministrations/' + dose_id('s1','med1','2026-10-05','23:30')
        self.db.data[key] = {'status':'administered'}
        self.assertEqual(check_missed_medication_doses(self.now), 0)

    def test_panic_failure_retries_deduplicates_and_preserves_read_state(self):
        reference = self.db.collection('panicAlerts').document('alert')
        self.db.fail_commit = True
        result = dispatch_alert(self.db, reference, self.now)
        self.assertIn(result['deliveryStatus'], ('pending', 'retry'))
        self.assertEqual(len([path for path in self.db.data if path.startswith('notifications/')]), 0)
        self.db.fail_commit = False
        self.assertEqual(process_pending_alerts(self.now + timedelta(seconds=3)), 1)
        self.assertEqual(self.db.data['panicAlerts/alert']['deliveryLatencyMs'], 3000)
        self.db.data['notifications/panic-alert-a1']['read'] = True
        self.assertEqual(process_pending_alerts(self.now + timedelta(seconds=4)), 0)
        dispatch_alert(self.db, reference, self.now + timedelta(seconds=5))
        self.assertTrue(self.db.data['notifications/panic-alert-a1']['read'])
        self.assertEqual(len([path for path in self.db.data if path.startswith('notifications/')]), 2)

    def test_measured_connection_outage_recovers_durable_backlog(self):
        reference = self.db.collection('panicAlerts').document('alert')
        reference.update({'timestamp': datetime.now(timezone.utc).isoformat()})
        beginning = time.perf_counter()
        self.db.fail_commit = ConnectionError('Controlled storage network outage')
        result = dispatch_alert(self.db, reference)
        self.assertNotEqual(result['deliveryStatus'], 'delivered')
        time.sleep(3)  # Real elapsed outage, independent of the synthetic clock fixture.
        self.db.fail_commit = False
        self.assertEqual(process_pending_alerts(), 1)
        elapsed = (time.perf_counter() - beginning) * 1000
        delivery = reference.get().to_dict()
        self.assertGreaterEqual(delivery['deliveryLatencyMs'], 2900)
        self.assertEqual(process_pending_alerts(), 0)
        self.assertEqual(len([key for key in self.db.data if key.startswith('notifications/')]), 2)
        print(f'MEASURED_OUTAGE_RECOVERY_MS={elapsed:.2f}; RECORDED_NOTIFICATION_LATENCY_MS={delivery["deliveryLatencyMs"]}; CONTROLLED_CONNECTION_OUTAGE_SECONDS=3')

    def test_stale_failed_dispatch_cannot_reopen_delivered_alert(self):
        reference = self.db.collection('panicAlerts').document('alert')
        original_get = reference.get
        first = True
        self.db.data['panicAlerts/alert']['parentId'] = 'malformed'
        def competing_delivery(*args, **kwargs):
            nonlocal first
            snapshot = original_get(*args, **kwargs)
            if first:
                first = False
                self.db.data['panicAlerts/alert'].update(deliveryStatus='delivered', deliveryLatencyMs=125)
            return snapshot
        with patch.object(reference, 'get', side_effect=competing_delivery):
            result = dispatch_alert(self.db, reference, self.now)
        self.assertEqual(result['deliveryStatus'], 'delivered')
        self.assertEqual(result['deliveryLatencyMs'], 125)

    def test_panic_forged_references_are_not_delivered(self):
        for change in [{'parentId':'p2'}, {'studentId':'missing'}, {'reportedBy':{'uid':'unknown'}}]:
            original = dict(self.db.data['panicAlerts/alert'])
            self.db.data['panicAlerts/alert'].update(change)
            result = dispatch_alert(self.db, self.db.collection('panicAlerts').document('alert'), self.now)
            self.assertEqual(result['deliveryStatus'], 'retry')
            self.db.data['panicAlerts/alert'] = original
        self.assertFalse(any(path.startswith('notifications/') for path in self.db.data))

    def test_recorded_emergency_survives_student_archive_and_reporter_offboarding(self):
        self.db.data['students/s1']['archivedAt'] = self.now.isoformat()
        self.db.data['users/t1']['status'] = 'disabled'
        result = dispatch_alert(self.db,self.db.collection('panicAlerts').document('alert'),self.now)
        self.assertEqual(result['deliveryStatus'],'delivered')

    def test_email_is_separate_and_retries_without_duplicating_successful_send(self):
        self.db.data['panicAlerts/alert']['emailStatus'] = 'pending'
        with patch('utils.email_util.send_panic_email_alert', return_value=False) as email:
            process_pending_emails(self.now)
            self.assertEqual(self.db.data['panicAlerts/alert']['emailStatus'], 'retry')
            process_pending_emails(self.now + timedelta(seconds=1))
            self.assertEqual(email.call_count, 1)
        with patch('utils.email_util.send_panic_email_alert', return_value=True) as email:
            process_pending_emails(self.now + timedelta(seconds=31))
            process_pending_emails(self.now + timedelta(seconds=32))
            self.assertEqual(self.db.data['panicAlerts/alert']['emailStatus'], 'sent')
            email.assert_called_once()

    def test_slow_or_failed_ai_network_does_not_block_safety_delivery(self):
        async def run():
            started = asyncio.Event()
            release = asyncio.Event()
            async def slow_provider(request):
                started.set()
                await release.wait()
                return httpx.Response(503)
            transport = httpx.MockTransport(slow_provider)
            real_client = httpx.AsyncClient
            with patch('routers.ai_insights.httpx.AsyncClient', side_effect=lambda **kwargs: real_client(transport=transport, **kwargs)):
                ai = asyncio.create_task(request_cohere('https://provider.invalid/chat', {}, {}))
                await started.wait()
                beginning = time.perf_counter()
                result = await asyncio.to_thread(dispatch_alert, self.db, self.db.collection('panicAlerts').document('alert'), self.now)
                latency = (time.perf_counter() - beginning) * 1000
                self.assertEqual(result['deliveryStatus'], 'delivered')
                self.assertFalse(ai.done(), 'AI request blocked safety work')
                release.set()
                with self.assertRaises(httpx.HTTPStatusError): await ai
                self.assertLess(latency, 5000)
                print(f'ISOLATED_SAFETY_LATENCY_MS={latency:.2f}; AI_STALLED_UNTIL_DELIVERY=True; SIMULATED_OUTAGE_RECOVERY_MS=3000')
        asyncio.run(run())

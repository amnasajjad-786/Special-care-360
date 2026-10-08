"""Real transactional safety tests. Only the explicit loopback emulator is allowed."""
import os
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from unittest.mock import patch
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client
from panic_delivery import dispatch_alert
from medication_monitor import _commit_missed_dose


@unittest.skipUnless(os.getenv('FIRESTORE_EMULATOR_HOST') == '127.0.0.1:8087', 'Local emulator required')
class SafetyEmulatorTests(unittest.TestCase):
    def setUp(self):
        self.db = Client(project='demo-special-care-safety', credentials=AnonymousCredentials())
        self.student = {'name':'Synthetic','parentId':'p1','centerId':'c1','teacherId':'t1','therapistIds':[]}
        batch = self.db.batch()
        batch.set(self.db.collection('students').document('s1'),self.student)
        for uid,role in [('t1','teacher'),('a1','admin'),('p1','parent')]:
            batch.set(self.db.collection('users').document(uid),{'uid':uid,'role':role,'status':'approved','centerId':'c1'})
        for snapshot in self.db.collection('notifications').stream(): batch.delete(snapshot.reference)
        for snapshot in self.db.collection('students').document('s1').collection('medicationAdministrations').stream(): batch.delete(snapshot.reference)
        self.alert = self.db.collection('panicAlerts').document('alert')
        batch.set(self.alert,{'studentId':'s1','centerId':'c1','parentId':'p1','reportedBy':{'uid':'t1'},'location':'Test','timestamp':datetime.now(timezone.utc).isoformat(),'status':'active','deliveryStatus':'pending'})
        batch.commit()

    def tearDown(self): self.db.close()

    def test_concurrent_dispatch_writes_one_notification_per_recipient(self):
        beginning = time.perf_counter()
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: dispatch_alert(self.db,self.alert),range(4)))
        self.assertTrue(all(result['deliveryStatus']=='delivered' for result in results))
        self.assertEqual(len(list(self.db.collection('notifications').stream())),2)
        latency = self.alert.get().to_dict()['deliveryLatencyMs']
        self.assertGreaterEqual(latency,0)
        print(f'EMULATOR_PANIC_DELIVERY_MS={latency}; CONCURRENT_DISPATCH_WALL_MS={(time.perf_counter()-beginning)*1000:.2f}')

    def test_concurrent_missed_dose_transactions_deduplicate(self):
        reference = self.db.collection('students').document('s1').collection('medicationAdministrations').document('dose')
        dose = {'studentId':'s1','centerId':'c1','parentId':'p1','medicationId':'med1','scheduledTime':'23:30','date':'2026-10-05'}
        targets = [(uid,self.db.collection('notifications').document('dose-'+uid)) for uid in ['a1','p1']]
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: _commit_missed_dose(self.db,reference,targets,dose,'Synthetic','Test'),range(4)))
        self.assertEqual(sum(results),1)
        self.assertEqual(len(list(self.db.collection('notifications').stream())),2)
        self.assertTrue(reference.get().to_dict()['alertSent'])

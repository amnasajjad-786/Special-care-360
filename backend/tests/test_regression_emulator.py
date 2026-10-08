import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from google.cloud.firestore import Client
from google.auth.credentials import AnonymousCredentials
from routers.regression import Observation, save_observation


@unittest.skipUnless(os.getenv('FIRESTORE_EMULATOR_HOST'), 'Local emulator required')
class RealRegressionTransactionTests(unittest.TestCase):
    def test_concurrent_logs_and_retry_preserve_single_alert(self):
        db = Client(project='demo-regression-transactions', credentials=AnonymousCredentials())
        import uuid
        student_id = 's-' + uuid.uuid4().hex
        db.collection('students').document(student_id).set(dict(centerId='c1', parentId='p1', teacherId='t1', therapistIds=['h1']))
        db.collection('students').document(student_id).collection('carePlan').document('main').set({'achievedGoals':[{'id':'g1','title':'Skill','achievedAt':'2026-06-01'}]})
        user = dict(uid='t1',role='teacher',status='approved',centerId='c1')
        bodies = [Observation(studentId=student_id,goalId='g1',centerId='c1',requestId=uuid.uuid4().hex,observedStatus='Failed/Declined') for _ in range(2)]
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda body: save_observation(db,body,user),bodies))
        self.assertCountEqual([r['alertLevel'] for r in results], ['Monitoring','Regression Warning'])
        save_observation(db,bodies[1],user)
        alerts = list(db.collection('regressionAlerts').where('studentId','==',student_id).stream())
        self.assertEqual(len(alerts),1)
        self.assertEqual(alerts[0].to_dict()['alertLevel'],'Regression Warning')
        self.assertEqual(len(list(db.collection('milestoneObservations').where('studentId','==',student_id).stream())),2)
        self.assertEqual(len(list(db.collection('notifications').where('studentId','==',student_id).stream())),1)

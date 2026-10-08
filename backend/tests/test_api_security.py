import asyncio
import copy
import unittest
from unittest.mock import patch, AsyncMock
from fastapi import FastAPI
from fastapi.testclient import TestClient
from routers import auth, students, daily_care, abc_tracker, panic, ai_insights, teletherapy, regression
import middleware.auth_middleware as authentication
from fake_store import Store, transactional

ROUTERS = [auth, students, daily_care, abc_tracker, panic, ai_insights, teletherapy, regression]


class APISecurityTests(unittest.TestCase):
    def setUp(self):
        self.student = {'name': 'Test child', 'centerId': 'c1', 'parentId': 'p1', 'teacherId': 't1', 'therapistIds': ['h1']}
        self.db = Store({'students/s1': self.student, 'centers/c1': {'centerId': 'c1'},
            'students/other': {**self.student, 'centerId': 'c2'},
            'students/s1/medicalProfile/main': {'allergies': []},
            'students/s1/carePlan/main': {'goals': []},
            'teletherapySessions/session': {'studentId': 's1', 'centerId': 'c1', 'parentId': 'p1', 'roomName': 'room'},
            'panicAlerts/alert': {'studentId': 's1', 'centerId': 'c1'},
            'dailyCareJournals/2026-10-06_s1': {'studentId': 's1', 'date': '2026-10-06', 'centerId': 'c1'}})
        for uid, role in [('a1', 'admin'), ('p1', 'parent'), ('p2', 'parent'), ('t1', 'teacher'), ('t2', 'teacher'), ('h1', 'therapist'), ('h2', 'therapist')]:
            self.db.data[f'users/{uid}'] = {'uid': uid, 'role': role, 'status': 'approved', 'centerId': 'c1'}
        self.uid = 'a1'
        self.stack = []
        for target in [authentication, *ROUTERS]:
            self.stack.append(patch.object(target, 'get_db', return_value=self.db))
        self.stack.append(patch.object(authentication, 'verify_token', side_effect=lambda _: {'uid': self.uid, 'email': 'test@example.invalid'}))
        for patcher in self.stack:
            patcher.start()
        self.app = FastAPI()
        for module in ROUTERS:
            self.app.include_router(module.router)
        self.client = TestClient(self.app, raise_server_exceptions=False)
        self.headers = {'Authorization': 'Bearer test'}

    def tearDown(self):
        for patcher in reversed(self.stack):
            patcher.stop()

    def protected_routes(self):
        bodies = {'StudentCreate': {'name': 'Test', 'dob': '2020-01-01', 'diagnosis': 'Test', 'centerId': 'c1', 'parentId': 'p1', 'enrollmentDate': '2026-10-06'},
            'DailyCareSubmit': {'studentId': 's1', 'date': '2026-10-06', 'meals': {}, 'hygiene': {}, 'moodTimeline': [], 'physicalActivity': 'Low', 'submittedBy': 'a1'},
            'ABCIncidentCreate': {'studentId': 's1', 'centerId': 'c1', 'loggedBy': 'a1', 'timestamp': '2026-10-06T10:00:00Z', 'antecedent': {}, 'behavior': {}, 'consequence': {}, 'severity': 1, 'durationMinutes': 1, 'location': 'Test'},
            'PanicAlertCreate': {'studentId': 's1', 'centerId': 'c1', 'reportedBy': {'uid': 'a1'}, 'emergencyType': 'Test', 'location': 'Test'},
            'PanicAlertResolve': {'resolvedBy': 'a1'}, 'NextGoalRequest': {'achieved_goal': {}},
            'Observation': {'studentId':'s1','goalId':'g1','centerId':'c1','requestId':'test','observedStatus':'Achieved'}}
        for route in self.app.routes:
            if not hasattr(route, 'dependant') or route.path in ['/api/auth/register', '/api/auth/profile']:
                continue
            path = route.path.replace('{student_id}', 's1').replace('{date}', '2026-10-06').replace('{alert_id}', 'alert').replace('{uid}', 'p1')
            path += '?sessionId=session' if path.endswith('/token') else ''
            fields = route.dependant.body_params
            body = bodies.get(fields[0].type_.__name__, {}) if fields else None
            yield route, path, body

    def test_every_protected_mounted_route_rejects_pending_missing_disabled_and_forged_profiles(self):
        original = copy.deepcopy(self.db.data['users/a1'])
        for profile in [{**original, 'status': 'pending'}, {**original, 'status': 'disabled'}, {**original, 'uid': 'p1'}, None]:
            if profile is None:
                self.db.data.pop('users/a1', None)
            else:
                self.db.data['users/a1'] = profile
            for route, path, body in self.protected_routes():
                for method in route.methods:
                    with self.subTest(profile=profile, method=method, path=path):
                        response = self.client.request(method, path, json=body, headers=self.headers)
                        self.assertEqual(response.status_code, 403, response.text)
        self.db.data['users/a1'] = original

    def test_every_protected_route_requires_a_token(self):
        for route, path, body in self.protected_routes():
            for method in route.methods:
                with self.subTest(path=path):
                    self.assertEqual(self.client.request(method, path, json=body).status_code, 401)

    def test_child_scoped_reads_deny_other_family_class_therapist_and_center(self):
        paths = ['/api/students/s1', '/api/students/s1/medical', '/api/students/s1/careplan', '/api/daily-care/s1/history', '/api/daily-care/s1/2026-10-06', '/api/abc/incidents/s1', '/api/abc/patterns/s1', '/api/abc/heatmap/s1', '/ai-insights/abc/s1', '/api/teletherapy/token?sessionId=session']
        for uid in ['p2', 't2', 'h2']:
            self.uid = uid
            for path in paths:
                with self.subTest(uid=uid, path=path):
                    self.assertEqual(self.client.get(path, headers=self.headers).status_code, 403)
        self.uid = 'a1'
        self.db.data['users/a1']['centerId'] = 'c2'
        for path in paths:
            self.assertEqual(self.client.get(path, headers=self.headers).status_code, 403, path)

    def test_clinical_writes_deny_other_center_and_assignment(self):
        for uid in ['h2', 'a1']:
            self.uid = uid
            if uid == 'a1': self.db.data['users/a1']['centerId'] = 'c2'
            for path in ['/api/students/s1', '/api/students/s1/medical', '/api/students/s1/careplan']:
                self.assertEqual(self.client.put(path, headers=self.headers, json={}).status_code, 403, path)
            for path in ['/ai-insights/iep/s1', '/ai-insights/iep/s1/next-goal']:
                body = {'achieved_goal': {}} if path.endswith('next-goal') else None
                self.assertEqual(self.client.post(path, headers=self.headers, json=body).status_code, 403)

    def test_care_abc_and_panic_creation_enforce_target_and_stamp_real_actor(self):
        journal = {'studentId':'s1','date':'2026-10-06','meals':{},'hygiene':{},'moodTimeline':[],'physicalActivity':'Low','submittedBy':'forged'}
        abc = {'studentId':'s1','centerId':'c2','loggedBy':'forged','timestamp':'2026-10-06T10:00:00Z','antecedent':{},'behavior':{},'consequence':{},'severity':1,'durationMinutes':1,'location':'Test'}
        panic_body = {'studentId':'s1','centerId':'c1','reportedBy':{'uid':'forged'},'emergencyType':'Test','location':'Test'}
        for uid in ['t2','h2','p2']:
            self.uid = uid
            for path, body in [('/api/daily-care',journal),('/api/abc/incidents',abc),('/api/panic/alert',panic_body)]:
                self.assertEqual(self.client.post(path,json=body,headers=self.headers).status_code,403,path)
        self.uid = 't1'
        response = self.client.post('/api/abc/incidents',json=abc,headers=self.headers)
        self.assertEqual(response.status_code,200,response.text)
        saved = self.db.data['abcIncidents/'+response.json()['id']]
        self.assertEqual(saved['loggedBy'],'t1')
        self.assertEqual(saved['centerId'],'c1')
        for bad in ['missing','bad/reference']:
            self.assertIn(self.client.post('/api/daily-care',json={**journal,'studentId':bad},headers=self.headers).status_code,[400,404])

    def test_list_filters_class_assignment_family_and_rejects_other_center(self):
        for uid in ['p2', 't2', 'h2']:
            self.uid = uid
            self.assertEqual(self.client.get('/api/students?centerId=c1', headers=self.headers).json(), [])
        self.uid = 'a1'
        self.assertEqual(self.client.get('/api/students?centerId=c2', headers=self.headers).status_code, 403)
        self.assertEqual(self.client.get('/api/panic/alerts?centerId=c2', headers=self.headers).status_code, 403)

    def test_history_is_not_shadowed_by_date(self):
        self.uid = 'p1'
        response = self.client.get('/api/daily-care/s1/history', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)

    def test_careplan_api_preserves_independent_history_and_rejects_stale_edit(self):
        self.uid = 'h1'
        self.db.data['students/s1/carePlan/main']['achievedGoals'] = [{'id':'previous'}]
        with patch('firebase_admin.firestore.transactional', transactional):
            response = self.client.put('/api/students/s1/careplan',json={'goals':[],'expectedVersion':0},headers=self.headers)
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(self.db.data['students/s1/carePlan/main']['achievedGoals'],[{'id':'previous'}])
            response = self.client.put('/api/students/s1/careplan',json={'goals':[{'id':'stale'}],'expectedVersion':0},headers=self.headers)
            self.assertEqual(response.status_code,409,response.text)
            self.assertEqual(self.db.data['students/s1/carePlan/main']['goals'],[])

    def test_enrollment_is_atomic_and_validates_references(self):
        body = {'name': 'Test', 'dob': '2020-01-01', 'diagnosis': 'Test', 'centerId': 'c1', 'parentId': 'p1', 'teacherId': 't1', 'therapistIds': ['h1'], 'enrollmentDate': '2026-10-06'}
        before = copy.deepcopy(self.db.data)
        self.db.fail_commit = True
        self.assertEqual(self.client.post('/api/students', json=body, headers=self.headers).status_code, 500)
        self.assertEqual(self.db.data, before)
        self.db.fail_commit = False
        for bad in ['missing', 'p1/forged', 'h1']:
            self.assertEqual(self.client.post('/api/students', json={**body, 'parentId': bad}, headers=self.headers).status_code, 400)
            self.assertEqual(self.db.data, before)
        response = self.client.post('/api/students', json=body, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        path = 'students/' + response.json()['id']
        self.assertIn(path, self.db.data)
        self.assertIn(path + '/medicalProfile/main', self.db.data)
        self.assertIn(path + '/carePlan/main', self.db.data)

    def test_profile_endpoint_cannot_forge_identity_or_overwrite_account(self):
        self.assertEqual(self.client.post('/api/auth/profile', json={'uid': 'p1', 'role': 'admin'}, headers=self.headers).status_code, 409)
        self.db.data.pop('users/a1')
        self.assertEqual(self.client.post('/api/auth/profile', json={'uid': 'p1', 'role': 'admin', 'centerId': 'c1'}, headers=self.headers).status_code, 403)
        self.assertNotIn('users/a1', self.db.data)

    def test_offboarding_revokes_profile_and_identity_and_denies_other_center(self):
        with patch('firebase_admin.auth.update_user') as disable, patch('firebase_admin.auth.revoke_refresh_tokens') as revoke:
            response = self.client.post('/api/auth/offboard/t1', headers=self.headers)
            self.assertEqual(response.status_code, 200)
            disable.assert_called_once_with('t1', disabled=True)
            revoke.assert_called_once_with('t1')
        self.uid = 't1'
        self.assertEqual(self.client.get('/api/students/s1', headers=self.headers).status_code, 403)
        self.uid = 'a1'
        self.db.data['users/h1']['centerId'] = 'c2'
        self.assertEqual(self.client.post('/api/auth/offboard/h1', headers=self.headers).status_code, 403)

    def test_empty_context_returns_manual_fallback_without_any_provider_key(self):
        self.uid = 'h1'
        with patch.dict('os.environ', {}, clear=True), patch.object(ai_insights, 'request_cohere', new_callable=AsyncMock) as provider:
            response = self.client.post('/ai-insights/iep/s1', headers=self.headers)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertFalse(response.json()['sufficientData'])
            provider.assert_not_called()

    def test_cohere_only_configuration_generates_and_persists_no_secret(self):
        self.uid = 'h1'
        self.db.data['students/s1']['diagnosis'] = 'Test needs'
        with patch.dict('os.environ', {'COHERE_API_KEY': 'synthetic-key'}, clear=True), patch.object(ai_insights, 'request_cohere', new_callable=AsyncMock, return_value={'text': '{"summary":"Test plan", "goals": []}'}) as provider:
            response = self.client.post('/ai-insights/iep/s1', headers=self.headers)
            self.assertEqual(response.status_code, 200, response.text)
            provider.assert_awaited_once()

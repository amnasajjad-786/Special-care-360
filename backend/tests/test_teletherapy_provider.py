import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from routers import teletherapy
from fake_store import Store


class TeletherapyProviderTests(unittest.TestCase):
    def setUp(self):
        self.db = Store({
            'students/s1': {'centerId': 'c1', 'parentId': 'p1', 'therapistIds': ['h1']},
            'teletherapySessions/session': {
                'studentId': 's1', 'centerId': 'c1', 'parentId': 'p1', 'roomName': 'demo-room',
            },
        })

    def user(self, uid, role):
        return {'uid': uid, 'role': role, 'centerId': 'c1', 'status': 'approved'}

    def test_parent_and_therapist_receive_same_public_room(self):
        with patch.dict(os.environ, {'TELETHERAPY_PROVIDER': 'jitsi'}), patch.object(teletherapy, 'get_db', return_value=self.db):
            parent = teletherapy.mint_jaas_token('session', self.user('p1', 'parent'))
            therapist = teletherapy.mint_jaas_token('session', self.user('h1', 'therapist'))
        self.assertEqual(parent['room'], therapist['room'])
        self.assertEqual(parent['domain'], 'meet.jit.si')
        self.assertIsNone(parent['token'])
        self.assertFalse(parent['moderator'])
        self.assertTrue(therapist['moderator'])

    def test_public_mode_still_denies_other_parent(self):
        with patch.dict(os.environ, {'TELETHERAPY_PROVIDER': 'jitsi'}), patch.object(teletherapy, 'get_db', return_value=self.db):
            with self.assertRaises(HTTPException) as error:
                teletherapy.mint_jaas_token('session', self.user('p2', 'parent'))
        self.assertEqual(error.exception.status_code, 403)

    def test_jaas_mode_does_not_fall_back_to_public_room(self):
        with patch.dict(os.environ, {'TELETHERAPY_PROVIDER': 'jaas'}), patch.object(teletherapy, 'get_db', return_value=self.db), patch.object(teletherapy, 'jaas_config', return_value=None):
            with self.assertRaises(HTTPException) as error:
                teletherapy.mint_jaas_token('session', self.user('p1', 'parent'))
        self.assertEqual(error.exception.status_code, 503)

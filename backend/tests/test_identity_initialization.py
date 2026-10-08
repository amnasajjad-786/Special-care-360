import unittest
from unittest.mock import patch
import firebase_admin_init as initialization


class IdentityInitializationTests(unittest.TestCase):
    def test_placeholder_mode_never_accepts_arbitrary_bearer_text(self):
        with patch.object(initialization,'_placeholder_mode',True):
            with self.assertRaises(ValueError): initialization.verify_token('pretend-admin')

    def test_missing_credentials_fail_closed_by_default(self):
        with patch.object(initialization,'_app',None), patch.object(initialization,'_placeholder_mode',False), patch('firebase_admin_init.os.path.exists',return_value=False), patch.dict('os.environ',{},clear=True):
            with self.assertRaises(RuntimeError): initialization.init_firebase()

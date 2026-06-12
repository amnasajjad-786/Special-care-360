import os
import firebase_admin
from firebase_admin import credentials, firestore, auth as firebase_auth

_app = None


def init_firebase():
    """Initialize Firebase Admin SDK using serviceAccountKey.json."""
    global _app
    if _app is not None:
        return _app

    # Look for serviceAccountKey.json in the backend directory
    key_path = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

    if not os.path.exists(key_path):
        raise FileNotFoundError(
            f"\n\n[Firebase] serviceAccountKey.json not found at: {key_path}\n"
            "Please download your service account key from:\n"
            "  Firebase Console → Special Care 360 → Project Settings → Service accounts\n"
            "  → 'Generate new private key' → save as backend/serviceAccountKey.json\n"
        )

    cred = credentials.Certificate(key_path)
    _app = firebase_admin.initialize_app(cred)
    print("[Firebase] [OK] Initialized with serviceAccountKey.json")
    return _app


def get_db():
    """Returns Firestore client. Raises if Firebase is not initialized."""
    if _app is None:
        raise RuntimeError(
            "Firebase not initialized. Call init_firebase() first (done in main.py startup)."
        )
    return firestore.client()


def verify_token(token: str) -> dict:
    """Verify a Firebase ID token and return decoded claims."""
    if _app is None:
        raise RuntimeError("Firebase not initialized.")
    return firebase_auth.verify_id_token(token)

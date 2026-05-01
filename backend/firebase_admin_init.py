import firebase_admin
from firebase_admin import credentials, firestore, auth

# ─────────────────────────────────────────────────────────────
#  PLACEHOLDER: replace the dict below with your real service
#  account JSON values once you create a Firebase project.
# ─────────────────────────────────────────────────────────────
PLACEHOLDER_CREDENTIALS = {
    "type": "service_account",
    "project_id": "special-care-360",
    "private_key_id": "placeholder",
    "private_key": "-----BEGIN RSA PRIVATE KEY-----\nPLACEHOLDER\n-----END RSA PRIVATE KEY-----\n",
    "client_email": "firebase-adminsdk@special-care-360.iam.gserviceaccount.com",
    "client_id": "000000000000000000000",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/placeholder",
}

_app = None


def init_firebase():
    global _app
    if _app is not None:
        return _app

    try:
        import serviceAccountKey  # type: ignore  # put real key here
        cred = credentials.Certificate(serviceAccountKey.config)
    except ImportError:
        # Dev mode – no real credentials yet; Firestore calls will fail gracefully
        print("[WARNING] Using placeholder Firebase credentials. Real Firestore/Auth calls will fail.")
        print("   Place your serviceAccountKey.json and update firebase_admin_init.py when ready.")
        try:
            cred = credentials.ApplicationDefault()
        except Exception:
            # Absolutely no credentials – set app to a sentinel so we don't crash on startup
            _app = "NO_CREDENTIALS"
            return _app

    _app = firebase_admin.initialize_app(cred)
    return _app


def get_db():
    """Returns Firestore client or raises a clear error in placeholder mode."""
    if _app == "NO_CREDENTIALS":
        raise RuntimeError("Firebase not configured. Add real credentials to backend/serviceAccountKey.json")
    return firestore.client()


def verify_token(token: str) -> dict:
    """Verify a Firebase ID token and return decoded claims."""
    if _app == "NO_CREDENTIALS":
        raise RuntimeError("Firebase not configured.")
    return auth.verify_id_token(token)

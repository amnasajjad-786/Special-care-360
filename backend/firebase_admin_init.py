import os
import json
import logging
import uuid
import firebase_admin
from firebase_admin import credentials, firestore, auth as firebase_auth

# Global app instance
_app = None
_placeholder_mode = False
_mock_db = None

# ─── Mock Firestore implementation ─────────────────────────────────────────────

class MockDocument:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return self._data

    def get(self):
        return self

class MockDocumentReference:
    def __init__(self, collection_name, doc_id, db_instance):
        self.collection_name = collection_name
        self.id = doc_id
        self.db = db_instance

    def set(self, data):
        if self.collection_name not in self.db.data:
            self.db.data[self.collection_name] = {}
        self.db.data[self.collection_name][self.id] = data
        self.db.save()

    def update(self, updates):
        if self.collection_name not in self.db.data:
            self.db.data[self.collection_name] = {}
        if self.id not in self.db.data[self.collection_name]:
            self.db.data[self.collection_name][self.id] = {}
        self.db.data[self.collection_name][self.id].update(updates)
        self.db.save()

    def get(self):
        col_data = self.db.data.get(self.collection_name, {})
        doc_data = col_data.get(self.id)
        return MockDocument(self.id, doc_data)

class MockQuery:
    def __init__(self, collection_name, db_instance, filters=None):
        self.collection_name = collection_name
        self.db = db_instance
        self.filters = filters or []
        self._order_by = None

    def where(self, field, op, value):
        new_filters = list(self.filters)
        new_filters.append((field, op, value))
        return MockQuery(self.collection_name, self.db, new_filters)

    def order_by(self, field, direction="ASCENDING"):
        self._order_by = (field, direction)
        return self

    def stream(self):
        col_data = self.db.data.get(self.collection_name, {})
        results = []
        for doc_id, doc_data in col_data.items():
            match = True
            for field, op, value in self.filters:
                val = doc_data.get(field)
                if op == "==":
                    if val != value:
                        match = False
                        break
                elif op == ">":
                    if not val or val <= value:
                        match = False
                        break
                elif op == "<":
                    if not val or val >= value:
                        match = False
                        break
            if match:
                results.append(MockDocument(doc_id, doc_data))

        if self._order_by:
            field, direction = self._order_by
            reverse = (direction == "DESCENDING")
            results.sort(key=lambda d: str(d.to_dict().get(field, "")), reverse=reverse)

        return results

class MockCollection:
    def __init__(self, name, db_instance):
        self.name = name
        self.db = db_instance

    def document(self, doc_id=None):
        if not doc_id:
            doc_id = str(uuid.uuid4())
        return MockDocumentReference(self.name, doc_id, self.db)

    def add(self, data):
        doc_id = str(uuid.uuid4())
        ref = MockDocumentReference(self.name, doc_id, self.db)
        ref.set(data)
        return ref

    def where(self, field, op, value):
        return MockQuery(self.name, self.db, [(field, op, value)])

    def stream(self):
        return MockQuery(self.name, self.db).stream()

    def order_by(self, field, direction="ASCENDING"):
        return MockQuery(self.name, self.db).order_by(field, direction)

class MockFirestoreClient:
    def __init__(self):
        self.filepath = os.path.join(os.path.dirname(__file__), "mock_db.json")
        self.data = {}
        self.load()

    def load(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r") as f:
                    self.data = json.load(f)
            except Exception:
                self.data = {}
        else:
            self.data = {
                "centers": {
                    "demo-center-001": {
                        "name": "Demo Center",
                        "centerId": "demo-center-001",
                        "createdAt": "2026-06-13T00:00:00Z"
                    }
                },
                "users": {
                    "placeholder-uid": {
                        "uid": "placeholder-uid",
                        "name": "Demo Admin",
                        "email": "admin@demo.com",
                        "role": "admin",
                        "centerId": "demo-center-001",
                        "status": "approved"
                    },
                    "teacher-uid": {
                        "uid": "teacher-uid",
                        "name": "Demo Teacher",
                        "email": "teacher@demo.com",
                        "role": "teacher",
                        "centerId": "demo-center-001",
                        "status": "approved"
                    },
                    "therapist-uid": {
                        "uid": "therapist-uid",
                        "name": "Demo Therapist",
                        "email": "therapist@demo.com",
                        "role": "therapist",
                        "centerId": "demo-center-001",
                        "status": "approved"
                    }
                }
            }
            self.save()

    def save(self):
        try:
            with open(self.filepath, "w") as f:
                json.dump(self.data, f, indent=2)
        except Exception:
            pass

    def collection(self, name):
        return MockCollection(name, self)

# ─── Firebase Init & Auth helper ───────────────────────────────────────────────

def init_firebase():
    """
    Initialize Firebase Admin SDK using serviceAccountKey.json.
    Falls back to local mock database client if credentials file is missing.
    """
    global _app, _placeholder_mode, _mock_db

    if _app is not None or _placeholder_mode:
        return _app

    key_path = os.path.join(
        os.path.dirname(__file__),
        "serviceAccountKey.json"
    )

    if not os.path.exists(key_path):
        logging.warning("\n"
            "┌──────────────────────────────────────────────────────────────┐\n"
            "│ [Firebase] serviceAccountKey.json NOT found!                 │\n"
            "│ Backend is starting in -> PLACEHOLDER / MOCK DATABASE MODE   │\n"
            "│ To use real Firebase, save your key under:                   │\n"
            "│ backend/serviceAccountKey.json                               │\n"
            "└──────────────────────────────────────────────────────────────┘\n"
        )
        _placeholder_mode = True
        _mock_db = MockFirestoreClient()
        return None

    try:
        cred = credentials.Certificate(key_path)
        _app = firebase_admin.initialize_app(cred)
        logging.info("[Firebase] Initialized successfully with Service Account Key.")
        return _app
    except Exception as e:
        logging.error(f"[Firebase] Initialization failed: {e}. Falling back to Placeholder Mode.")
        _placeholder_mode = True
        _mock_db = MockFirestoreClient()
        return None

def get_app():
    """Ensure Firebase app or placeholder mode is initialized and return it"""
    if _app is None and not _placeholder_mode:
        init_firebase()
    return _app

def get_db():
    """Returns Firestore client or MockFirestore client depending on configuration"""
    global _mock_db
    if _app is None and not _placeholder_mode:
        init_firebase()

    if _placeholder_mode:
        if _mock_db is None:
            _mock_db = MockFirestoreClient()
        return _mock_db

    return firestore.client(app=_app)

def verify_token(token: str) -> dict:
    """Verify Firebase ID token and return decoded claims (with mock support)"""
    if _app is None and not _placeholder_mode:
        init_firebase()

    if _placeholder_mode:
        role = "admin"
        if "teacher" in token.lower():
            role = "teacher"
        elif "therapist" in token.lower():
            role = "therapist"
        elif "parent" in token.lower():
            role = "parent"

        return {
            "uid": f"{role}-uid",
            "name": f"Mock {role.capitalize()}",
            "email": f"{role}@demo.com",
            "role": role,
            "centerId": "demo-center-001",
            "status": "approved"
        }

    try:
        return firebase_auth.verify_id_token(token)
    except Exception as e:
        logging.error(f"[Firebase] Token verification failed: {e}")
        raise
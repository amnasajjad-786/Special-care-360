"""Server-side entries for the append-only audit trail (WBS 2.4.3).

The browser records its own actions (frontend/lib/audit.ts). Actions the API
performs on a user's behalf are recorded here with ``source: "api"``. The
Admin SDK bypasses the rules, so this is the only writer allowed to use that
source value.

Recording is best-effort by design: an audit failure must never undo or block
the care action it describes. Failures are logged for operators.
"""
import logging
from datetime import datetime, timezone

from firebase_admin_init import MockFirestoreClient

try:  # Real Firestore: let the server stamp the time.
    from firebase_admin import firestore as _firestore
    _SERVER_TIME = _firestore.SERVER_TIMESTAMP
except Exception:  # pragma: no cover - mock mode without the SDK
    _SERVER_TIME = None

logger = logging.getLogger("audit")


def record_audit(db, user: dict, action: str, target_type: str, target_id: str = "",
                 student_id=None, summary: str = "", center_id=None) -> None:
    try:
        entry = {
            "centerId": center_id or user.get("centerId") or "",
            "actorUid": user.get("uid", ""),
            "actorName": str(user.get("name") or "")[:120],
            "actorRole": user.get("role", ""),
            "action": action[:80],
            "targetType": target_type[:40],
            "targetId": str(target_id or "")[:200],
            "studentId": student_id,
            "summary": summary[:500],
            "source": "api",
            # The local JSON mock cannot store a server-timestamp sentinel.
            "at": datetime.now(timezone.utc).isoformat() if _SERVER_TIME is None or isinstance(db, MockFirestoreClient) else _SERVER_TIME,
        }
        db.collection("auditLogs").add(entry)
    except Exception:
        logger.exception("audit entry not recorded: %s", action)

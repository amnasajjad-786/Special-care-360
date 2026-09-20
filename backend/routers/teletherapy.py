"""
8x8 JaaS token minting for teletherapy video rooms.

WHY THIS EXISTS
---------------
The public meet.jit.si will not start a conference until a moderator joins, and
becoming one requires a Jitsi account, so a therapist and a guardian can both
load the room and still never be connected. JaaS fixes that by letting us say
who the moderator is, in a signed token.

WHY IT IS SERVER-SIDE
---------------------
A JaaS token is signed with an RSA private key. That key must never reach the
browser: anyone holding it can mint a moderator token for any room in the
tenant. So the client asks this endpoint for a token scoped to one session, and
the key stays here.

Authorisation mirrors firestore.rules rather than trusting the caller: staff
must be at the session's centre, and a guardian must be the one named on the
session. Moderator is granted to the clinician only.

CONFIGURATION
-------------
    JAAS_APP_ID           vpaas-magic-cookie-xxxxxxxx  (the tenant)
    JAAS_API_KEY_ID       the kid shown next to the key in the JaaS console
    JAAS_PRIVATE_KEY_PATH path to the downloaded .pk file   (preferred)
    JAAS_PRIVATE_KEY      or the PEM inline, with \\n for newlines

If these are unset the endpoint returns 503 and the frontend falls back to the
plain meet.jit.si embed, which is fine for a click-through demo.
"""

import os
import time
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from jose import jwt

from firebase_admin_init import get_db
from middleware.auth_middleware import get_current_user

router = APIRouter(prefix="/api/teletherapy", tags=["teletherapy"])

# A token only needs to outlive the session it was minted for.
TOKEN_TTL_SECONDS = 4 * 60 * 60


def _private_key() -> str | None:
    path = os.getenv("JAAS_PRIVATE_KEY_PATH")
    if path:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return fh.read()
        except OSError as err:
            logging.error("[JaaS] could not read JAAS_PRIVATE_KEY_PATH: %s", err)
            return None

    inline = os.getenv("JAAS_PRIVATE_KEY")
    if inline:
        # .env files cannot hold real newlines, so accept the escaped form.
        return inline.replace("\\n", "\n")
    return None


def jaas_config() -> dict | None:
    app_id = os.getenv("JAAS_APP_ID")
    kid = os.getenv("JAAS_API_KEY_ID")
    key = _private_key()
    if not (app_id and kid and key):
        return None
    return {"app_id": app_id, "kid": kid, "key": key}


@router.get("/token")
async def mint_jaas_token(
    sessionId: str = Query(..., description="teletherapySessions document id"),
    current_user: dict = Depends(get_current_user),
):
    config = jaas_config()
    if not config:
        raise HTTPException(
            status_code=503,
            detail="JaaS is not configured on this server. Set JAAS_APP_ID, "
                   "JAAS_API_KEY_ID and JAAS_PRIVATE_KEY_PATH.",
        )

    db = get_db()
    snap = db.collection("teletherapySessions").document(sessionId).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Session not found")
    session = snap.to_dict() or {}

    role = current_user.get("role", "")
    uid = current_user.get("uid", "")

    is_clinician = role in ("therapist", "admin", "teacher")
    is_staff_here = is_clinician and session.get("centerId") == current_user.get("centerId")
    is_the_guardian = role == "parent" and session.get("parentId") == uid

    if not (is_staff_here or is_the_guardian):
        raise HTTPException(status_code=403, detail="Not a participant in this session")

    # The clinician runs the session; the guardian joins it.
    moderator = role in ("therapist", "admin")

    # JaaS namespaces every room under the tenant.
    room = session.get("roomName") or "sc360-{}".format(sessionId)
    now = int(time.time())

    claims = {
        "aud": "jitsi",
        "iss": "chat",
        "sub": config["app_id"],
        "room": room,
        "exp": now + TOKEN_TTL_SECONDS,
        "nbf": now - 10,
        "context": {
            "user": {
                "id": uid,
                "name": current_user.get("name") or "Participant",
                "email": current_user.get("email") or "",
                "moderator": "true" if moderator else "false",
            },
            "features": {
                # Recording a therapy session is a clinical and consent decision,
                # not a default. Left off deliberately.
                "livestreaming": "false",
                "recording": "false",
                "transcription": "false",
                "outbound-call": "false",
            },
        },
    }

    try:
        token = jwt.encode(
            claims,
            config["key"],
            algorithm="RS256",
            headers={"kid": config["kid"], "typ": "JWT"},
        )
    except Exception as err:
        logging.error("[JaaS] token signing failed: %s", err)
        raise HTTPException(status_code=500, detail="Could not sign the video token")

    return {
        "token": token,
        "appId": config["app_id"],
        "room": "{}/{}".format(config["app_id"], room),
        "domain": os.getenv("JAAS_DOMAIN", "8x8.vc"),
        "moderator": moderator,
        "expiresAt": claims["exp"],
    }

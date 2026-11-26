"""Private file storage on Firebase Storage (Google Cloud Storage).

Used by student documents and home-plan progress videos. Objects are never
public: `storage.rules` denies all browser access, and only this API — which
re-checks the caller's access to the child on every call — reads or writes
them, handing out five-minute signed links for downloads and playback.

The bucket is `FIREBASE_STORAGE_BUCKET`, defaulting to the project's default
bucket `<project-id>.firebasestorage.app`.
"""
import logging
import os
import re
from datetime import timedelta
from urllib.parse import quote

from fastapi import HTTPException

from firebase_admin_init import get_app, is_placeholder_mode

logger = logging.getLogger(__name__)
LINK_LIFETIME = timedelta(minutes=5)
_KEY = re.compile(r"[A-Za-z0-9][A-Za-z0-9/_.-]{0,250}")


def _bucket():
    if is_placeholder_mode():
        raise HTTPException(503, "File storage requires the Firebase service account.")
    from firebase_admin import storage

    app = get_app()
    name = os.getenv("FIREBASE_STORAGE_BUCKET", "").strip() or f"{getattr(app, 'project_id', '')}.firebasestorage.app"
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{2,220}", name) or name.startswith("."):
        raise HTTPException(503, "File storage has not been configured.")
    try:
        return storage.bucket(name, app=app)
    except Exception as exc:
        logger.exception("Could not open storage bucket %s", name)
        raise HTTPException(503, "File storage has not been configured.") from exc


def _blob(key: str):
    if not _KEY.fullmatch(key) or ".." in key:
        raise HTTPException(400, "Invalid file reference.")
    return _bucket().blob(key)


def put(key: str, data: bytes, content_type: str) -> None:
    blob = _blob(key)
    blob.cache_control = "private, max-age=0"
    try:
        # if_generation_match=0: never overwrite an existing object.
        blob.upload_from_string(data, content_type=content_type, if_generation_match=0, timeout=180)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Upload failed for %s", key)
        raise HTTPException(502, "Could not save the file in private storage.") from exc


def delete(key: str) -> None:
    """Delete an object; a missing object counts as deleted."""
    from google.api_core.exceptions import NotFound

    try:
        _blob(key).delete(timeout=30)
    except NotFound:
        return
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Delete failed for %s", key)
        raise HTTPException(502, "Could not delete the stored file.") from exc


def read(key: str, max_bytes: int) -> bytes:
    try:
        data = _blob(key).download_as_bytes(timeout=180)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, "Could not read the stored file.") from exc
    if not 0 < len(data) <= max_bytes:
        raise HTTPException(502, "Stored file has an unexpected size.")
    return data


def signed_url(key: str, download_name: str | None = None) -> str:
    """Five-minute GET link. With download_name the browser saves the file."""
    disposition = None
    if download_name:
        disposition = f"attachment; filename*=UTF-8''{quote(download_name)}"
    try:
        return _blob(key).generate_signed_url(
            version="v4", expiration=LINK_LIFETIME, method="GET", response_disposition=disposition,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Signing failed for %s", key)
        raise HTTPException(502, "Could not create a download link.") from exc

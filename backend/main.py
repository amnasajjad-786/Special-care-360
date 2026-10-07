import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin_init import init_firebase, is_placeholder_mode
from medication_monitor import check_missed_medication_doses
from routers import auth, students, daily_care, abc_tracker, panic, ai_insights, teletherapy, therapy_sessions, therapy_timeline
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# Initialize Firebase (non-blocking — app starts even in placeholder mode)
init_firebase()


async def _medication_monitor_loop():
    interval = max(30, int(os.getenv("MEDICATION_MONITOR_INTERVAL_SECONDS", "60")))
    while True:
        try:
            await asyncio.to_thread(check_missed_medication_doses)
        except Exception:
            logger.exception("Medication missed-dose check failed.")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(_app):
    monitor_task = None
    if is_placeholder_mode():
        logger.warning("Missed-dose monitoring is disabled in placeholder Firestore mode.")
    else:
        monitor_task = asyncio.create_task(_medication_monitor_loop())

    try:
        yield
    finally:
        if monitor_task:
            monitor_task.cancel()
            try:
                await monitor_task
            except asyncio.CancelledError:
                pass


app = FastAPI(
    title="Special Care 360 API",
    description="HIPAA-compliant platform for special education centers",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Set ALLOWED_ORIGINS in your .env file as a comma-separated list.
# Example: ALLOWED_ORIGINS=http://localhost:3000,https://yourapp.vercel.app
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all routers
app.include_router(auth.router)
app.include_router(students.router)
app.include_router(daily_care.router)
app.include_router(abc_tracker.router)
app.include_router(panic.router)
app.include_router(ai_insights.router)
app.include_router(teletherapy.router)
app.include_router(therapy_sessions.router)
app.include_router(therapy_timeline.router)


@app.get("/")
async def root():
    return {
        "app": "Special Care 360 API",
        "status": "running",
        "version": "1.0.0",
        "docs": "/docs",
        "allowed_origins": ALLOWED_ORIGINS,
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}

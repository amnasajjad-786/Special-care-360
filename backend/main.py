import asyncio
import logging
import os
from contextlib import asynccontextmanager
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin_init import init_firebase, is_placeholder_mode
from medication_monitor import check_missed_medication_doses
from panic_delivery import process_pending_alerts, process_pending_emails
from routers import auth, students, daily_care, abc_tracker, panic, ai_insights, teletherapy, regression, therapy_sessions, therapy_timeline
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# Reject missing production credentials; local mocks require an explicit opt-in.
init_firebase()


async def _medication_monitor_loop(executor):
    interval = max(30, int(os.getenv("MEDICATION_MONITOR_INTERVAL_SECONDS", "60")))
    while True:
        try:
            await asyncio.get_running_loop().run_in_executor(executor, check_missed_medication_doses)
        except Exception:
            logger.exception("Medication missed-dose check failed.")
        await asyncio.sleep(interval)


async def _panic_delivery_loop(executor):
    while True:
        try:
            await asyncio.get_running_loop().run_in_executor(executor, process_pending_alerts)
        except Exception:
            logger.exception("Panic outbox unavailable; will retry")
        await asyncio.sleep(2)


async def _panic_email_loop(executor):
    while True:
        try:
            await asyncio.get_running_loop().run_in_executor(executor, process_pending_emails)
        except Exception:
            logger.exception("Panic email outbox unavailable; will retry")
        await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(_app):
    # Safety scans have capacity independent of request/AI/authentication work.
    executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="safety")
    monitor_task = None
    delivery_task = None
    email_task = None
    if is_placeholder_mode():
        logger.warning("Missed-dose monitoring is disabled in placeholder Firestore mode.")
    else:
        ZoneInfo("Asia/Karachi")  # Fail startup on missing timezone data, not silently disable safety scans.
        monitor_task = asyncio.create_task(_medication_monitor_loop(executor))
        delivery_task = asyncio.create_task(_panic_delivery_loop(executor))
        email_task = asyncio.create_task(_panic_email_loop(executor))

    try:
        yield
    finally:
        for task in (monitor_task, delivery_task, email_task):
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(
    title="Special Care 360 API",
    description="Special education care coordination platform",
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
app.include_router(regression.router)
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

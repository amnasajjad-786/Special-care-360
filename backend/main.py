from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin_init import init_firebase
from routers import auth, students, daily_care, abc_tracker, panic
import os

# Initialize Firebase (non-blocking — app starts even in placeholder mode)
init_firebase()

app = FastAPI(
    title="Special Care 360 API",
    description="HIPAA-compliant platform for special education centers",
    version="1.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Set ALLOWED_ORIGINS in your .env file as a comma-separated list.
# Example: ALLOWED_ORIGINS=http://localhost:3000,https://yourapp.vercel.app
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
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

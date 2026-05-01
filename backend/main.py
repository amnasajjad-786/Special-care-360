from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin_init import init_firebase
from routers import auth, students, daily_care, abc_tracker, panic

# Initialize Firebase (non-blocking — app starts even in placeholder mode)
init_firebase()

app = FastAPI(
    title="Special Care 360 API",
    description="HIPAA-compliant platform for special education centers",
    version="1.0.0",
)

# CORS — allow Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}

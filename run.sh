#!/bin/bash

# Special Care 360 Startup Script
# Run this from the root directory of the project: ./run.sh

# Exit immediately if a command exits with a non-zero status
set -e

# Function to clean up background processes on termination
cleanup() {
    echo ""
    echo "=========================================="
    echo "Stopping Special Care 360 servers..."
    echo "=========================================="
    # Kill background PIDs if they exist
    if [ ! -z "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    exit 0
}

# Trap Ctrl+C (SIGINT) and exit signals to trigger cleanup
trap cleanup SIGINT SIGTERM EXIT

echo "=========================================="
echo "🚀 Starting Special Care 360 Platform..."
echo "=========================================="

# 1. Start Backend FastAPI Server
echo "Starting Backend (FastAPI)..."
cd backend
# Use the virtualenv interpreter. A bare `python` picks up the system one,
# which does not have firebase-admin or fastapi installed.
if [ -x "venv/Scripts/python.exe" ]; then
    PY="venv/Scripts/python.exe"      # Windows
elif [ -x "venv/bin/python" ]; then
    PY="venv/bin/python"              # macOS / Linux
else
    echo "No virtualenv found in backend/. Create one first:"
    echo "  cd backend && python -m venv venv && venv/Scripts/pip install -r requirements.txt"
    exit 1
fi
"$PY" -m uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# 2. Start Frontend Next.js Server
echo "📂 Starting Frontend (Next.js)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=========================================="
echo "Special Care 360 is running!"
echo "   - Frontend: http://localhost:3000"
echo "   - Backend:  http://localhost:8000"
echo "=========================================="
echo "Press [Ctrl+C] to stop both servers gracefully."
echo ""

# Wait for all background jobs to finish
wait

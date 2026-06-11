# Special Care 360

A HIPAA-compliant platform for special education centers built with **Next.js 14**, **FastAPI**, and **Firebase**.

## Modules
| # | Module | Description |
|---|--------|-------------|
| 1 | **Auth** | Role-based login (Admin / Teacher / Therapist / Parent) with Firebase Auth |
| 2 | **Student Profiles** | Searchable student list with tabbed profiles — Overview, Medical, Care Plan, Emergency |
| 3 | **Daily Care Journal** | Teacher meal/mood/hygiene journaling + parent read-only Daily Digest |
| 4 | **ABC Behavioral Tracker** | Incident logging, heatmap, trend charts, AI pattern insights |
| 5 | **Panic Alert System** | Real-time emergency alerts with Firestore `onSnapshot` and admin alert center |

## Tech Stack
- **Frontend:** Next.js 14 (App Router) + Tailwind CSS v4 + TypeScript
- **Backend:** FastAPI (Python) + Firebase Admin SDK
- **Database:** Firebase Firestore
- **Auth:** Firebase Authentication
- **Charts:** Recharts

## Quick Start

### Frontend
```bash
cd frontend
npm install
npm run dev        # → http://localhost:3000
```

### Backend
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate      # Windows
pip install -r requirements.txt
uvicorn main:app --reload    # → http://localhost:8000
```

## Demo Credentials (placeholder Firebase mode)
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@demo.com | demo1234 |
| Teacher | teacher@demo.com | demo1234 |
| Therapist | therapist@demo.com | demo1234 |
| Parent | parent@demo.com | demo1234 |

## Firebase Setup
1. Create a Firebase project at https://console.firebase.google.com
2. Copy your web app config into `frontend/lib/firebase-config.ts`
3. Download your service account key as `backend/serviceAccountKey.json`
4. Set `NEXT_PUBLIC_DEMO_MODE=false` in `frontend/.env.local`

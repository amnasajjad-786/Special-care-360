# Special Care 360

A platform for special education centres built with **Next.js 16**, **FastAPI** and **Firebase**.

## Modules
| # | Module | Description |
|---|--------|-------------|
| 1 | **Auth** | Role-based login (Admin / Teacher / Therapist / Parent) with Firebase Auth. Every self-registration requires admin approval. |
| 2 | **Student Profiles** | Searchable student list with tabbed profiles — Overview, Medical, Care Plan, Emergency |
| 3 | **Daily Care Journal** | Teacher meal/mood/hygiene journaling + parent read-only Daily Digest |
| 4 | **ABC Behavioural Tracker** | Incident logging, heatmap, trend charts, AI pattern insights |
| 5 | **Panic Alert System** | Real-time emergency alerts with Firestore `onSnapshot`, staff fan-out and email |
| 6 | **Fees & Billing** | Admin invoicing and payment recording, parent-facing billing view |
| 7 | **Teletherapy** | Scheduled remote sessions in an embedded Jitsi room, with therapist session summaries |
| 8 | **Home Plan Bridge** | Therapist-assigned home activities, guardian daily logging, adherence tracking and per-activity discussion threads |

## Tech Stack
- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript
- **Backend:** FastAPI (Python) + Firebase Admin SDK
- **Database:** Firebase Firestore
- **Auth:** Firebase Authentication
- **Charts:** Recharts
- **Video:** Jitsi Meet (embedded)

## Quick Start

```bash
./run.sh     # starts both servers
```

Or individually:

### Frontend
```bash
cd frontend
cp .env.local.example .env.local    # required — the build fails without it
npm install
npm run dev                          # → http://localhost:3000
```

### Backend
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate              # Windows
pip install -r requirements.txt
cp .env.example .env
python -m uvicorn main:app --reload  # → http://localhost:8000
```

## Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Copy your web app config into `frontend/.env.local`
3. Download your service account key to `backend/serviceAccountKey.json`
4. Deploy the security rules and indexes — **the app will not work without them**:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```
5. Seed the first admin and demo data:
   ```bash
   cd backend && python seed_firestore.py
   ```

### Accounts

There is deliberately no way to create an approved admin through the UI: every self-registration
lands in the pending queue, and the security rules stop a user changing their own role or status.
The first admin comes from `seed_firestore.py`. After that, admins approve new staff and parents
from the Admin Panel.

Staff must register with an `@specialcare360.com` address; parents may use any email.

## Notes

- Authorisation lives in `firestore.rules`, not in the backend. Records carry a denormalised
  `centerId` and `parentId`, and list queries must filter on the matching field — see `CLAUDE.md`
  for why.
- Teletherapy defaults to the public `meet.jit.si`, which may ask the first participant to sign in
  before creating a room. Set `NEXT_PUBLIC_JITSI_DOMAIN` to a self-hosted or 8x8 instance to avoid
  this.
- There is no automated test suite. `npx tsc --noEmit && npm run lint && npm run build` is the
  verification loop.

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

### Upgrading an existing database

Records created before the security-rules rewrite do not carry the `centerId` and `parentId`
fields the new queries filter on, so they read as empty rather than erroring. Backfill them:

```bash
cd backend
python backfill_scope_fields.py            # dry run — reports, writes nothing
python backfill_scope_fields.py --apply    # perform the migration
```

Safe to re-run. Invoices and payments that were keyed only on a student *name* which is ambiguous
or no longer exists are reported for manual assignment rather than guessed at.

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
- **Teletherapy video needs a Jitsi instance you control.** It defaults to the public
  `meet.jit.si`, which will not start a conference until a moderator joins, and becoming a
  moderator requires a Jitsi account. Participants see *"The conference has not yet started
  because no moderators have yet arrived"* and wait. The room embeds and loads fine — it is the
  call that will not begin.

  On `meet.jit.si` the therapist must press **Log-in** inside the video frame once per room to
  start it; the guardian can then join. For anything beyond a demo, point
  `NEXT_PUBLIC_JITSI_DOMAIN` at a self-hosted Jitsi, or at 8x8 JaaS (which additionally needs a
  JWT and a change to `components/teletherapy/VideoRoom.tsx`).
- There is no automated test suite. `npx tsc --noEmit && npm run lint && npm run build` is the
  verification loop.

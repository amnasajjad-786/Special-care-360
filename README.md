# Special Care 360

A platform for special education centres built with **Next.js 16**, **FastAPI** and **Firebase**.

## Modules
| # | Module | Description |
|---|--------|-------------|
| 1 | **Auth** | Role-based login (Admin / Teacher / Therapist / Parent / Caregiver) with Firebase Auth, password reset by email. Every self-registration requires admin approval. |
| 2 | **Student Profiles** | Searchable student list with tabbed profiles — Overview, Medical, Care Plan, Emergency |
| 3 | **Daily Care Journal** | Teacher meal/mood/hygiene journaling + parent read-only Daily Digest |
| 4 | **Medication Safety** | Scheduled dose administration records and missed-dose alerts for parents and center admins |
| 5 | **ABC Behavioural Tracker** | Incident logging, heatmap, trend charts, AI pattern insights |
| 6 | **Panic Alert System** | Real-time emergency alerts with Firestore `onSnapshot`, staff fan-out and email |
| 7 | **Fees & Billing** | Admin invoicing and payment recording, parent-facing billing view |
| 8 | **Teletherapy** | Scheduled remote sessions in an embedded Jitsi room, with therapist session summaries |
| 9 | **Home Plan Bridge** | Therapist-assigned home activities, guardian daily logging, adherence tracking and per-activity discussion threads |
| 10 | **Progress Tracking** | Measured mastery % per goal, per-goal progress charts against the 80% mastery line, early regression alerts |
| 11 | **Care-Team Messaging** | One live, append-only thread per child for parent, caregivers, teacher, therapists and admins |
| 12 | **Documents & Reports** | Private document sharing (PDF, images, Word) and printable progress reports |
| 13 | **Appointment Reminders** | In-app reminders 24 h and 1 h before teletherapy and therapy sessions |
| 14 | **Audit Log** | Append-only record of who changed or viewed which child's record, admin-only, CSV export |
| 15 | **Mobile (PWA)** | Installable on Android and iOS home screens; phone-friendly layout |

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

## Free Jitsi demo calls

Set `TELETHERAPY_PROVIDER=jitsi` in `backend/.env`, then restart the backend.
No JaaS API keys are required. The assigned therapist opens **Start session in
Jitsi** and signs in to Jitsi to start the meeting; the parent selects **Join
session** for the same room. Both can also open the room in a new tab.
These are public demo rooms: anyone with the meeting link can join. Set
`TELETHERAPY_PROVIDER=jaas` and configure the JaaS credentials for signed rooms.

Scheduling saves the session and its parent notification in one Firestore
batch. The parent's notification bell updates live and includes the session
title, therapist, Pakistan time, duration, and a **View sessions** button.

For a live-demo backup, create a Google Meet meeting and paste its link into
the optional **Google Meet backup link** field when scheduling. For existing
sessions, therapists/admins can select **Add Meet backup**. Both participants
can open the same backup from the session card or video page if Jitsi fails.
The backup opens in a new tab and requires no Google API credentials.

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

Staff must register with an `@specialcare360.com` address; parents and caregivers may use any email.

A **caregiver** (a relative or home carer) registers with the Caregiver role. After approval, an
admin links them to a child in Admin Panel -> Students -> Caregivers (up to three per child). They get
a read-only family view, messages, documents and the same notifications as the parent.

## Notes

- Authorisation lives in `firestore.rules`, not in the backend. Records carry a denormalised
  `centerId` and `parentId`, and list queries must filter on the matching field — see `CLAUDE.md`
  for why.
- Medication schedules use 24-hour times in the `Asia/Karachi` timezone. The FastAPI backend
  checks overdue doses every 60 seconds and, after the 60-minute grace period, creates a
  deterministic missed-dose record and in-app notifications for the child's parent and center
  admins. The checker requires the real Firebase service account and a continuously running
  backend; it is intentionally disabled in placeholder/mock mode. Deploy the updated Firestore
  rules before using dose records from the frontend.
### Teletherapy video

Two modes, chosen automatically by whether the backend has JaaS credentials.

**8x8 JaaS (recommended).** The backend mints a short-lived RS256 JWT per session naming the
therapist as moderator and the guardian as a participant, so the call starts without anyone
signing in to Jitsi. Sign up at [jaas.8x8.vc](https://jaas.8x8.vc) (free tier available), then set
`JAAS_APP_ID`, `JAAS_API_KEY_ID` and `JAAS_PRIVATE_KEY_PATH` in `backend/.env` — see
`backend/.env.example`. The private key stays on the server; it can mint a moderator token for any
room in the tenant, so it must never reach the browser.

**Public `meet.jit.si` (fallback).** Used when JaaS is unconfigured. It will not start a
conference until a moderator joins, and becoming one requires a Jitsi account, so both
participants can load the room and still never connect — they sit on *"The conference has not yet
started because no moderators have yet arrived"*. Workable for a click-through demo if the
therapist presses **Log-in** inside the frame once per room. Set `NEXT_PUBLIC_JITSI_DOMAIN` to
point at a self-hosted Jitsi instead if you have one.
- Frontend behavior has no automated test suite yet; the backend has focused medication-monitor
  tests, run by CI with `python -m unittest discover -s tests` from `backend/`. For local frontend
  verification, use `npm run typecheck`, `npm run lint`, and `npm run build` from `frontend/`.

## Private Home Plan videos

Videos and documents live in **Firebase Storage** (project's default bucket, or
`FIREBASE_STORAGE_BUCKET`). One-time setup:

1. Move the Firebase project to the **Blaze** plan and enable Storage in the console.
2. Deploy the deny-all rules: `firebase deploy --only storage`. `storage.rules` blocks
   every browser read and write; only the backend touches the bucket, through the
   service account (`backend/serviceAccountKey.json`), after re-checking the caller's
   access to the child. Downloads and playback use five-minute signed links.
3. Install FFmpeg and ffprobe for video compression, then restart the backend.

Clips are stored at `progress-videos/<clipId>.mp4` (compressed to at most 12 MiB);
metadata stays in Firestore. Without the service account the API runs in mock mode and
file endpoints return 503.

In **Home Plan Bridge**, open an activity's **Progress and demonstration
videos** section. The linked parent can upload a practice clip, and assigned
therapists can upload demonstrations and leave feedback on practice clips.
Inputs are limited to 250 MiB and 3 minutes; the app compresses them to at most
12 MiB for private storage. Playback links expire after five minutes. The uploader can
delete their clips. A daily backend sweep purges clips after 30 days. Set
`PROGRESS_VIDEO_RETENTION_DAYS` in `backend/.env` to change that window.

AI transcripts and summaries require `VIDEO_GEMINI_API_KEY` in the backend
environment. `VIDEO_GEMINI_MODEL` defaults to `gemini-3.8-flash`. A parent must
opt in per clip. After upload, the backend sends the compressed video to Gemini
to transcribe speech, then sends only that transcript to Gemini for a
therapist-facing summary. Both the transcript and summary appear on the
therapist's activity view; the therapist can retry if generation fails. Gemini
interactions use stateless requests. The summary is a draft for therapist review.
Use staged clips for testing, and confirm consent, retention and provider
data handling before enabling video or AI for real students.

Release check with synthetic accounts: upload and replay as the linked
parent and assigned therapist; confirm an unrelated account is denied.

Then verify feedback, playback expiration, deletion and optional AI failure
recovery against the configured providers.

## Parent fee payments

**Online (Safepay).** Set `SAFEPAY_API_KEY`, `SAFEPAY_SECRET_KEY`,
`SAFEPAY_WEBHOOK_SECRET`, `SAFEPAY_ENVIRONMENT` (`sandbox` or `production`) and
`FRONTEND_URL` in `backend/.env`, and register the webhook
`<backend-url>/api/payments/safepay/webhook` in the Safepay dashboard. Until the keys are
set, the "Pay online" button is hidden. The parent is sent to Safepay's hosted checkout for
the exact invoice amount; card details never reach this app. On return (and through the
webhook) the backend asks Safepay for the result, checks the amount, records the payment
in the ledger, marks the invoice paid and notifies admins. A payment that arrives for an
invoice already settled by bank transfer is not recorded twice; admins are notified to
refund it.

**Bank transfer.** Configure `NEXT_PUBLIC_BANK_NAME`, `NEXT_PUBLIC_BANK_ACCOUNT_TITLE`
and `NEXT_PUBLIC_BANK_ACCOUNT_NUMBER` in `frontend/.env.local`. The parent submits the
transaction reference; an administrator verifies it and records the payment. Never put
secret keys or Firebase admin credentials in these public frontend variables.

## Student documents

Stored in Firebase Storage under `student-documents/<studentId>/<documentId>` (setup
above). Allowed types: PDF, PNG, JPEG, DOCX; 10 MiB limit. The backend checks the file's
real type from its content, stores it, records metadata in Firestore `studentDocuments`,
and signs five-minute download links only after re-checking the caller's access to the
child. Until Storage is enabled, uploads return a "not configured" message.

## Mobile app (PWA)

The web app is installable: Chrome/Edge/Android show an **Install** prompt, iPhone/iPad
users get "Share, then Add to Home Screen" steps. `public/sw.js` (registered in production
builds only) caches build assets and an offline page. It never caches care data,
API responses or file links, so a shared or lost phone holds no copy of a child's records.
When a new version is deployed, users see an **Update** toast.

Progress reports need no setup: they are compiled in the browser from records
the viewer may already read and printed or saved as PDF.

## Appointment reminders

The backend scans every `APPOINTMENT_REMINDER_INTERVAL_SECONDS` (default 300)
for scheduled teletherapy and therapy-timeline sessions and sends in-app
reminders to the parent, linked caregivers and the therapist 24 hours and 1 hour
before. Each reminder is sent once; the server-only `appointmentReminders`
collection records what has been sent. Requires the real service account and
a continuously running backend.

## Documentation

- `docs/SRS.md` — software requirements specification with implementation status
- `docs/USE_CASES.md` — use-case specifications
- `docs/user-guides/` — guides for parents and caregivers, teachers and therapists, and admins
- `docs/UAT_PLAN.md` — user acceptance test plan and sign-off sheet
- `docs/DEPLOYMENT.md` — production deployment, monitoring and backup runbook
- `docs/SECURITY_TESTING.md` — security test results

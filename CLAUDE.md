# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
./run.sh                      # start both servers (backend :8000, frontend :3000)

# Frontend (frontend/)
npm run dev                   # Next.js dev server
npm run build                 # production build — the only real type/lint gate
npm run lint                  # eslint (flat config, eslint.config.mjs)

# Backend (backend/)
python -m venv venv && .\venv\Scripts\activate   # Windows
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000  # docs at /docs
```

There is no test suite and no test runner configured. `npm run build` is the closest thing to a
verification gate for frontend changes.

### Data scripts (backend/, run with the venv active and `serviceAccountKey.json` present)

`seed_firestore.py` (demo users/students/center — idempotent), `populate_abc_data.py`,
`populate_daily_care.py`, `populate_sara_journal.py`, `create_parent.py` (creates a Firebase Auth
user + profile), `cleanup_staff.py`, `fix_goals.py`. All bootstrap via
`from firebase_admin_init import init_firebase, get_db` and write straight to Firestore.

## Architecture

Two deployables plus Firestore, but **the frontend is the primary application**: it talks to
Firestore directly from the browser. The FastAPI backend is nearly vestigial.

### The data layer split (important)

- `frontend/lib/firestore-api.ts` — **the real data layer.** Direct Firestore SDK calls grouped
  into `studentsDb`, `dailyCareDb`, `abcDb`, `panicDb`, `notificationsDb`, `adminDb`. Every page
  and data-bearing component imports from here. Adding a feature means adding a method here.
- `frontend/lib/api.ts` — axios client for the FastAPI `/api/*` routes. **Nothing imports it.**
  It is leftover from before the Firestore migration (commit `47a58b1`). Don't add to it; don't
  assume backend routes are live.
- The one live backend call is `GET /ai-insights/abc/{student_id}` (Gemini behavioural analysis),
  fetched directly with `fetch()` in `app/dashboard/abc-tracker/page.tsx`. Everything in
  `backend/routers/{auth,students,daily_care,abc_tracker,panic}.py` is dead code that mirrors an
  older architecture — the Firestore schema still matches it, which is why it's kept.

Consequence: authorization is enforced by `firestore.rules`, not by backend middleware. Any new
collection or access pattern needs a matching rule there or reads/writes fail at runtime.

### Auth and routing

`lib/auth-context.tsx` (`AuthProvider` in the root layout) owns Firebase Auth and loads the
`users/{uid}` profile into `profile`. The profile — not the Firebase user — drives everything:

- `profile.status` is `pending` or `approved`. New non-admin registrations are `pending` and see a
  blocking "Awaiting Approval" screen until an admin approves them via `adminDb.approveUser`.
- `profile.role` is `admin | teacher | therapist | parent`. `app/dashboard/layout.tsx` holds the
  `ROLE_PATHS` map that gates which `/dashboard/*` prefixes each role may visit and redirects
  otherwise. This is the single place role-based navigation is decided — update it when adding a
  dashboard route, and update `components/layout/Sidebar.tsx` to match.
- `/dashboard` and `/dashboard/[role]` are redirect-only shims: admins land on `/dashboard/admin`,
  everyone else on `/dashboard/students`.

`centerId` scopes almost every query; `"center-001"` is the default used throughout.

### Firestore collections

`users`, `students` (with `medicalProfile/main` and `carePlan/main` sub-documents — always the
literal doc id `main`), `dailyCareJournals`, `abcIncidents`, `panicAlerts`, `notifications`,
`staff`, `invoices`, `payments`, `centers`.

Conventions worth keeping:
- **Avoid composite indexes.** Queries use a single `where` and sort in memory (JS `.sort()` or
  Python `list.sort()`) rather than combining `where` + `orderBy`. See `TopBar.tsx` notifications
  and `routers/ai_insights.py`. If you add `orderBy` next to a `where`, you have created an index
  requirement that will throw in production.
- **Notifications are written client-side.** Mutations in `firestore-api.ts` (panic alerts,
  incident logs, journal submissions, approvals) `addDoc` into `notifications` with a
  `recipientId` as a side effect. Keep that pattern for new notifying actions.
- Real-time UI uses `onSnapshot` with a cleanup unsubscribe — panic alerts, the admin incident
  feed, and the TopBar notification dropdown.

### Backend placeholder mode

`backend/firebase_admin_init.py` contains a full hand-rolled mock Firestore
(`MockFirestoreClient` persisting to `mock_db.json`) that activates when `serviceAccountKey.json`
is absent, so the API boots without credentials. `verify_token` also fakes claims in that mode by
string-matching the role in the token. Real Firestore behaviour and the mock can diverge — trust
the real path.

## Conventions

- **Styling is inline `style={{}}` plus the utility classes in `app/globals.css`** (`glass-card`,
  `btn-primary`, `btn-ai`, `btn-danger`, `btn-ghost`, `chip-*`, `data-table`, `tab-item`,
  `modal-box`, `sidebar-*`) driven by CSS custom properties (`--bg-gradient`, `--primary-dark`,
  `--accent-teal`, `--text-secondary`). Tailwind v4 is installed and imported but barely used —
  match the surrounding inline-style idiom rather than introducing Tailwind classes.
- Icons are **Lucide React vector icons only**. Emoji were deliberately stripped in commit
  `27bebe2`; don't reintroduce them.
- Toasts via `react-hot-toast` (`Toaster` configured in the root layout).
- Nearly every component is `"use client"` — App Router is used for routing, not for RSC.
- Shared types live in `frontend/types/index.ts`; `firestore-api.ts` defines its own looser
  `StudentDoc` with an index signature for Firestore round-trips.

`frontend/CLAUDE.md` imports `frontend/AGENTS.md`, which warns that this Next.js version (16.2.4,
React 19) differs from older conventions — consult `node_modules/next/dist/docs/` before writing
framework-level code.

## Secrets

`backend/serviceAccountKey.json`, `backend/.env` (`ALLOWED_ORIGINS`, `GEMINI_API_KEY`) and
`frontend/.env.local` (`NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_API_URL`) are gitignored and must
exist locally. `.gitignore` excludes `backend/*.json` wholesale, so new backend JSON fixtures need
an explicit negation to be committed.

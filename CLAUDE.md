# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
./run.sh                      # start both servers (backend :8000, frontend :3000)

# Frontend (frontend/)
npm run dev                   # Next.js dev server
npm run build                 # production build — the real type gate
npx tsc --noEmit              # typecheck alone, much faster than a build
npm run lint                  # eslint (flat config, eslint.config.mjs)

# Backend (backend/)
python -m venv venv && .\venv\Scripts\activate   # Windows
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000  # docs at /docs

# Firestore rules and indexes (repo root)
firebase deploy --only firestore:rules,firestore:indexes
```

There is no test suite and no test runner configured. `npx tsc --noEmit` then `npm run lint` is
the practical verification loop; `npm run build` is the final gate.

**`frontend/.env.local` is required even to build.** `lib/firebase.ts` calls `initializeApp` at
module scope, so prerendering crashes with `auth/invalid-api-key` when the `NEXT_PUBLIC_FIREBASE_*`
vars are absent. Copy `frontend/.env.local.example`; placeholder values are enough for a build.

Lint is clean apart from nine `react-hooks/set-state-in-effect` warnings, which are deliberate —
see the rationale in `eslint.config.mjs`.

### Data scripts (backend/, run with the venv active and `serviceAccountKey.json` present)

`seed_firestore.py` (demo users/students/center — idempotent), `populate_abc_data.py`,
`populate_daily_care.py`, `populate_sara_journal.py`, `create_parent.py` (creates a Firebase Auth
user + profile, password from `SEED_PARENT_PASSWORD`), `cleanup_staff.py`, `fix_goals.py`. All
bootstrap via `from firebase_admin_init import init_firebase, get_db` and write straight to
Firestore.

`backfill_scope_fields.py` is the one-off migration for the rules rewrite: it copies `centerId`
and `parentId` from each student onto records written before those fields existed, and resolves
the legacy `studentName` on invoices/payments back to a `studentId`. Dry-run by default; `--apply`
writes. Records whose student name is ambiguous or unknown are reported and left alone rather
than guessed at — guessing is the bug the migration exists to fix.

## Architecture

Two deployables plus Firestore, but **the frontend is the primary application**: it talks to
Firestore directly from the browser. The FastAPI backend is nearly vestigial.

### The data layer split (important)

- `frontend/lib/firestore-api.ts` — **the real data layer.** Direct Firestore SDK calls grouped
  into `studentsDb`, `dailyCareDb`, `abcDb`, `panicDb`, `notificationsDb`, `adminDb`. Every page
  and data-bearing component imports from here. Adding a feature means adding a method here.
- `frontend/lib/teletherapy-api.ts` — same shape, for the Teletherapy & Home Plan Bridge module
  (`teletherapyDb`, `homePlanDb`, `computeAdherence`).
- `frontend/lib/api.ts` — axios client for the FastAPI `/api/*` routes. Only one caller, and it is
  easy to miss: `panicDb.sendAlert` pulls it in through a dynamic `await import("./api")`, so a
  grep for static imports finds nothing. Everything else in it is unused.
- Two backend endpoints are live: `GET /ai-insights/abc/{student_id}` (Gemini behavioural
  analysis, called with `fetch()` in `app/dashboard/abc-tracker/page.tsx`) and
  `POST /api/panic/alert` (staff notification fan-out plus email). The rest of
  `backend/routers/{auth,students,daily_care,abc_tracker}.py` is dead code mirroring an older
  architecture — the Firestore schema still matches it, which is why it is kept.

Consequence: authorization is enforced by `firestore.rules`, not by backend middleware. Any new
collection or access pattern needs a matching rule there or reads/writes fail at runtime.

### Query/rule alignment — the thing most likely to bite you

Firestore refuses any list query it cannot *prove* satisfies the rules. Rules here authorise by a
denormalised `centerId` (staff) or `parentId` (guardian), so **every list query must carry the
matching `where` clause**, and **every write must denormalise both fields onto the record**.

That is what `AccessScope` and `scopeOf(profile)` exist for: list functions take a scope and add
the right filter via `scopeFilter()`. Filtering client-side after a broad fetch does not work —
it is denied outright, not merely inefficient. If a page suddenly renders empty with a
`permission-denied` in the console, this is almost always why.

Composite indexes live in `firestore.indexes.json`. Any new `where` + `orderBy` pair needs an
entry there or it throws `failed-precondition` at runtime.

### Auth and routing

`lib/auth-context.tsx` (`AuthProvider` in the root layout) owns Firebase Auth and loads the
`users/{uid}` profile into `profile`. The profile — not the Firebase user — drives everything:

- `profile.status` is `pending` or `approved`. **Every** self-registration is `pending`, including
  one requesting the admin role, and sees a blocking "Awaiting Approval" screen until an existing
  admin approves it via `adminDb.approveUser`. The rules enforce this too — a user cannot write
  their own `role`, `status` or `centerId`. The first admin is therefore provisioned out-of-band
  by `backend/seed_firestore.py`; there is no way to bootstrap one through the UI, by design.
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
`staff`, `invoices`, `payments`, `centers`, `teletherapySessions`, `homePlanActivities`,
`homePlanLogs`, `homePlanMessages`.

Conventions worth keeping:
- **Records carry denormalised `centerId` and `parentId`.** See the query/rule section above. Join
  keys are always ids, never names — billing used to match on `studentName` and leaked between
  families who shared one.
- **Prefer in-memory sorting for small result sets** (`TopBar.tsx` notifications, `homePlanDb`)
  rather than adding an index for a few dozen rows. Where `orderBy` is genuinely needed, the index
  is declared in `firestore.indexes.json`.
- **Notifications are written client-side** as a side effect of mutations, via the `notify()`
  helper in `firestore-api.ts`. Delivery failure is logged and swallowed — it must never take a
  care record down with it. The one exception is the panic alert staff fan-out, which lives in
  `backend/routers/panic.py`: it needs to read the centre's user directory, which the rules only
  grant to admins.
- Real-time UI uses `onSnapshot` with a cleanup unsubscribe. **Always pass the error callback.**
  On failure, render an explicit error state — never a plausible-looking fallback. Several
  dashboards used to substitute invented alert counts and notifications when Firestore failed,
  which made an outage indistinguishable from a quiet day.

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
  `27bebe2`; don't reintroduce them, including in notification titles and toast text, where they
  crept back once already.
- **Never show fabricated data.** No mock rows, placeholder counts or invented fallbacks in a
  rendered view, and never seed sample records into Firestore from the UI. This is a care
  platform: an admin cannot tell an invented emergency from a real one. Render an empty state or
  an error state instead. Where a figure cannot be derived, say so — the attendance report shows
  what it inferred from daily care journals and states that it did.
- Toasts via `react-hot-toast` (`Toaster` configured in the root layout).
- Nearly every component is `"use client"` — App Router is used for routing, not for RSC.
- Shared types live in `frontend/types/index.ts`; `firestore-api.ts` defines its own looser
  `StudentDoc` with an index signature for Firestore round-trips.

`frontend/CLAUDE.md` imports `frontend/AGENTS.md`, which warns that this Next.js version (16.2.4,
React 19) differs from older conventions — consult `node_modules/next/dist/docs/` before writing
framework-level code.

## Secrets

`backend/serviceAccountKey.json`, `backend/.env` and `frontend/.env.local` are gitignored and must
exist locally. Copy them from `backend/.env.example` and `frontend/.env.local.example`, which
document every variable the code reads.

`.gitignore` excludes `backend/*.json` wholesale, so new backend JSON fixtures need an explicit
negation to be committed. `frontend/.gitignore` excludes `.env*` with an exception for
`.env.local.example`.

Seed scripts take credentials from the environment (`SEED_PARENT_PASSWORD`) rather than carrying
them in the file.

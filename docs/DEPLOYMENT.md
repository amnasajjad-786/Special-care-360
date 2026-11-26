# Special Care 360 — Deployment, Monitoring and Backup Runbook

Covers WBS 5.1 (deployment), 5.2 (hosting) and 5.4 (post-launch monitoring). This is the procedure;
production hosting has not been provisioned yet.

## 1. Components and recommended hosting
| Component | Recommended host | Why |
|---|---|---|
| Frontend (Next.js) | Vercel (or Firebase App Hosting) | Native Next.js support, HTTPS, preview deploys |
| Backend (FastAPI) | An **always-on** container: Google Cloud Run with min-instances = 1, Render or Railway paid instance | The API runs background loops (missed-dose monitor, appointment reminders, panic delivery, video retention); scale-to-zero hosts would stop them |
| Database / auth | Firebase (Firestore, Authentication) — Blaze plan for scheduled backups | Already in use |
| Private files | Firebase Storage (default bucket), deny-all `storage.rules`; API-only access with signed links | Already integrated (needs Blaze) |
| Online payment | Safepay hosted checkout + webhook | Integrated; merchant keys pending |
| Email | Any SMTP provider (e.g. Google Workspace, SendGrid) | Panic alert emails |

Choose a Firestore region close to users (e.g. `asia-south1`) when creating a production project;
the region cannot be changed later.

## 2. One-time setup
1. **Firebase project** for production (separate from development). Enable Email/Password and
   Google sign-in. Add the production domain to *Authentication → Settings → Authorized domains*.
2. **Rules and indexes:** from the repo root
   `firebase deploy --only firestore:rules,firestore:indexes,storage --project <prod-project>`.
   Wait until all indexes show *Enabled* in the console.
3. **First admin:** run `backend/seed_firestore.py` against production once (service account set),
   then change that admin's password. Remove demo data the seed creates if not wanted.
4. **Firebase Storage:** upgrade to Blaze and enable Storage (same region as Firestore). The
   deny-all `storage.rules` is deployed in step 2; size and type limits are enforced by the API
   (videos 12 MiB MP4, documents 10 MiB PDF/PNG/JPEG/DOCX).
4a. **Safepay:** create the merchant account, copy the API key, secret key and webhook secret,
   and register the webhook `https://<backend-domain>/api/payments/safepay/webhook`. Test in
   `sandbox` first, then switch `SAFEPAY_ENVIRONMENT=production`.
5. **Backend environment** (`backend/.env.example` lists every variable): service account
   (`GOOGLE_APPLICATION_CREDENTIALS` or `serviceAccountKey.json` mounted as a secret),
   `ALLOWED_ORIGINS=https://<frontend-domain>`, `DEFAULT_CENTER_ID`, `GEMINI_API_KEY`,
   `COHERE_API_KEY`, `FIREBASE_STORAGE_BUCKET` (optional), `SAFEPAY_*`,
   `FRONTEND_URL=https://<frontend-domain>`, SMTP settings, JaaS settings.
   **Never** set `ALLOW_LOCAL_MOCK` in production.
6. **Frontend environment:** `NEXT_PUBLIC_FIREBASE_*` for the production project,
   `NEXT_PUBLIC_API_URL=https://<backend-domain>`, `NEXT_PUBLIC_BANK_*`.

## 3. Release procedure
1. CI green on the release commit (lint, type-check, build, backend tests, emulator rules tests).
2. Deploy rules and indexes first (they are backwards compatible with the previous frontend).
3. Deploy the backend; check `GET /` returns `status: running` and the logs show the background
   loops starting.
4. Deploy the frontend.
5. Smoke test with synthetic accounts: log in as each role; load Students; submit a journal; send a
   message; upload and download a document; check the Audit Log shows these actions.
6. Record the release (commit, date, who) in the project log.

**Rollback:** redeploy the previous frontend/backend build. Rules: `git checkout <previous> --
firestore.rules` and redeploy. Do not roll back rules past a change that newer records depend on
without checking the emulator tests.

## 4. Backups and recovery
- **Firestore:** scheduled daily export to a Cloud Storage bucket in the same region:
  `gcloud firestore export gs://<backup-bucket>/$(date +%F)` via Cloud Scheduler, keep 30 days.
  Or enable Firestore point-in-time recovery (7 days).
- **Restore drill:** once per term, import the latest export into a scratch project and open it
  with a synthetic admin.
- **Stored files:** enable Object Versioning or a scheduled copy of the `student-documents/`
  prefix to a backup bucket. Progress videos are intentionally deleted after 30 days.
- **Auth users** are not in Firestore exports; export with `firebase auth:export` monthly and store
  encrypted.

## 5. Monitoring (post-launch)
| What | How | Alert when |
|---|---|---|
| Backend up | Uptime check on `GET /` every 5 min (Cloud Monitoring, UptimeRobot) | 2 consecutive failures |
| Background loops | Log-based alert on `Reminder failed`, `Failed to process missed dose`, `Panic delivery deferred` | Any occurrence in 15 min |
| API errors | Error rate of 5xx responses | > 2 % over 10 min |
| Firestore | Usage dashboard; `permission-denied` spikes in browser logs indicate a rules/query mismatch | Daily review |
| Costs | Firebase / Google Cloud budget alerts | 80 % of monthly budget |
| Security | Audit Log review by the centre admin | Weekly |

Incident procedure: acknowledge, note start time, check the uptime/log dashboards, roll back if a
release caused it, inform the centre admin, write a short post-incident note.

## 6. Performance and load testing plan
Target (SRS NFR-8): list pages load within 2 s on 4G for a centre of up to 200 students.
1. Seed a **staging** project with synthetic data at target scale (200 students, 90 days of journals
   and incidents) using the backend populate scripts.
2. Measure page load with Lighthouse (mobile profile) for Students, Daily Care, ABC Tracker and Admin
   dashboard; record LCP and total blocking time.
3. Load the API with k6 or Locust: 50 concurrent users for 10 minutes on document download links and
   AI-free endpoints; record p95 latency and error rate. Do not load-test Gemini endpoints (cost,
   quota).
4. Record results in this file and compare against the target; open defects for misses.

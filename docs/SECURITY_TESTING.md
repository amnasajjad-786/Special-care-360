# Special Care 360 — Security Testing Record

Date: 21 November 2026. Scope: web frontend dependencies, backend dependencies (by inspection),
Firestore authorisation rules, backend authorisation, authentication flows and file handling.
This is a project-level security test, not an independent penetration test.

## 1. Summary
| Area | Method | Result |
|---|---|---|
| Frontend dependencies | `npm audit --omit=dev` | 14 findings (1 critical, 11 high, 2 moderate) → **10 fixed**; 4 remaining are one advisory chain judged not exploitable here (§2) |
| Backend dependencies | Version review against known advisories (pip-audit could not be installed in this session) | 3 packages behind; none reachable through current endpoints (§3). Upgrade recommended |
| Firestore rules | Emulator acceptance tests (`qa/rules.test.cjs`, run in CI) + compile check (`firebase deploy --dry-run`) | Compiles. New tests added for caregivers, care messages, documents, audit log, reminders |
| Backend authorisation | Unit tests (`backend/tests`, `automated_unit_testing`) | 79 + 73 passing |
| Account enumeration | Code review + fix | **Fixed**: login no longer probes for registered emails (§4.1) |
| File upload | Code review + unit tests | Type from magic bytes, size cap, private bucket enforced, signed links (§4.3) |

## 2. Frontend dependency audit
Before: 14 vulnerabilities. Actions taken:
- `npm audit fix` (in-range updates): axios, follow-redirects, form-data, nanoid, source-map-js,
  protobufjs, baseline-browser-mapping.
- Next.js `16.2.4 → 16.4.6` and `eslint-config-next` to match: fixes the critical Next.js advisory and
  the bundled postcss and sharp advisories. Type-check, lint and production build pass on 16.4.6.

Remaining (accepted, documented risk): `@grpc/grpc-js <=1.13.5` via `firebase → @firebase/firestore`
(GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4). Both concern a gRPC **server** (certificate
authorisation context; error messages sent by method handlers). The browser Firestore SDK uses
WebChannel and runs no gRPC server, so neither path exists in this app. npm's suggested "fix" is a
downgrade to firebase 9 and is not applied. Re-check when Firebase ships a newer grpc-js.

## 3. Backend dependencies (inspection)
| Package (installed) | Known issue | Exposure here | Recommendation |
|---|---|---|---|
| python-jose 3.3.0 | CVE-2024-33663 (algorithm confusion), CVE-2024-33664 (JWE decompression DoS) — both on **decode** | Used only to **sign** JaaS video tokens (`routers/teletherapy.py`); never decodes untrusted tokens. Firebase ID tokens are verified by firebase-admin. | Upgrade or replace with PyJWT when convenient |
| python-multipart 0.0.9 | CVE-2024-53981 (multipart DoS) | No endpoint declares `Form`/`File`; uploads use a streamed raw body, so the parser is never invoked | Upgrade to ≥0.0.18 |
| starlette 0.37.2 (via fastapi 0.111.0) | CVE-2024-47874 (multipart form DoS) | Same as above — form parsing not used | Upgrade FastAPI to a release with starlette ≥0.40 and re-run tests |

Action for the team: run `pip install pip-audit && pip-audit -r backend/requirements.txt` in the
backend venv and attach the output here.

## 4. Application controls reviewed

### 4.1 Authentication
- Self-registration is always *pending*; users cannot change their own role, status or centre
  (rules + emulator tests).
- **Fixed in this pass:** on a failed login the app used to create, then delete, a throwaway
  Firebase account to learn whether the email was registered, and showed "Wrong email" or "Wrong
  password" accordingly. That disclosed which emails have accounts and created real accounts as a
  side effect. It now shows one neutral message; password reset is likewise neutral.

### 4.2 Authorisation
- Firestore rules authorise by role, centre and child assignment (`teacherId`, `therapistIds`,
  `parentId`, `caregiverIds`), with denormalised `centerId`/`parentId` on every record.
- Caregivers: read-only on clinical records, limited to linked children; only an admin can link,
  and only approved caregiver accounts of the same centre (emulator tests added).
- Backend endpoints re-derive identity from the verified Firebase token and the server-side profile,
  and check child access per request (`middleware/student_access.py`, unit tests incl. BUG-01
  regression and caregiver cases).

### 4.3 Files
Documents and videos: Firebase Storage with deny-all `storage.rules` (only the API, via the service account, can read or write), file type
detected from content and matched to the extension, 10 MB cap enforced while streaming, metadata
writable only by the server, five-minute signed download links issued after an access re-check,
uploads/downloads/deletes audited.

### 4.4 Audit and integrity
Audit entries: actor fields must match the signed-in user and their stored role; timestamp must be
server time; entries cannot be updated or deleted; only centre admins read them. Care messages are
append-only.

### 4.5 Secrets
Service account key, Safepay secret and webhook keys, AI keys and SMTP credentials live only in
`backend/.env` / `serviceAccountKey.json`, both gitignored. The frontend receives only the public
Firebase web config.

## 5. Not covered (needs the deployed environment)
- Penetration test of the hosted site (headers, TLS, CORS with production origins).
- Load and performance testing — plan in `docs/DEPLOYMENT.md` §6.
- Firebase App Check and rate limiting on the API.

# Requested remediation — 6 October 2026

This change implements the three requested repair groups only. It does not implement the missing SRS modules. The earlier audit remains at `C:/FAST/FYP/SQA_Audit/Special_Care_360_SQA_Report.md`.

## Authority and preservation of records

- Verified Firebase identity is bound to an approved, enabled user profile. Placeholder mode cannot authenticate arbitrary tokens. Revoked tokens are checked; production startup rejects missing credentials.
- All protected mounted API handlers enforce child ownership, centre, teacher assignment or therapist assignment. Actors and references are validated; the caller cannot supply another UID to gain authority. Registration is an intentional pending-account exception, restricted to the authenticated UID.
- Firestore rules enforce the same authority for browser writes and queries. Enrollment commits the student, medical profile and empty care plan together. Assigned guardians and clinicians must be approved members of the same centre.
- Student removal archives one root document atomically. It never cascades deletions through clinical or billing history. Permission failure leaves every document intact.
- Offboarding disables the authority profile first, then disables Firebase Authentication and revokes refresh tokens. A failed identity-provider operation reports that retry is required while database access stays disabled. Disabled profiles cannot be deleted and recreated by self-registration.

## Reliable safety processing

- Panic alerts are durable outbox records. Notification fan-out uses deterministic IDs and a transaction, retry/backoff and backlog processing. Recorded emergencies remain deliverable after reporter offboarding or student archival.
- The browser distinguishes unconfirmed writes, recorded alerts awaiting delivery, delivered alerts and outages. An offline Firestore write cannot display a false delivery confirmation.
- Email is a separate leased retry queue. SMTP is at least once: a crash after SMTP acceptance but before saving the acknowledgment can duplicate an email. In-app notification transactions are deduplicated.
- Medication scanning persists a checkpoint, checks the preceding day across midnight, processes overdue backlog and advances the checkpoint only after successful processing. Dose alerts are transactionally deduplicated. `tzdata` is a required dependency and was installed in the local backend environment.
- Safety workers have a dedicated executor. Sync database request handlers run in FastAPI's request pool; AI requests use bounded asynchronous network calls.

## Existing workflow repairs

- Discussion listeners carry both child and activity scope. Parent billing queries prove child ownership and preserve archived-child history.
- IEP editing restores saved drafts and uses the actual Cohere provider configuration. Insufficient clinical input returns the manual fallback before attempting a provider call.
- ABC records retain the selected occurrence timestamp. Journal history has an unambiguous route. Empty goal plans can be saved.
- Goal completion, suggestion acceptance and finalization use transactions and version checks. UI state follows the committed result. Stale editors cannot silently replace concurrently changed goals.
- Invoice and receipt actions create CSV files containing saved records; formula-like cell values are escaped.
- Teletherapy fails closed when signed room authorization is unavailable.

## Validation

| Check | Verified result |
|---|---|
| Backend unit suite | Full run: 40 tests, 38 passed and two emulator-only cases skipped here; those two passed separately. Final safety rerun: 10/10 passed, including the added measured connection-outage case. There are 41 unique backend cases across these runs. |
| Firestore rules | 9/9 passed, including cross-scope reads, writes and deletes. |
| Persisted frontend workflows | 11/11 passed using the actual frontend data layer and application Firebase SDK. |
| Real backend transaction acceptance | Both concurrent panic and missed-dose cases passed against Firestore Emulator. |
| TypeScript | Passed after the final goal-transaction retry change. |
| ESLint | Passed: 0 errors, 11 warnings. |
| Production build | Passed: Next.js 16.2.4 compiled, type-checked and generated all 15 static pages. |

Final concurrent emulator panic delivery: **3,019 ms**; four concurrent calls completed in **3,243.63 ms**, with exactly one notification per recipient. Isolated safety delivery while AI remained stalled: **365.48 ms** in the final safety rerun. A controlled storage connection outage lasting three real seconds recovered the durable backlog in **3,135.71 ms**; persisted notification latency was **3,136 ms**, with no duplicate notifications. The separate synthetic-clock fixture recorded **3,000 ms**. These measurements are local fixtures, not a deployed end-to-end SLA or an SMTP delivery guarantee. An earlier overloaded run exceeded five seconds, so production latency must be measured rather than inferred from the final local result.

The local npm registry became unavailable during dependency installation. Acceptance tests used a verified cached rules-testing package and the frontend's installed Firebase SDK (12.14.0), against the real loopback emulator; they did not substitute mocked rules or a fake transaction engine. The committed QA lockfile and CI job provide the normal reproducible installation path when registry access is available. The optional Firebase CLI is needed for `npm run test:rules`; it was not fully reinstalled locally during the registry outage.

Across the runs, **61 unique cases were verified**: 41 backend cases (including both real transaction cases), nine rule cases and 11 persisted frontend workflow cases. `git diff --check` also passed. The test emulator was stopped after validation.

Medication detection uses scheduled scans: 60 seconds by default, with a configurable minimum interval of 30 seconds. Reliable retry and midnight/backlog handling do not establish a five-second dose-threshold-to-notification SLA.

Tests include negative authorization checks across protected mounted routes and Firestore collections; atomic enrollment; failed removal preserving persisted documents; persisted occurrence timestamps and drafts; stale/concurrent goal edits; discussion subscriptions; queued/outage alert states; real CSV downloads; and concurrent real Firestore safety transactions.

## Release requirements

Deploy backend, frontend, Firestore rules and indexes together. Configure real Firebase credentials, the AI provider and signed teletherapy provider. Existing assignments must contain real authenticated UIDs, not display names. Link staff directory entries to their authenticated accounts before offboarding. Do not interpret directory-only removal as revocation of an unidentified account. No production deployment or remote CI run was performed in this task.

## Modules with work remaining for the next phase

- Automated regression detection and resolution
- Clinical goal conflict detection and resolution
- Secure therapy/progress video upload and review
- Parent online payments
- Unified clinical timeline
- Longitudinal mastery history
- IEP clinical knowledge, SMART validation and version history
- Comprehensive access audit logging

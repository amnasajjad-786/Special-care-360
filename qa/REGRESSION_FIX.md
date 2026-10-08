# Regression logging repair — 7 October 2026

Integrated the teammate's regression UI from origin/main without replacing the existing access, archival and goal-transaction fixes. The missing milestoneObservationsDb export is restored.

## Saved workflow

- Approved assigned teachers submit observations to POST /api/regression/observations using their Firebase ID token. Identity, student scope and goal baseline are checked by the server, not trusted from submitted display fields.
- The observation, regression state, alert update and assigned-therapist notifications commit in one Firestore transaction. Permission/storage failure leaves no partial observation.
- Request IDs deduplicate retries. Concurrent observations serialize through a per-student/per-goal state document. One below-baseline observation is Monitoring; two consecutive below-baseline observations become Regression Warning. Maintaining Mastery resets the streak. A new observation after clinical resolution starts another review episode.
- Only an existing achieved goal supplies the mastery baseline. Scores 100/60/20 are category mappings, not measured clinical percentages. The reason describes the change in percentage points.
- Teachers can read observations/alerts for assigned students; therapists can read assigned children; admins stay within their centre. Parents, pending profiles and unrelated staff are denied. Client writes to observations, detector state and new alerts are blocked; therapist/admin resolution is restricted to the resolved field.
- History loading waits for the centre profile. A saved log followed by a refresh failure reports that saving succeeded. Regression load failures are visible rather than displayed as no alerts.

## Firebase and deployment

The tested Firestore rules were published to Firebase project special-care-360 with explicit user approval. Published ruleset: projects/special-care-360/rulesets/49638cce-dec9-4ada-afd4-29938ca459d1. Previous release metadata is saved locally in qa/firebase-rules-release-before.json.

The service account was denied composite-index creation (403). The final regression queries instead use equality filters on the authorized child and centre and sort locally. Detection uses direct transactional document reads; this repaired workflow does not require the proposed composite indexes. Declarations are retained in firestore.indexes.json for future server-side ordering. No existing indexes were deleted.

Both updated frontend and backend are required. Publishing rules alone does not update a teammate's old browser client or remote backend. Locally, the servers were restarted and the regression endpoint and student page responded successfully. No remote frontend/backend hosting deployment or Git push was performed.

## Verification

- Production build passed with all 15 pages; TypeScript passed.
- Backend suite: 48 cases, 45 passed and three emulator-only cases skipped in that run. The added seven regression unit cases cover authorization, rollback, escalation, reset, resolution, retries and concurrency.
- All 10 Firestore rule tests passed against the real local emulator.
- All 11 prior persisted frontend workflow tests passed. A further regression history test checks real scoped reads, chronological sorting, legacy Timestamp conversion and empty-centre rejection.
- Real Firestore concurrent regression transaction test passed, preserving two observations, one warning and one therapist notification after retry.

Rules tests and transaction tests use synthetic emulator records. No live student observations were created during verification.

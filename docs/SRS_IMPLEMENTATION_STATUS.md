# SRS implementation status and evidence

Updated: 2026-11-21. The full specification is now `docs/SRS.md`. This file records observable implementation status; it is not a claim of regulatory certification or deployment acceptance.

## Code-level requirements addressed

| Requirement area | Current implementation | Evidence / limit |
| --- | --- | --- |
| Identity and role authorization | Backend derives approved identity, role, and center from verified Firebase token plus server profile; protected APIs reject missing or unapproved profiles. Teacher student access checks assignment. | Backend authorization unit tests and CI. Direct Firestore access is governed separately by `firestore.rules`. |
| IEP quality and history | SMART completeness reminders, advisory possible-conflict review, immutable finalized versions, and version conflict protection. | Frontend lint/type-check/build and IEP persistence/rules checks in CI. Conflict detector is a conservative text heuristic; therapists make clinical decisions. |
| Behavior and regression evidence | ABC trend reporting requires a minimum evidence set; regression observations require existing student and mastered goal; alerts preserve observation history. | Backend and Firebase emulator acceptance tests in CI. |
| Daily care | Meals can be recorded as not observed; scoped history available. | Firestore rules acceptance tests in CI. |
| Home plan and progress videos | Family activity completion history; authenticated private progress video metadata, upload/review, and configured 30-day retention. | Backend/CI coverage. Firebase Storage enablement (Blaze), `storage.rules` deploy, secrets, and scheduled retention execution still require deployment verification. |
| Clinical history | Student view combines therapy, ABC, daily care, IEP versions, milestone observations, regression alerts, home-plan logs, and permitted progress-video metadata into a sorted overview. Partial source failures are indicated. | Application implementation; CI build checks. Clinical summaries are intentionally compact and category data follows existing source permissions. |
| Finance | Safepay online payment (server-verified, webhook) and manual bank transfer workflow; admin can download invoice/payment receipt and student CSV exports. | Application implementation. Safepay merchant keys, bank instructions and reconciliation require organization configuration and operational review. |
| Caregiver role | Admin-linked caregivers (max 3 per child) with read-only family access, messages, documents and guardian notifications. | Rules emulator tests and backend unit tests. |
| Progress and mastery | Measured mastery %, server validation against category, per-goal progress charts, parent-readable observation history. | Backend regression tests; manual cases TC-T04/T05. |
| Messaging, documents, reports | Append-only care-team threads; private document storage with signed links; printable progress reports. | Rules and backend unit tests. Document bucket must be configured per deployment. |
| Reminders | 24 h and 1 h appointment reminders, de-duplicated. | Backend unit tests. Requires an always-on backend. |
| Audit log | Append-only web and API audit trail with admin review and CSV export. | Rules emulator tests. |
| Mobile | Installable PWA with phone layout. | Manual case TC-P05. Native app out of scope. |
| CI and automated quality | GitHub Actions run frontend lint/typecheck/build, backend unit tests, Firestore emulator acceptance tests, and commit attribution checks. | Check the latest Actions run linked from the repository. |

## Requirements still needing real-world evidence or decisions

- Organization-owned SRS sign-off and a complete requirement-by-requirement acceptance matrix against the authoritative, versioned SRS.
- Manual user acceptance evidence from therapists, teachers, parents, caregivers and administrators, including usability and accessibility review. The plan and sign-off sheet are in `docs/UAT_PLAN.md`; sessions not yet held.
- Hosting, availability/uptime, recovery, load and performance measurements. Procedures are written in `docs/DEPLOYMENT.md`; production hosting and measurements are not yet done.
- Privacy, legal, HIPAA/FERPA and Pakistan data-locality applicability review, retention policy approval, and security assessment. Implemented controls alone do not establish compliance.
- Production Firebase, Firebase Storage (Blaze), Safepay merchant keys, bank-transfer instructions, API secrets, trusted origins, backup policy, and scheduled 30-day video deletion validation.
- Research contribution, literature support, model evaluation and accuracy, and final research discussion/results.
- Final FYP report formatting, test report inclusion, deployment evidence, screenshots/video, and supervisor/organization acceptance.

## Testing evidence

The repository CI provides repeatable automated unit and emulator acceptance checks. The organization also requires the test report to be included in the final report document. CI results do not replace production service acceptance or manual usability testing. Record the Actions run identifier and attach the generated test report when assembling the final FYP submission.

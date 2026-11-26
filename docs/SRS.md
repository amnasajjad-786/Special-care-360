# Special Care 360 — Software Requirements Specification

Version 1.1 · 21 November 2026 · Status: draft for supervisor and centre sign-off

This SRS consolidates the requirements from the Project Charter, the project plan / WBS and
Assignment 3 (functional points FP #1–#17), and records how each one is met in the current code.
Status meanings: **Implemented** (in the code and covered by tests or a written manual test case),
**Partial** (works with a documented limit), **Out of scope** (deliberately not built; reason given).
"Implemented" is a statement about the software, not a claim of clinical, legal or regulatory
approval.

---

## 1. Introduction

### 1.1 Purpose
Special Care 360 is a care-coordination platform for special education centres. It gives the
centre's admins, teachers and therapists, and each child's family, one shared and access-controlled
record of the child's care, behaviour, therapy and progress.

### 1.2 Scope
In scope: role-based accounts with admin approval; student profiles with medical, emergency and
care-plan data; daily care journals; medication administration and missed-dose alerts; ABC
behaviour tracking with AI-assisted pattern analysis; IEP building; goal mastery and early
regression detection; panic alerts; teletherapy; therapy timeline; home-plan activities and
progress videos; care-team messaging; shared documents and progress reports; appointment reminders;
fees with bank-transfer and Safepay online billing; audit logging; installable mobile web app.

Out of scope for this release: a native (store-distributed) mobile app,
and any claim of HIPAA/FERPA certification (see §6).

### 1.3 Definitions
| Term | Meaning |
|---|---|
| ABC | Antecedent–Behaviour–Consequence incident record |
| IEP | Individualised Education Program |
| Guardian | The child's parent account (`parentId`) |
| Caregiver | A relative or home carer an admin links to a child (`caregiverIds`) |
| Centre | One organisation; every record carries its `centerId` |
| Mastery | A goal measured at 80 % or more |
| PWA | Progressive Web App — a website installable to a phone home screen |

### 1.4 References
Project Charter; Project Plan and WBS; Assignment 3; `docs/USE_CASES.md`; `docs/UAT_PLAN.md`;
`special_care_360_testing/*.xlsx`; `automated_unit_testing/reports/Automated_Unit_Testing_Report.xlsx`.

---

## 2. Overall description

### 2.1 Product perspective
A Next.js web application talks directly to Cloud Firestore; Firestore security rules are the
authorisation layer. A FastAPI service handles what a browser must not do itself: AI calls
(Gemini, Cohere), panic-alert fan-out and email, mastery/regression evaluation, private file storage
(Firebase Storage), video processing, Safepay payment verification, and scheduled jobs (missed medication, appointment reminders).

```
Browser (Next.js PWA) ──► Firestore (rules enforce role, centre, child assignment)
        │
        └──► FastAPI ──► Firestore (Admin SDK) · Firebase Storage (private) · Safepay · Gemini / Cohere · SMTP
                 └── background loops: missed-dose monitor, appointment reminders, video retention
```

### 2.2 User classes
| Role | Who | Access |
|---|---|---|
| Admin | Centre management | Everything in their centre; approvals, assignments, billing, audit log |
| Teacher | Classroom staff | Assigned students: daily care, ABC, mastery observations, panic alerts |
| Therapist | Clinical staff | Assigned students: care plan/IEP, teletherapy, home plan, regression review |
| Parent | Child's guardian | Own children: read care records, messages, documents, home-plan logging, fees |
| Caregiver | Relative/home carer | Linked children only: read-only family view, messages, documents |

### 2.3 Operating environment
Modern evergreen browsers (Chrome, Edge, Safari, Firefox) on desktop, Android and iOS. Backend:
Python 3.11. Firebase project with Firestore and Authentication; Firebase Storage (Blaze plan) for
private files; optional SMTP for email.

### 2.4 Constraints
- Authorisation must be provable by Firestore rules: every record denormalises `centerId` and
  `parentId`, and every list query carries the matching filter.
- No fabricated data may be shown; failures render explicit error states.
- Times are interpreted in Asia/Karachi where a time zone is not stored.

---

## 3. Functional requirements

### 3.1 Accounts and access
| ID | Requirement | Source | Status |
|---|---|---|---|
| FR-1.1 | Users register with name, email, password, role and centre; every registration is pending until an admin approves it. | WBS 1.3.1, FP #1 | Implemented |
| FR-1.2 | Staff must use the centre email domain; parents and caregivers may use any email. | Plan | Implemented |
| FR-1.3 | Users log in by selecting their role; a login under the wrong role is refused. | FP #1 | Implemented |
| FR-1.4 | Failed logins show one neutral message that does not reveal whether the email is registered. | Security | Implemented (v1.1) |
| FR-1.5 | Users can request a password-reset email; the response is the same whether or not the account exists. | WBS 3.1.3 | Implemented (v1.1) |
| FR-1.6 | Each role sees only the navigation and pages permitted to it. | FP #2 | Implemented |
| FR-1.7 | An admin can approve, create and offboard users in their centre; nobody can change their own role, status or centre. | Plan | Implemented |
| FR-1.8 | An admin can link up to three approved caregivers to a child. | Charter | Implemented (v1.1) |

### 3.2 Student profiles
| ID | Requirement | Source | Status |
|---|---|---|---|
| FR-2.1 | Admins enrol students with parent (existing or new), teacher and up to four therapists. | FP #3 | Implemented |
| FR-2.2 | Profiles have Overview, Medical, Care Plan, Emergency and Therapy Timeline tabs. | FP #3 | Implemented |
| FR-2.3 | Removing a student archives it; history is never deleted by a client. | Plan | Implemented |
| FR-2.4 | Viewing a student's record is written to the audit log (once per session per section). | WBS 2.4.3 | Implemented (v1.1) |

### 3.3 Daily care and medication
| ID | Requirement | Source | Status |
|---|---|---|---|
| FR-3.1 | Teachers record meals, mood timeline, hygiene and notes per day; meals may be marked not observed. | FP #4 | Implemented |
| FR-3.2 | Guardians and caregivers see a read-only Daily Digest and are notified on submission. | FP #5 | Implemented |
| FR-3.3 | Medications support 1–3 scheduled doses a day; staff record each administration. | FP #6 | Implemented |
| FR-3.4 | A dose not recorded 60 minutes after its time raises one missed-dose alert to parent and admins. | FP #6 | Implemented |

### 3.4 Behaviour (ABC)
| ID | Requirement | Source | Status |
|---|---|---|---|
| FR-4.1 | Staff log incidents with antecedent, behaviour, consequence, severity, location, time and sensory factors. | FP #8 | Implemented (sensory factors v1.1) |
| FR-4.2 | Incidents can be filtered by date range, time of day, location and sensory factor; charts, heatmap and table follow the filter. | FP #10, WBS 3.3.3 | Implemented (v1.1) |
| FR-4.3 | The tracker shows top triggers, average severity, peak hour and a day × severity heatmap. | FP #9 | Implemented |
| FR-4.4 | Admins and therapists can request an AI behavioural analysis of the student's incidents (minimum five); without the AI service only factual counts are shown. | FP #11 | Implemented |
| FR-4.5 | Parents are notified of incidents involving their child. | FP #8 | Implemented |

### 3.5 Care plan, IEP and progress
| ID | Requirement | Source | Status |
|---|---|---|---|
| FR-5.1 | Therapists maintain care-plan goals with milestones; teachers and families view them. | FP #12 | Implemented |
| FR-5.2 | The IEP Builder supports AI-drafted SMART goals, conflict review and immutable finalised versions. | FP #13–14 | Implemented |
| FR-5.3 | Teachers record a measured mastery percentage (0–100) for active and mastered goals; the server validates it against the category (≥80 Achieved, ≥40 In Progress). | FP #16, WBS 3.5.2 | Implemented (v1.1) |
| FR-5.4 | Progress is charted per goal over time against the 80 % mastery line, for staff and families. | FP #17, Charter obj. 3 | Implemented (v1.1) |
| FR-5.5 | A decline below 80 % on a mastered goal raises an early regression alert for therapists and admins, who resolve it with a note or remedial goal. | FP #15 | Implemented |

### 3.6 Safety
| ID | Requirement | Source | Status |
|---|---|---|---|
| FR-6.1 | Teachers and therapists can raise a panic alert for an assigned student; all centre admins are notified in real time and by email when configured. | FP #7 | Implemented |
| FR-6.2 | Admins acknowledge and resolve alerts; alerts cannot be forged or hijacked by another reporter. | FP #7 | Implemented |

### 3.7 Therapy delivery
| ID | Requirement | Source | Status |
|---|---|---|---|
| FR-7.1 | Therapists schedule teletherapy sessions only for students with a linked, approved parent, and conduct them in an embedded video room. | Charter | Implemented |
| FR-7.2 | The therapy timeline schedules in-centre sessions with therapist and student conflict detection. | Plan | Implemented |
| FR-7.3 | Reminders are sent 24 h and 1 h before each scheduled session to the parent, linked caregivers and therapist, exactly once per window. | Charter, Jira | Implemented (v1.1) |
| FR-7.4 | Therapists assign home-plan activities; guardians log practice; adherence is computed; each activity has a discussion thread and optional private progress videos. | Charter | Implemented |

### 3.8 Communication and documents
| ID | Requirement | Source | Status |
|---|---|---|---|
| FR-8.1 | Each child has one care-team message thread for parent, caregivers, teacher, therapists and admins; messages are live, append-only and notify the rest of the team. | Charter | Implemented (v1.1) |
| FR-8.2 | Team members upload PDF, PNG, JPEG or DOCX documents (≤10 MB) for a child; type is verified from file content; files are private and downloaded through five-minute signed links. | Charter | Implemented (v1.1) — needs the private bucket configured |
| FR-8.3 | Uploaders and admins can delete documents; uploads and downloads are audited. | Charter | Implemented (v1.1) |
| FR-8.4 | Any team member can generate a printable progress report (30/90/180 days) of goals, behaviour and daily care, built only from saved records. | Charter | Implemented (v1.1) |

### 3.9 Billing
| ID | Requirement | Source | Status |
|---|---|---|---|
| FR-9.1 | Admins issue invoices and record payments; parents see their own invoices. | FP, Plan | Implemented |
| FR-9.2 | Parents pay by bank transfer and submit the transaction reference; an admin verifies before the invoice is marked paid. | Plan | Implemented |
| FR-9.3 | Online card / mobile-wallet payment. | `qa/REMEDIATION.md` | **Implemented, configuration pending** — Safepay hosted checkout (card details never reach the app); the backend verifies each payment with Safepay (return and signed webhook), checks the amount, and records it once. Needs the centre's Safepay merchant keys. |

### 3.10 Administration and audit
| ID | Requirement | Source | Status |
|---|---|---|---|
| FR-10.1 | Admin dashboard with centre statistics, staff directory, student assignments, fees and CSV reports. | Plan | Implemented |
| FR-10.2 | Every create/update/delete from the web app and the API, and every student-record view, is recorded with actor, role, action, target, student and time. | WBS 2.4.3 | Implemented (v1.1) |
| FR-10.3 | Audit entries cannot be edited or deleted; only admins of the centre can read them; they can be filtered and exported to CSV. | WBS 2.4.3 | Implemented (v1.1) |

### 3.11 Mobile
| ID | Requirement | Source | Status |
|---|---|---|---|
| FR-11.1 | The application can be installed to Android and iOS home screens and opens full-screen with its own icon. | Charter deliverable | Implemented as PWA (v1.1) |
| FR-11.2 | All pages are usable at phone widths (collapsible sidebar, scrolling tables, full-width dialogs). | Charter | Implemented |
| FR-11.3 | A native app distributed through app stores. | Charter | **Out of scope** — the PWA covers the same functions from one code base; a store app would duplicate the rules-aligned data layer. |

### 3.12 Notifications
| ID | Requirement | Source | Status |
|---|---|---|---|
| FR-12.1 | In-app notifications for journals, incidents, care-plan/medical changes, IEP finalisation, sessions, reminders, messages, documents, missed doses and panic alerts, routed to the relevant page. | Plan | Implemented |
| FR-12.2 | Notification failure never prevents the care record from being saved. | Plan | Implemented |

---

## 4. Non-functional requirements

| ID | Requirement | How it is met / status |
|---|---|---|
| NFR-1 Security — authorisation | Every read and write is checked against role, centre and child assignment at the database. | `firestore.rules`; emulator tests in `qa/`; backend `student_access` with unit tests |
| NFR-2 Security — accounts | No self-approval; no account enumeration on login or password reset. | Rules + v1.1 login change |
| NFR-3 Security — files | Private storage only; server-checked access; short-lived signed links; type checked from content. | `backend/routers/documents.py`, `progress_videos.py` |
| NFR-4 Accountability | Append-only audit trail of changes and record views. | FR-10.2/10.3 |
| NFR-5 Reliability | Background jobs are idempotent (deterministic ids / marker documents); real-time views show explicit error states. | Unit tests for medication monitor and reminders |
| NFR-6 Data integrity | Optimistic version checks on care-plan and IEP edits; archive instead of delete. | Implemented |
| NFR-7 Usability | Role-specific navigation; mobile layout; Lucide icons; plain-language messages. | Manual cases TC-P05, TC-C01 |
| NFR-8 Performance | Typical list pages load within 2 s on a 4G connection for a centre of ≤200 students. | **Not yet measured** — see `docs/DEPLOYMENT.md` §6 |
| NFR-9 Availability | Firebase managed services; backend restart-safe. | Hosting not yet provisioned |
| NFR-10 Privacy | Minimum data per role; no secrets in the browser; synthetic data in tests. | Implemented; formal privacy review pending |

---

## 5. Data model (Firestore collections)

`users`, `centers`, `students` (+ `medicalProfile/main`, `carePlan/main`, `iepRecords`,
`medicationAdministrations`), `staff`, `dailyCareJournals`, `abcIncidents`, `panicAlerts`,
`notifications`, `invoices`, `payments`, `teletherapySessions`, `therapySessions`,
`homePlanActivities`, `homePlanLogs`, `homePlanMessages`, `milestoneObservations`,
`regressionAlerts`, `careMessages`, `studentDocuments`, `auditLogs`, `appointmentReminders`
(server-only), `regressionState` (server-only). Child records carry `studentId`, `centerId` and
`parentId`; students carry `teacherId`, `therapistIds` and `caregiverIds`.

## 6. Compliance statement

The system implements access control, audit logging, private storage and least-privilege roles.
These controls support, but do not by themselves establish, compliance with HIPAA, FERPA or
Pakistan's data-protection requirements. A privacy and legal review by the centre is required
before production use with real children's data.

## 7. Acceptance
Acceptance is by the UAT plan in `docs/UAT_PLAN.md`, with sign-off by the centre's representative
for each role and by the project supervisor.

| Role | Name | Signature | Date |
|---|---|---|---|
| Centre representative | | | |
| Project supervisor | | | |
| Project team | | | |

# Special Care 360 — Use-Case Specifications

Version 1.1 · 21 November 2026. Requirement IDs refer to `docs/SRS.md`; test IDs refer to the
manual (TC-A/T/TH/P/C) and automated (TC-AUTH/SA/MED/…) test reports.

Actors: **Admin**, **Teacher**, **Therapist**, **Parent**, **Caregiver**, **System** (backend
scheduled jobs), **AI service** (Gemini/Cohere).

---

## UC-01 Register an account
- **Actor:** any new user · **Requirements:** FR-1.1, FR-1.2 · **Tests:** TC-AUTH-01–07, TC-C01
- **Precondition:** the centre exists.
- **Main flow:** 1) User opens Register, enters name, email, password, role and centre ID.
  2) System validates the email (centre domain for staff). 3) System creates the Firebase account and
  a `users` profile with status *pending*. 4) User sees "Awaiting Approval".
- **Alternatives:** 2a) Staff role with a non-centre email → refused with a message.
  3a) Email already registered → Firebase error shown.
- **Postcondition:** pending profile; no access to any child data.

## UC-02 Approve a user and assign access
- **Actor:** Admin · **Requirements:** FR-1.7, FR-1.8, FR-2.1 · **Tests:** TC-A10, TC-A11, TC-A15
- **Main flow:** 1) Admin opens Admin Panel; pending users are listed. 2) Admin approves.
  3) For staff: admin assigns them to students (teacher, up to four therapists). For a caregiver:
  admin selects them in the student's Caregivers column (up to three).
- **Alternatives:** 3a) Selected account is not an approved member of the right role → rules refuse.
- **Postcondition:** user can log in and sees only assigned children.

## UC-03 Log in / reset password
- **Actor:** any user · **Requirements:** FR-1.3–1.5 · **Tests:** TC-A01–A03, TC-A07, TC-A16
- **Main flow:** 1) User selects role, enters email and password. 2) System authenticates and loads
  the profile. 3) Role matches → user is routed to their dashboard.
- **Alternatives:** 2a) Wrong credentials → "Incorrect email or password." 3a) Role mismatch →
  signed out with a message. 1a) Forgot password → user enters email → neutral confirmation;
  a reset email is sent only if the account exists.

## UC-04 Enrol and maintain a student
- **Actor:** Admin · **Requirements:** FR-2.1–2.3 · **Tests:** TC-A04, TC-A05, TC-A11
- **Main flow:** 1) Admin adds a student, linking an existing parent or creating one. 2) System
  creates the student, medical profile and care plan atomically. 3) Admin edits details or archives.
- **Postcondition:** student visible to assigned staff and family; archive keeps history.

## UC-05 Record a daily care journal
- **Actor:** Teacher · **Requirements:** FR-3.1, FR-3.2 · **Tests:** TC-DC-01–09, TC-T01
- **Main flow:** 1) Teacher selects an assigned student and today's date. 2) Records meals, mood
  timeline, hygiene, notes. 3) Submits. 4) System saves and notifies parent and caregivers.
- **Alternatives:** 1a) Student not assigned → not listed. 2a) Meal not observed → marked as such.

## UC-06 Administer medication / missed dose
- **Actors:** Teacher, System · **Requirements:** FR-3.3, FR-3.4 · **Tests:** TC-MED-01–11, TC-A06
- **Main flow:** 1) Staff record a scheduled dose as administered or not, with notes.
  2) System checks every minute; a dose with no record 60 minutes after its time raises one
  missed-dose alert to parent and admins.

## UC-07 Log and analyse behaviour (ABC)
- **Actors:** Teacher/Therapist, Admin, AI service · **Requirements:** FR-4.1–4.5 · **Tests:** TC-ABC-01–10, TC-T02, TC-T03, TC-A09
- **Main flow:** 1) Staff log an incident (A, B, C, severity, location, time, sensory factors).
  2) System notifies the parent. 3) Any viewer filters by date range, time of day, location, sensory
  factor; charts, heatmap and table update. 4) Admin/therapist requests an AI analysis of all the
  student's incidents (at least five) and may save it to the care plan.
- **Alternatives:** 4a) AI service unavailable → factual summary counts only, labelled as such.

## UC-08 Maintain care plan and IEP
- **Actors:** Therapist, AI service · **Requirements:** FR-5.1, FR-5.2 · **Tests:** TC-TH01, TC-A08
- **Main flow:** 1) Therapist edits goals and milestones, or drafts an IEP with AI-suggested SMART
  goals. 2) Reviews conflict warnings. 3) Finalises; the version becomes immutable and syncs to the
  care plan. 4) Family is notified.
- **Alternatives:** 3a) Someone else saved first → version conflict; reload required.

## UC-09 Record mastery and review regression
- **Actors:** Teacher, Therapist, System · **Requirements:** FR-5.3–5.5 · **Tests:** TC-T04, TC-T05, TC-TH04, backend `test_regression.py`
- **Main flow:** 1) Teacher records an observation for a goal: category and/or measured %.
  2) Server validates and stores it. 3) For a mastered goal scoring below 80 %, the server raises or
  updates a regression alert. 4) Therapist reviews the alert and resolves it with a note or remedial
  goal. 5) Everyone on the child's team sees the per-goal progress chart.
- **Alternatives:** 2a) % contradicts category → 422 with an explanation.

## UC-10 Raise a panic alert
- **Actors:** Teacher/Therapist, Admin, System · **Requirements:** FR-6.1, FR-6.2 · **Tests:** TC-PANIC-01–09, TC-T06
- **Main flow:** 1) Staff press the panic button, choose student, type, location. 2) System records
  the alert, notifies every centre admin in real time and by email. 3) Admin acknowledges and resolves.
- **Alternatives:** 1a) Student not assigned to reporter → refused.

## UC-11 Conduct teletherapy
- **Actors:** Therapist, Parent · **Requirements:** FR-7.1 · **Tests:** TC-TH02
- **Main flow:** 1) Therapist schedules a session for a student with an approved parent. 2) Both join
  the embedded video room at the time. 3) Therapist records a session summary.
- **Alternatives:** 1a) No approved parent linked → scheduling refused.

## UC-12 Receive appointment reminders
- **Actor:** System · **Requirements:** FR-7.3 · **Tests:** `test_appointment_reminders.py`, TC-TH02
- **Main flow:** 1) Every 5 minutes the system scans scheduled sessions. 2) For a session 24 h or 1 h
  away it writes one marker and notifications to parent, linked caregivers and therapist.
- **Alternatives:** 2a) Marker already exists → nothing sent (no duplicates). 2b) Session rescheduled
  → reminders follow the new time.

## UC-13 Assign and follow a home plan
- **Actors:** Therapist, Parent · **Requirements:** FR-7.4 · **Tests:** TC-TH03
- **Main flow:** 1) Therapist assigns an activity. 2) Parent logs practice and may upload a practice
  video. 3) Therapist reviews adherence, replies in the thread and gives video feedback.

## UC-14 Message the care team
- **Actors:** Parent, Caregiver, Teacher, Therapist, Admin · **Requirements:** FR-8.1 · **Tests:** TC-P02, TC-C02
- **Main flow:** 1) Member opens Messages and selects the child. 2) Types and sends. 3) Message
  appears live for all members; others receive a notification.
- **Alternatives:** 2a) Empty or over 2,000 characters → refused.

## UC-15 Share and download documents
- **Actors:** any team member · **Requirements:** FR-8.2, FR-8.3 · **Tests:** TC-TH05, `test_documents.py`
- **Main flow:** 1) Member chooses a file, title and category, and uploads. 2) Server verifies access
  and file type, stores it privately, records metadata, notifies the team and audits it. 3) Another
  member downloads through a five-minute link.
- **Alternatives:** 2a) Wrong type or >10 MB → refused. 2b) Storage not configured → "not
  configured" message. 3a) Uploader or admin deletes the document.

## UC-16 Generate a progress report
- **Actors:** any team member · **Requirements:** FR-8.4 · **Tests:** TC-P03
- **Main flow:** 1) Member opens Documents & Reports and selects Generate progress report.
  2) Chooses 30/90/180 days. 3) Prints or saves as PDF.
- **Alternatives:** 1a) A source fails to load → the report lists it as incomplete.

## UC-17 Pay fees
- **Actors:** Parent, Admin · **Requirements:** FR-9.1, FR-9.2 · **Tests:** TC-P04
- **Main flow:** 1) Admin issues an invoice. 2) Parent transfers by bank and submits the reference.
  3) Admin verifies and records the payment; invoice becomes paid.

## UC-18 Review the audit log
- **Actor:** Admin · **Requirements:** FR-10.2, FR-10.3 · **Tests:** TC-A14, `qa/rules.test.cjs`
- **Main flow:** 1) Admin opens Admin Panel → Audit Log. 2) Filters by category, person or text.
  3) Exports CSV.

## UC-19 Install on a phone
- **Actor:** any user · **Requirements:** FR-11.1, FR-11.2 · **Tests:** TC-P05
- **Main flow:** 1) User opens the site on the phone. 2) Chooses Install app / Add to Home Screen.
  3) Launches the app full-screen and logs in.

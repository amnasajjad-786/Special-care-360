# Special Care 360 — User Acceptance Test Plan

Version 1.1 · 21 November 2026 · Status: **ready to run — not yet executed**

UAT confirms with real representatives of each user group that the system supports their work.
It cannot be completed by the development team alone. This plan, the scenarios and the sign-off
sheet are ready; the sessions themselves still have to be held and recorded.

## 1. Participants
| Role | Minimum participants | Recruited from |
|---|---|---|
| Admin | 1 | Centre management |
| Teacher | 2 | Classroom staff |
| Therapist | 2 | Speech / occupational / behavioural therapists |
| Parent | 3 | Volunteer families (using synthetic child records — see §3) |
| Caregiver | 1 | A relative of a volunteer family |

## 2. Environment
- Production-like Firebase project (not the development project), latest `firestore.rules` and
  indexes deployed, backend running continuously with the service account, SMTP and the private
  `student-documents` bucket configured.
- Participants use their own phones for at least the parent/caregiver sessions, with the app
  installed to the home screen (TC-P05).

## 3. Data and privacy
- **Synthetic students only.** No real child's name, diagnosis, medication or photo is entered.
- Test accounts are created per participant and disabled after UAT.
- Participants sign a short consent note covering screen observation and anonymous feedback.

## 4. Schedule
| Session | Duration | Participants | Scenarios |
|---|---|---|---|
| 1 | 60 min | Admin | S1, S2, S10, S11 |
| 2 | 60 min | Teachers | S3, S4, S5, S9 |
| 3 | 60 min | Therapists | S6, S7, S8, S9 |
| 4 | 45 min | Parents + caregiver | S9, S12, S13, S14 |
| 5 | 30 min | All | Retest of any failed scenarios |

## 5. Scenarios
Each scenario maps to manual test cases in `special_care_360_testing/Special_Care_360_Testing_Report_FYP.xlsx`.

| ID | Scenario (task given to the participant) | Role | Test cases | Acceptance criterion |
|---|---|---|---|---|
| S1 | "Approve the new teacher and assign them to Ali; link Ali's grandmother as caregiver." | Admin | TC-A10, TC-A15 | Done unaided in ≤5 min |
| S2 | "Enrol a new child whose sibling is already at the centre." | Admin | TC-A04, TC-A11 | Existing parent reused, no duplicate account |
| S3 | "Record today's lunch, mood and notes for Ali." | Teacher | TC-T01 | Parent receives the notification |
| S4 | "Log the incident you just saw (role-play card) including what in the room set it off." | Teacher | TC-T02 | All fields incl. sensory factors saved |
| S5 | "Record that Ali got 6 of 10 trials right on his current goal." | Teacher | TC-T04 | 60 % shown on the progress chart |
| S6 | "Ali's behaviour has been worse in the afternoons — check whether noise is a factor." | Therapist | TC-T03 | Correct filters used; participant states the answer |
| S7 | "Update Ali's care plan and finalise his IEP." | Therapist | TC-TH01 | Family notified; finalised version locked |
| S8 | "Schedule tomorrow's teletherapy and share the assessment PDF with the family." | Therapist | TC-TH02, TC-TH05 | Reminder received; parent downloads the PDF |
| S9 | "Ask the team a question about Ali's medication." | All | TC-P02, TC-C02 | Message seen live by the others |
| S10 | "Find out who changed Ali's care plan this week and export it." | Admin | TC-A14 | Correct entry found; CSV opens |
| S11 | "A child is having a medical emergency." (staff trigger; admin responds) | Admin + staff | TC-T06 | Admin alerted within 10 s; alert resolved |
| S12 | "Install the app on your phone and check how today went for your child." | Parent | TC-P05 | Installed; digest read without help |
| S13 | "Print a progress report for the last three months." | Parent | TC-P03 | PDF produced |
| S14 | "Pay this month's invoice by bank transfer." | Parent | TC-P04 | Reference submitted; admin confirms |

## 6. Measures
For every scenario record: completed (yes / with help / no), time taken, errors made, and the
participant's ease rating (1 very hard – 5 very easy). After each session, each participant
completes the 10-question System Usability Scale (SUS).

**Exit criteria:** every scenario completed by at least one participant of its role without help;
no open defect of severity High; mean SUS ≥ 68.

## 7. Defect handling
Log each problem in the report's Bug & Change Log (BUG-xx), with severity High (blocks the task or
exposes data), Medium (task done with workaround) or Low (cosmetic). High defects are fixed and the
scenario re-run in session 5.

## 8. Results (fill in during UAT)
| Scenario | Participant | Completed | Time | Errors | Ease (1–5) | Notes / defect |
|---|---|---|---|---|---|---|
| S1 | | | | | | |
| S2 | | | | | | |
| S3 | | | | | | |
| S4 | | | | | | |
| S5 | | | | | | |
| S6 | | | | | | |
| S7 | | | | | | |
| S8 | | | | | | |
| S9 | | | | | | |
| S10 | | | | | | |
| S11 | | | | | | |
| S12 | | | | | | |
| S13 | | | | | | |
| S14 | | | | | | |

SUS mean: ______ Open High defects: ______

## 9. Feedback questions (end of each session)
1. Which task was the hardest, and why?
2. Was anything you expected to find missing?
3. Did anything on screen look wrong or untrustworthy?
4. Would you use this instead of your current method (paper, WhatsApp, spreadsheets)? Why / why not?
5. Anything else?

## 10. Sign-off
| Role | Name | Accepted (Yes / With conditions / No) | Conditions | Signature | Date |
|---|---|---|---|---|---|
| Centre admin | | | | | |
| Teacher representative | | | | | |
| Therapist representative | | | | | |
| Parent representative | | | | | |
| Project supervisor | | | | | |

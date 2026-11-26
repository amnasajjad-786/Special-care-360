# Special Care 360 — Administrator Guide

## 1. First admin
The first admin account cannot be created through the website, by design. It is provisioned by the
project team with `backend/seed_firestore.py`. After that, admins approve or create all other
accounts.

## 2. Admin Panel tabs
| Tab | Use it to |
|---|---|
| Dashboard | See centre statistics, pending approvals and recent activity |
| Students | Enrol, edit and archive students; assign teacher, therapists and caregivers |
| Staff | View the staff directory; add staff with login credentials |
| Fees | Issue invoices, verify bank-transfer submissions, record payments |
| Reports | Download CSV reports (students, invoices, payments, attendance as inferred from journals) |
| Audit Log | Review who changed or viewed which child's records; export CSV |

The **Alerts** page (sidebar) shows panic alerts in real time.

## 3. Accounts

### Approve registrations
Every self-registration — including one requesting the admin role — arrives as **pending**.
Check that the person is who they claim to be (staff use `@specialcare360.com` emails), then
approve. Do not approve accounts you cannot verify.

### Add staff directly
**Staff → Add Staff Member**: name, email, role (Admin/Teacher/Therapist), initial password. Give
the password to the person securely and ask them to change it with **Forgot password**.

### Offboard
Disable leavers promptly. Disabled profiles are kept so the email cannot simply re-register.

## 4. Students and assignments
- **Enrol:** Students → Add Student. Link an **existing parent** (e.g. siblings) or create a new parent
  account. The medical profile and care plan are created with the student.
- **Assign:** in the student table choose the **teacher**, up to four **therapists** (Ctrl/Cmd+click
  for several) and up to three **caregivers**. Only approved accounts with the right role can be
  assigned; the database refuses anything else.
- **Archive:** the delete icon archives the student. Records are kept for history and billing but no
  longer appear in daily views.

Staff and families see **only** the students they are assigned to; if someone reports a missing
child, check the assignment first.

### Caregivers
A caregiver registers with the Caregiver role. Approve them, then select them in the student's
**Caregivers** column. They get a read-only view of that child (profile, care plan and progress,
daily care, behaviour), plus Messages and Documents, and receive the same notifications as the
parent. Remove a caregiver by deselecting them.

## 5. Billing
1. **Fees → New Invoice** for a student.
2. The parent either pays **online** (card or wallet through Safepay) or by bank transfer.
3. **Online:** nothing to do. Safepay confirms the payment to the server, the payment is recorded
   and the invoice is marked paid; you get a notification. If a parent pays online for an invoice
   you had already settled by transfer, the notification says so: refund it from Safepay.
4. **Bank transfer:** check the centre's bank statement, then **record the payment**. Only then is
   the invoice paid.

Bank details shown to parents come from `NEXT_PUBLIC_BANK_*` settings. The online button appears
only once the Safepay keys are configured on the server.

## 6. Safety
- **Panic alerts** notify every admin in the centre instantly (and by email when SMTP is set up).
  Acknowledge, act according to the centre's emergency procedure, then **resolve** with notes.
- **Missed medication** alerts arrive when a dose is not recorded within 60 minutes.
- **Regression alerts** are raised when a mastered goal declines; therapists resolve them.

## 7. Audit log
**Admin Panel → Audit Log** lists, newest first: who (name and role), what (action and summary),
which child, and when. Sources: *web* (the app) and *api* (server actions such as document uploads).
Student-record views are logged once per session per section.
- Filter by category or person, or search the text.
- **Export CSV** for an inspection or incident review.
- Entries cannot be edited or deleted by anyone, including admins.

Review the log regularly and after any concern about inappropriate access.

## 8. Documents
Any team member can share documents for a child. Admins can delete any document. Storage must be
configured once by the technical team (Firebase Storage); until then uploads report "not
configured".

## 9. Data quality
The app never shows invented numbers. Empty sections mean nothing was recorded; red error messages
mean data could not be loaded — report persistent errors to the technical team rather than
re-entering data.

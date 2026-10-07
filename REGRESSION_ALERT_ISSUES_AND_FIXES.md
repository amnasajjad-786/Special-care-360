# Regression Alert System: Issues, Root Causes & Fixes

This document details all technical issues encountered during the implementation and testing of the **Regression Alert System** and **Teacher Care Plan Skill Tracking** in **Special-care-360**, their root causes, and how each was resolved.

---

## 1. Firebase Security Rules: "Missing or Insufficient Permissions"

### The Issue
When a teacher logged a skill observation using the **Save Progress Log** button, Firestore returned:
```
FirebaseError: Missing or insufficient permissions.
```

### Root Causes
1. **Teacher Lacked Read Permissions on `regressionAlerts`:**
   Inside `milestoneObservationsDb.log()`, the system queries the `regressionAlerts` collection to check whether an active, unresolved alert already exists for this goal (to avoid duplicates or upgrade a `Monitoring` alert to a `Regression Warning`):
   ```typescript
   const existingSnap = await getDocs(
     query(
       collection(db, "regressionAlerts"),
       where("studentId", "==", observation.studentId),
       where("goalId", "==", observation.goalId),
       where("resolved", "==", false),
       limit(1)
     )
   );
   ```
   However, `firestore.rules` originally only allowed therapists and admins to read regression alerts:
   ```javascript
   // ❌ Old rule
   match /regressionAlerts/{alertId} {
     allow read: if (isTherapist() || isAdmin()) && inMyCenter();
   }
   ```
   Because teachers did not have `read` permission, the query failed immediately.

2. **Query Lacked `centerId` Filter:**
   Firestore security rules enforce centre isolation via `inMyCenter()`:
   ```javascript
   function inMyCenter() { return resource.data.centerId == getCenterId(); }
   ```
   In Firestore, rules are evaluated **statically against query filters**, not dynamically by inspecting results. If a query does not explicitly filter by `where("centerId", "==", userCenterId)`, Firestore rejects the query with a permissions error.

### How It Was Fixed
1. **Updated `firestore.rules`** to grant read access to all centre staff (`isStaff()`, which includes teachers, therapists, and admins):
   ```javascript
   // ✅ Updated rule
   match /regressionAlerts/{alertId} {
     allow read: if isStaff() && inMyCenter();
     allow create: if (isTherapist() || isAdmin() || isTeacher()) && writingMyCenter();
     allow update: if (isTherapist() || isAdmin()) && inMyCenter();
     allow delete: if false;
   }
   ```
2. **Added `centerId` to the query** in `frontend/lib/firestore-api.ts`:
   ```typescript
   query(
     collection(db, "regressionAlerts"),
     where("centerId", "==", observation.centerId),
     where("studentId", "==", observation.studentId),
     where("goalId", "==", observation.goalId),
     where("resolved", "==", false),
     limit(1)
   )
   ```

---

## 2. Missing Firestore Composite Indexes

### The Issue
Firestore queries in `listForStudent()` and decline counting failed or required manual index generation in Firebase Console.

### Root Causes
Firestore requires composite indexes for:
1. Queries combining equality (`==`) filters on multiple fields with `orderBy()`.
2. Queries filtering on multiple different fields simultaneously across collections.

Specifically:
- `milestoneObservations` queried by `studentId` + `centerId` and ordered by `observedAt DESC`.
- `milestoneObservations` queried by `studentId` + `goalId` + `observedStatus` to count repeated declines.
- `regressionAlerts` queried by `centerId` + `studentId` + `goalId` + `resolved`.

### How It Was Fixed
Added composite index definitions into `firestore.indexes.json`:
```json
{
  "collectionGroup": "milestoneObservations",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "studentId", "order": "ASCENDING" },
    { "fieldPath": "centerId", "order": "ASCENDING" },
    { "fieldPath": "observedAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "milestoneObservations",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "studentId", "order": "ASCENDING" },
    { "fieldPath": "goalId", "order": "ASCENDING" },
    { "fieldPath": "observedStatus", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "regressionAlerts",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "centerId", "order": "ASCENDING" },
    { "fieldPath": "studentId", "order": "ASCENDING" },
    { "fieldPath": "goalId", "order": "ASCENDING" },
    { "fieldPath": "resolved", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "regressionAlerts",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "centerId", "order": "ASCENDING" },
    { "fieldPath": "resolved", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

---

## 3. Empty `centerId` Race Condition on Page Load

### The Issue
If a teacher opened a student's profile and immediately clicked **Save Progress Log**, the submission could fail due to an empty `centerId` (`""`).

### Root Cause
The `profile` state from `useAuth()` takes a few milliseconds to load from Firebase Auth. If `centerId` was empty, the document was written with `centerId: ""`. The Firestore security rule `writingMyCenter()` requires `request.resource.data.centerId == getCenterId()`. Because `"" != userCenterId`, the write was denied.

### How It Was Fixed
In `TeacherCarePlanTab.tsx`:
1. Resolved `centerId` with fallback: `const resolvedCenterId = centerId || profile?.centerId || "";`
2. Added a pre-flight guard before initiating the Firestore write:
   ```typescript
   if (!resolvedCenterId) {
     toast.error("Profile not loaded yet — please wait a moment and try again.");
     return;
   }
   ```
3. Added specific error toast handling to display the exact error message instead of a generic failure notice.

---

## 4. Percentage Progress Scoring & Outlier vs. Warning Logic

### The Issue
Early regression alerts previously stored raw values (e.g., `previousProgress: 100`, `currentProgress: 0`) and did not clearly differentiate between a **one-time outlier** and a **persistent regression**.

### Root Cause & Desired Clinical Behavior
- In special education and ABA therapy, a student having a bad day on a single observation should not trigger an immediate high-priority alert.
- **First decline** = **Monitoring** (outlier).
- **Two or more consecutive declines** = **Regression Warning** (therapist action required).
- The alert needed to display concrete percentage comparisons:
  - Previous Mastered Baseline: `100%`
  - Current Teacher Observation:
    - *Maintaining Mastery* (`Achieved`): `100%`
    - *Improving / Developing* (`In Progress`): `60%`
    - *Skill Loss / Declining* (`Failed/Declined`): `20%`
  - Change: `↓ 40%` or `↓ 80%`

### How It Was Fixed
1. **Added percentage scoring in `firestore-api.ts`:**
   ```typescript
   const statusToScore = (s: MilestoneObservationStatus): number =>
     s === "Achieved" ? 100 : s === "In Progress" ? 60 : 20;
   const previousScore = 100;
   const currentScore = statusToScore(observation.observedStatus);
   const declineAmount = previousScore - currentScore;
   ```
2. **Added outlier detection:**
   - 1 decline: Alert level set to `"Monitoring"`.
   - 2+ declines: Alert level escalated to `"Regression Warning"` and notification sent to staff.
3. **Structured Alert Payload:**
   Stored `previousProgress`, `currentProgress`, `decline`, `reason`, and `currentObservationStatus` in `regressionAlerts`.

---

## 5. Regression Alert Card UI Alignment

### The Issue
The therapist banner did not clearly display all key regression fields (Student, Skill, Previous Level, Current Log, Change, Status, Reason, Date, Action).

### How It Was Fixed
Redesigned `RegressionAlertsBanner.tsx` to render structured cards matching the required format:
- **Student:** Student name
- **Skill:** Goal title
- **Previous Mastered Level:** `100%` (IEP Baseline)
- **Current Teacher Log:** `60%` or `20%` (with observation status tag)
- **Change:** `↓ 40%` or `↓ 80%`
- **Status:** `Regression Detected` or `Flagged for Monitoring`
- **Reason:** Comprehensive textual explanation with baseline date and decline history
- **Date:** Formatted observation timestamp
- **Action:**
  - If Warning: `⚠️ Action: Therapist Review Required`
  - If Monitoring: `📋 Action: Continue Monitoring — Another decline triggers Warning`

---

## 6. How to Deploy Security Rules & Indexes to Firebase

When applying these changes to your live Firebase environment, run:

```bash
# Deploy Firestore security rules
firebase deploy --only firestore:rules

# Deploy Firestore composite indexes
firebase deploy --only firestore:indexes
```

Or copy the updated rules from `firestore.rules` into the **Firebase Console → Firestore Database → Rules** tab and click **Publish**.

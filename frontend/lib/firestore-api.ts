/**
 * firestore-api.ts
 * Direct Firestore data layer — the frontend's primary access path.
 *
 * Query/rule alignment
 * --------------------
 * Firestore rejects any list query it cannot *prove* satisfies the security
 * rules. Since firestore.rules authorises records by `centerId` (staff) or
 * `parentId` (guardians), every list query here must carry the matching
 * `where` clause. That is what `scopeFilter()` does — dropping it silently
 * breaks the page with a permission-denied error rather than a filter bug.
 *
 * For the same reason, records are written with `centerId` and `parentId`
 * denormalised onto them. Do not remove those fields from a write path.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";
import { v4 as uuidv4 } from "uuid";

export const DEFAULT_CENTER_ID = "center-001";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StudentDoc {
  id: string;
  name: string;
  dob: string;
  diagnosis: string;
  centerId: string;
  teacherId: string;
  therapistIds: string[];
  /** Resolved display names. The *Id fields keep holding real UIDs. */
  teacherName?: string;
  therapistNames?: string[];
  enrollmentDate: string;
  iepStatus: string;
  photoUrl: string;
  parentId: string;
  [key: string]: unknown;
}

/** Who is asking. Determines which `where` clause a list query must carry. */
export interface AccessScope {
  role: string;
  uid: string;
  centerId: string;
}

export function scopeOf(
  profile: { role?: string; uid?: string; centerId?: string } | null | undefined
): AccessScope {
  return {
    role: profile?.role ?? "",
    uid: profile?.uid ?? "",
    centerId: profile?.centerId ?? DEFAULT_CENTER_ID,
  };
}

/**
 * The single `where` clause that makes a query provably safe under the rules.
 * Guardians are scoped to their own child's records; staff to their centre.
 */
function scopeFilter(scope: AccessScope): QueryConstraint {
  return scope.role === "parent"
    ? where("parentId", "==", scope.uid)
    : where("centerId", "==", scope.centerId);
}

/** Notification fan-out must never take a care record down with it. */
async function notify(
  recipientId: string | undefined,
  payload: { type: string; title: string; message: string; [k: string]: unknown }
): Promise<void> {
  if (!recipientId) return;
  try {
    await addDoc(collection(db, "notifications"), {
      recipientId,
      read: false,
      createdAt: serverTimestamp(),
      ...payload,
    });
  } catch (err) {
    console.warn("[notifications] delivery failed for", recipientId, err);
  }
}

/** Assigned staff for a student, excluding the person who triggered the event. */
function staffRecipients(student: StudentDoc, exclude?: string): string[] {
  const ids = new Set<string>();
  if (student.teacherId) ids.add(student.teacherId);
  (student.therapistIds ?? []).forEach((id) => ids.add(id));
  if (exclude) ids.delete(exclude);
  return [...ids];
}

// ─── Students ─────────────────────────────────────────────────────────────────

export const studentsDb = {
  /**
   * List students visible to the caller. Guardians query by `parentId` so the
   * rules can authorise it — filtering client-side after a centre-wide fetch
   * (the previous behaviour) is denied outright by Firestore.
   */
  list: async (scope: AccessScope): Promise<StudentDoc[]> => {
    const snap = await getDocs(query(collection(db, "students"), scopeFilter(scope)));

    // Resolve staff UIDs to names for display. Only admins may read the full
    // user directory, so this is best-effort and never blocks the list.
    const nameMap: Record<string, string> = {};
    if (scope.role === "admin") {
      try {
        const [usersSnap, staffSnap] = await Promise.all([
          getDocs(query(collection(db, "users"), where("centerId", "==", scope.centerId))),
          getDocs(query(collection(db, "staff"), where("centerId", "==", scope.centerId))),
        ]);
        usersSnap.forEach((d) => { nameMap[d.id] = d.data().name; });
        staffSnap.forEach((d) => { nameMap[d.id] = d.data().name; });
      } catch (err) {
        console.warn("[students] could not resolve staff names:", err);
      }
    }

    return snap.docs.map((d) => {
      const data = d.data() as StudentDoc;
      return {
        ...data,
        id: d.id,
        // Keep the UIDs intact — overwriting them with display names (the old
        // behaviour) corrupted every downstream consumer that treats them as
        // identifiers, such as notification fan-out.
        teacherId: data.teacherId,
        therapistIds: data.therapistIds ?? [],
        teacherName: nameMap[data.teacherId] || data.teacherId,
        therapistNames: (data.therapistIds ?? []).map((id) => nameMap[id] || id),
      } as StudentDoc;
    });
  },

  get: async (studentId: string): Promise<StudentDoc | null> => {
    const snap = await getDoc(doc(db, "students", studentId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as StudentDoc;
  },

  create: async (data: Omit<StudentDoc, "id">): Promise<string> => {
    assertEnrolmentAge(data.dob as string);
    const studentId = uuidv4();
    await setDoc(doc(db, "students", studentId), {
      ...data,
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, "students", studentId, "medicalProfile", "main"), {
      allergies: [],
      seizureHistory: { hasHistory: false },
      medications: [],
      emergencyContact: {},
      bloodType: "",
      specialPhysicalNeeds: "",
    });
    await setDoc(doc(db, "students", studentId, "carePlan", "main"), { goals: [] });
    return studentId;
  },

  update: async (studentId: string, data: Partial<StudentDoc>): Promise<void> => {
    if (data.dob) assertEnrolmentAge(data.dob as string);
    await updateDoc(doc(db, "students", studentId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  delete: async (studentId: string): Promise<void> => {
    await deleteDoc(doc(db, "students", studentId));
  },

  getMedical: async (studentId: string) => {
    const snap = await getDoc(doc(db, "students", studentId, "medicalProfile", "main"));
    return snap.exists() ? snap.data() : {};
  },

  updateMedical: async (studentId: string, data: Record<string, unknown>): Promise<void> => {
    await setDoc(
      doc(db, "students", studentId, "medicalProfile", "main"),
      { ...data, updatedAt: serverTimestamp() },
      { merge: true }
    );
    const student = await studentsDb.get(studentId);
    if (!student) return;
    const payload = {
      type: "medical_update",
      title: "Medical Profile Updated",
      message: `Medical profile for ${student.name} was updated.`,
      studentId,
    };
    await notify(student.parentId, payload);
    for (const uid of staffRecipients(student)) await notify(uid, payload);
  },

  getCarePlan: async (studentId: string) => {
    const snap = await getDoc(doc(db, "students", studentId, "carePlan", "main"));
    return snap.exists() ? snap.data() : { goals: [] };
  },

  updateCarePlan: async (studentId: string, data: Record<string, unknown>): Promise<void> => {
    await setDoc(doc(db, "students", studentId, "carePlan", "main"), data, { merge: true });
    const student = await studentsDb.get(studentId);
    if (!student) return;
    const payload = {
      type: "care_plan_update",
      title: "Care Plan Updated",
      message: `The care plan goals for ${student.name} have been updated.`,
      studentId,
    };
    await notify(student.parentId, payload);
    for (const uid of staffRecipients(student)) await notify(uid, payload);
  },
};

export function studentAge(dob?: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function assertEnrolmentAge(dob?: string): void {
  if (!dob) return;
  const age = studentAge(dob);
  if (age === null) throw new Error("Invalid date of birth.");
  if (age < 0 || age > 12) throw new Error("Student age must be between 0 and 12 years.");
}

// ─── Daily Care ───────────────────────────────────────────────────────────────

export const dailyCareDb = {
  submit: async (
    data: Record<string, unknown>,
    submittedBy: string
  ): Promise<string> => {
    const studentId = data.studentId as string;
    const student = await studentsDb.get(studentId);
    if (!student) throw new Error("Student not found.");

    const docId = `${data.date}_${studentId}`;
    await setDoc(doc(db, "dailyCareJournals", docId), {
      ...data,
      // Denormalised so the rules can authorise list queries without a lookup.
      centerId: student.centerId,
      parentId: student.parentId ?? null,
      submittedBy,
      submittedAt: serverTimestamp(),
    });

    await notify(student.parentId, {
      type: "daily_journal",
      title: "Daily Journal Submitted",
      message: `The daily journal for ${data.date} has been submitted.`,
      studentId,
      date: data.date,
    });
    return docId;
  },

  get: async (studentId: string, date: string) => {
    const snap = await getDoc(doc(db, "dailyCareJournals", `${date}_${studentId}`));
    return snap.exists() ? snap.data() : null;
  },

  history: async (studentId: string, scope: AccessScope, limitCount = 30) => {
    const snap = await getDocs(
      query(
        collection(db, "dailyCareJournals"),
        where("studentId", "==", studentId),
        scopeFilter(scope),
        orderBy("date", "desc"),
        limit(limitCount)
      )
    );
    return snap.docs.map((d) => d.data());
  },

  delete: async (studentId: string, date: string): Promise<void> => {
    await deleteDoc(doc(db, "dailyCareJournals", `${date}_${studentId}`));
  },
};

// ─── ABC Tracker ──────────────────────────────────────────────────────────────

interface AbcTagged { text?: string; tags?: string[] }

export const abcDb = {
  logIncident: async (
    data: Record<string, unknown>,
    loggedBy: string
  ): Promise<string> => {
    const studentId = data.studentId as string;
    const student = await studentsDb.get(studentId);
    if (!student) throw new Error("Student not found.");

    const incidentId = uuidv4();
    await setDoc(doc(db, "abcIncidents", incidentId), {
      ...data,
      id: incidentId,
      centerId: student.centerId,
      parentId: student.parentId ?? null,
      loggedBy,
      createdAt: serverTimestamp(),
      timestamp: new Date().toISOString(),
    });

    const behaviour = (data.behavior as AbcTagged)?.text || "Behaviour incident";
    await notify(student.parentId, {
      type: "behavior_incident",
      title: "Behaviour Incident Logged",
      message: `New behaviour incident logged for ${student.name}: ${behaviour}.`,
      studentId,
    });
    for (const uid of staffRecipients(student, loggedBy)) {
      await notify(uid, {
        type: "behavior_incident",
        title: "Behaviour Incident Logged",
        message: `${student.name} had a behavioural incident logged by staff.`,
        studentId,
      });
    }
    return incidentId;
  },

  listIncidents: async (studentId: string, scope: AccessScope, limitCount = 50) => {
    const snap = await getDocs(
      query(
        collection(db, "abcIncidents"),
        where("studentId", "==", studentId),
        scopeFilter(scope),
        orderBy("timestamp", "desc"),
        limit(limitCount)
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  getPatterns: async (studentId: string, scope: AccessScope) => {
    const incidents = await abcDb.listIncidents(studentId, scope, 100);

    if (!incidents.length) {
      return {
        topAntecedents: [], topBehaviors: [], topConsequences: [],
        peakHours: [], avgSeverity: 0, totalIncidents: 0, insights: [],
      };
    }

    const antecedentTags: string[] = [];
    const behaviorTags: string[] = [];
    const consequenceTags: string[] = [];
    const hours: number[] = [];
    const severities: number[] = [];

    for (const inc of incidents as Record<string, unknown>[]) {
      antecedentTags.push(...((inc.antecedent as AbcTagged)?.tags ?? []));
      behaviorTags.push(...((inc.behavior as AbcTagged)?.tags ?? []));
      consequenceTags.push(...((inc.consequence as AbcTagged)?.tags ?? []));
      const ts = (inc.timestamp as string) ?? "";
      const parsed = new Date(ts);
      if (!Number.isNaN(parsed.getTime())) hours.push(parsed.getHours());
      severities.push((inc.severity as number) ?? 1);
    }

    const count = (arr: string[]) => {
      const m: Record<string, number> = {};
      arr.forEach((t) => { m[t] = (m[t] ?? 0) + 1; });
      return Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, n]) => ({ tag, count: n }));
    };

    const countNums = (arr: number[]) => {
      const m: Record<number, number> = {};
      arr.forEach((h) => { m[h] = (m[h] ?? 0) + 1; });
      return Object.entries(m)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 3)
        .map(([hour, n]) => ({ hour: Number(hour), count: Number(n) }));
    };

    const topAntecedents = count(antecedentTags);
    const topBehaviors = count(behaviorTags);
    const topConsequences = count(consequenceTags);
    const peakHours = countNums(hours);
    const avgSeverity = severities.length
      ? Math.round((severities.reduce((a, b) => a + b, 0) / severities.length) * 10) / 10
      : 0;

    const insights: string[] = [];
    if (topAntecedents[0]) insights.push(`Most common trigger: '${topAntecedents[0].tag}' (${topAntecedents[0].count} incidents)`);
    if (topBehaviors[0]) insights.push(`Most frequent behaviour: '${topBehaviors[0].tag}' observed ${topBehaviors[0].count} times`);
    if (peakHours[0]) {
      const h = peakHours[0].hour;
      insights.push(`Peak incident time: ${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`);
    }
    if (avgSeverity >= 3.5) insights.push(`Average severity is high (${avgSeverity}/5) — consider a behaviour intervention plan review`);
    else if (avgSeverity > 0 && avgSeverity < 2) insights.push(`Average severity is low (${avgSeverity}/5) — student is showing improvement`);

    return { topAntecedents, topBehaviors, topConsequences, peakHours, avgSeverity, totalIncidents: incidents.length, insights };
  },

  getHeatmap: async (studentId: string, scope: AccessScope) => {
    const incidents = await abcDb.listIncidents(studentId, scope, 200);

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const grid: Record<string, Record<number, number>> = {};
    days.forEach((day) => { grid[day] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; });

    for (const inc of incidents as Record<string, unknown>[]) {
      const parsed = new Date((inc.timestamp as string) ?? "");
      if (Number.isNaN(parsed.getTime())) continue;
      const sev = Math.min(5, Math.max(1, (inc.severity as number) ?? 1));
      const dayName = days[parsed.getDay() === 0 ? 6 : parsed.getDay() - 1];
      grid[dayName][sev] = (grid[dayName][sev] ?? 0) + 1;
    }

    const result: { day: string; severity: number; count: number }[] = [];
    for (const day of days) {
      for (let sev = 1; sev <= 5; sev++) {
        result.push({ day, severity: sev, count: grid[day][sev] ?? 0 });
      }
    }
    return result;
  },
};

// ─── Panic Alerts ─────────────────────────────────────────────────────────────

export interface PanicAlertDoc {
  id: string;
  studentId: string;
  centerId: string;
  parentId?: string | null;
  emergencyType: string;
  location: string;
  description?: string;
  status: string;
  timestamp: string;
  reportedBy?: { uid?: string; name?: string };
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export const panicDb = {
  /**
   * Raise an alert.
   *
   * The client writes the alert document (so the admin console updates in
   * real time even if the API is down) and then asks the backend to fan out
   * notifications and email. The backend deliberately does NOT create a second
   * alert document — it upserts this same id. Notifying staff needs a read of
   * the whole user directory, which the rules only grant to admins, so that
   * fan-out belongs on the server where the Admin SDK applies.
   */
  sendAlert: async (
    data: Record<string, unknown>,
    getIdToken?: () => Promise<string | null>
  ): Promise<string> => {
    const alertId = uuidv4();
    const student = await studentsDb.get(data.studentId as string);

    await setDoc(doc(db, "panicAlerts", alertId), {
      id: alertId,
      ...data,
      parentId: student?.parentId ?? null,
      timestamp: new Date().toISOString(),
      status: "active",
      resolvedAt: null,
      resolvedBy: null,
    });

    await notify(student?.parentId, {
      type: "panic_alert",
      title: "Emergency Alert",
      alertId,
      message: `An emergency alert has been raised for ${student?.name ?? "your child"}: ${data.emergencyType} in ${data.location}`,
      studentId: data.studentId,
    });

    // Server-side fan-out to staff + email. Non-fatal: the alert is already
    // recorded and visible to admins by this point.
    try {
      const { api } = await import("./api");
      const token = getIdToken ? await getIdToken() : null;
      await api.post(
        "/api/panic/alert",
        {
          alertId,
          studentId: data.studentId,
          centerId: data.centerId,
          reportedBy: data.reportedBy,
          emergencyType: data.emergencyType,
          description: data.description,
          location: data.location,
        },
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
      );
    } catch (err) {
      console.warn("[panic] backend fan-out unavailable:", err);
    }
    return alertId;
  },

  listAlerts: async (scope: AccessScope, status = "all") => {
    const constraints: QueryConstraint[] = [scopeFilter(scope)];
    if (status === "active" || status === "resolved") {
      constraints.push(where("status", "==", status));
    }
    constraints.push(orderBy("timestamp", "desc"));
    const snap = await getDocs(query(collection(db, "panicAlerts"), ...constraints));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PanicAlertDoc[];
  },

  resolveAlert: async (alertId: string, resolvedBy: string): Promise<void> => {
    await updateDoc(doc(db, "panicAlerts", alertId), {
      status: "resolved",
      resolvedAt: new Date().toISOString(),
      resolvedBy,
    });
  },
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationsDb = {
  list: async (recipientId: string, limitCount = 20) => {
    const snap = await getDocs(
      query(
        collection(db, "notifications"),
        where("recipientId", "==", recipientId),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  markRead: async (notificationId: string): Promise<void> => {
    await updateDoc(doc(db, "notifications", notificationId), { read: true });
  },
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminDb = {
  listPendingUsers: async (centerId: string) => {
    const snap = await getDocs(
      query(
        collection(db, "users"),
        where("centerId", "==", centerId),
        where("status", "==", "pending")
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  approveUser: async (uid: string): Promise<void> => {
    await updateDoc(doc(db, "users", uid), { status: "approved" });
  },

  listAllUsers: async (centerId: string) => {
    const snap = await getDocs(
      query(collection(db, "users"), where("centerId", "==", centerId))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  getActiveAlertCount: async (centerId: string): Promise<number> => {
    const snap = await getDocs(
      query(
        collection(db, "panicAlerts"),
        where("centerId", "==", centerId),
        where("status", "==", "active")
      )
    );
    return snap.size;
  },

  listStaff: async (centerId: string) => {
    const snap = await getDocs(
      query(collection(db, "staff"), where("centerId", "==", centerId))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  addStaff: async (data: Record<string, unknown>): Promise<string> => {
    const ref = await addDoc(collection(db, "staff"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  deleteStaff: async (staffId: string): Promise<void> => {
    await deleteDoc(doc(db, "staff", staffId));
  },

  // --- Fee Management ---
  // Invoices and payments are keyed by studentId, not student name. Matching
  // on name meant two students sharing a name saw each other's billing.
  listInvoices: async (scope: AccessScope) => {
    const snap = await getDocs(query(collection(db, "invoices"), scopeFilter(scope)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  addInvoice: async (data: Record<string, unknown>): Promise<string> => {
    const ref = await addDoc(collection(db, "invoices"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  updateInvoiceStatus: async (invoiceId: string, status: string): Promise<void> => {
    await updateDoc(doc(db, "invoices", invoiceId), { status });
  },

  listPayments: async (scope: AccessScope) => {
    const snap = await getDocs(query(collection(db, "payments"), scopeFilter(scope)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  addPayment: async (data: Record<string, unknown>): Promise<string> => {
    const ref = await addDoc(collection(db, "payments"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },
};

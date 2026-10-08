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
  runTransaction,
  writeBatch,
  QueryConstraint,
  DocumentReference,
  DocumentSnapshot,
  Transaction,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { v4 as uuidv4 } from "uuid";
import { confirmWithin } from "./workflow-state";

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
  name?: string;
}

export function scopeOf(
  profile: { role?: string; uid?: string; centerId?: string; name?: string } | null | undefined
): AccessScope {
  return {
    role: profile?.role ?? "",
    uid: profile?.uid ?? "",
    centerId: profile?.centerId ?? DEFAULT_CENTER_ID,
    name: profile?.name ?? "",
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

async function listBillingRecords(name: "invoices" | "payments", scope: AccessScope) {
  if (scope.role !== "parent") {
    const snap = await getDocs(query(collection(db, name), scopeFilter(scope)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  // Include archived children so their billing history remains accessible.
  const children = await getDocs(query(collection(db, "students"),
    where("parentId", "==", scope.uid), where("centerId", "==", scope.centerId)));
  const records = await Promise.all(children.docs.map(child => getDocs(query(
    collection(db, name), where("studentId", "==", child.id), where("parentId", "==", scope.uid)))));
  return records.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

async function careTransaction<T>(reference: DocumentReference, work: (transaction: Transaction, snapshot: DocumentSnapshot) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let observedVersion = -1;
    try {
      return await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(reference);
        observedVersion = Number(snapshot.data()?.version ?? 0);
        return work(transaction, snapshot);
      });
    } catch (error) {
      // A rule may reject the stale version before Firestore returns ABORTED.
      // Retry only a proven concurrent change, never a stable permission denial.
      if (attempt < 3 && (error as {code?: string}).code === "permission-denied" && observedVersion >= 0) {
        const latest = await getDoc(reference);
        if (Number(latest.data()?.version ?? 0) !== observedVersion) continue;
      }
      throw error;
    }
  }
}

/** Notification fan-out must never take a care record down with it. */
async function notify(
  recipientId: string | undefined,
  payload: { type: string; title: string; message: string; [k: string]: unknown }
): Promise<void> {
  if (!recipientId) return;
  try {
    const student = typeof payload.studentId === "string" ? await studentsDb.get(payload.studentId) : null;
    if (!student) return;
    await addDoc(collection(db, "notifications"), {
      recipientId,
      senderId: auth.currentUser?.uid ?? null,
      read: false,
      createdAt: serverTimestamp(),
      ...payload,
      centerId: student.centerId,
      parentId: student.parentId,
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
    const constraints = [scopeFilter(scope)];
    if (scope.role === "parent") constraints.push(where("centerId", "==", scope.centerId));
    if (scope.role === "teacher") constraints.push(where("teacherId", "==", scope.uid));
    if (scope.role === "therapist") constraints.push(where("therapistIds", "array-contains", scope.uid));
    const snap = await getDocs(query(collection(db, "students"), ...constraints));

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

    const listed = snap.docs.map((d) => {
      const data = d.data() as StudentDoc;
      return {
        ...data,
        id: d.id,
        // Keep the UIDs intact — overwriting them with display names (the old
        // behaviour) corrupted every downstream consumer that treats them as
        // identifiers, such as notification fan-out.
        teacherId: data.teacherId,
        therapistIds: data.therapistIds ?? [],
        teacherName: nameMap[data.teacherId] || "",
        therapistNames: (data.therapistIds ?? []).map((id) => nameMap[id] || ""),
      } as StudentDoc;
    });

    return listed.filter((student) => !student.archivedAt);
  },

  get: async (studentId: string): Promise<StudentDoc | null> => {
    const snap = await getDoc(doc(db, "students", studentId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as StudentDoc;
  },

  create: async (data: Omit<StudentDoc, "id">): Promise<string> => {
    assertEnrolmentAge(data.dob as string);
    const studentId = uuidv4();
    const batch = writeBatch(db);
    batch.set(doc(db, "students", studentId), {
      ...data,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, "students", studentId, "medicalProfile", "main"), {
      allergies: [],
      seizureHistory: { hasHistory: false },
      medications: [],
      emergencyContact: {},
      bloodType: "",
      specialPhysicalNeeds: "",
    });
    batch.set(doc(db, "students", studentId, "carePlan", "main"), { goals: [] });
    await batch.commit();
    return studentId;
  },

  update: async (studentId: string, data: Partial<StudentDoc>): Promise<void> => {
    if (data.dob) assertEnrolmentAge(data.dob as string);
    await updateDoc(doc(db, "students", studentId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  delete: async (studentId: string, centerId?: string): Promise<void> => {
    // Archive in one transaction. Clinical and financial history stays intact.
    await runTransaction(db, async (transaction) => {
      const reference = doc(db, "students", studentId);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error("Student not found.");
      if (centerId && snapshot.data().centerId !== centerId) throw new Error("Centre mismatch.");
      transaction.update(reference, { archivedAt: serverTimestamp(), archivedBy: auth.currentUser?.uid });
    });
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

  updateCarePlan: async (studentId: string, data: Record<string, unknown>): Promise<number> => {
    const { expectedVersion, ...updates } = data;
    const reference = doc(db, "students", studentId, "carePlan", "main");
    const version = await careTransaction(reference, async (transaction, snapshot) => {
      const current = Number(snapshot.data()?.version ?? 0);
      if ("goals" in updates && Number(expectedVersion ?? 0) !== current) throw new Error("Care plan changed. Reload before saving.");
      transaction.set(reference, { ...updates, version: current + 1, updatedAt: serverTimestamp() }, { merge: true });
      return current + 1;
    });
    const student = await studentsDb.get(studentId);
    if (!student) return version;
    const payload = {
      type: "care_plan_update",
      title: "Care Plan Updated",
      message: `The care plan goals for ${student.name} have been updated.`,
      studentId,
    };
    await notify(student.parentId, payload);
    for (const uid of staffRecipients(student)) await notify(uid, payload);
    return version;
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
      timestamp: new Date(String(data.timestamp)).toISOString(),
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
  ): Promise<{ id: string; deliveryStatus: string; recorded: boolean }> => {
    const alertId = uuidv4();
    const write = (async () => {
    const student = await studentsDb.get(data.studentId as string);
    if (!student) throw new Error("Student not found.");

    await setDoc(doc(db, "panicAlerts", alertId), {
      ...data,
      id: alertId,
      centerId: student.centerId,
      parentId: student?.parentId ?? null,
      timestamp: new Date().toISOString(),
      status: "active",
      resolvedAt: null,
      resolvedBy: null,
      deliveryStatus: "pending",
    });
    })();
    const confirmed = await confirmWithin(write);
    if (!confirmed) return { id: alertId, deliveryStatus: "unconfirmed", recorded: false };

    // Server-side fan-out to staff + email. Non-fatal: the alert is already
    // recorded and visible to admins by this point.
    void (async () => { try {
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
        { timeout: 2000, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) }
      );
    } catch (err) {
      console.warn("[panic] backend fan-out unavailable:", err);
    } })();
    return { id: alertId, deliveryStatus: "pending", recorded: true };
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
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((staff) => (staff as Record<string, unknown>).status !== "Disabled");
  },

  addStaff: async (data: Record<string, unknown>): Promise<string> => {
    const ref = await addDoc(collection(db, "staff"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  deleteStaff: async (staffId: string): Promise<boolean> => {
    const reference = doc(db, "staff", staffId);
    const snapshot = await getDoc(reference);
    if (!snapshot.exists()) throw new Error("Staff member not found.");
    const staff = snapshot.data();
    const users = await adminDb.listAllUsers(staff.centerId);
    const linked = users.filter((user) => user.id === staff.uid ||
      (staff.email && String((user as Record<string, unknown>).email).toLowerCase() === String(staff.email).toLowerCase()));
    if (linked.length > 1) throw new Error("Ambiguous staff account; resolve the account link first.");
    if (linked.length) {
      const { api } = await import("./api");
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in again.");
      await api.post(`/api/auth/offboard/${encodeURIComponent(linked[0].id)}`, {},
        { headers: { Authorization: `Bearer ${token}` } });
    }
    await updateDoc(reference, { status: "Disabled", disabledAt: serverTimestamp() });
    return linked.length === 1;
  },

  // --- Fee Management ---
  // Invoices and payments are keyed by studentId, not student name. Matching
  // on name meant two students sharing a name saw each other's billing.
  listInvoices: async (scope: AccessScope) => {
    return listBillingRecords("invoices", scope);
  },

  getFeeConfig: async (centerId: string) => {
    const snap = await getDoc(doc(db, "centers", centerId));
    return snap.exists() ? snap.data().feeConfig ?? null : null;
  },

  saveFeeConfig: async (centerId: string, feeConfig: Record<string, unknown>): Promise<void> => {
    await setDoc(
      doc(db, "centers", centerId),
      { centerId, feeConfig, updatedAt: serverTimestamp() },
      { merge: true }
    );
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

  recordInvoicePayment: async (
    invoiceId: string,
    payment: { method: string; recordedBy: string }
  ) => {
    const invoiceRef = doc(db, "invoices", invoiceId);
    const paymentRef = doc(collection(db, "payments"));
    const date = new Date().toISOString();

    return runTransaction(db, async (transaction) => {
      const invoiceSnap = await transaction.get(invoiceRef);
      if (!invoiceSnap.exists()) throw new Error("Invoice not found.");

      const invoice = invoiceSnap.data();
      if (invoice.status === "paid") throw new Error("This invoice is already paid.");

      const paymentData = {
        invoiceId,
        studentId: invoice.studentId,
        studentName: invoice.studentName,
        parentId: invoice.parentId ?? null,
        amount: invoice.amount,
        method: payment.method,
        date,
        recordedBy: payment.recordedBy,
        centerId: invoice.centerId,
      };

      transaction.update(invoiceRef, {
        status: "paid",
        paymentId: paymentRef.id,
        paidAt: serverTimestamp(),
      });
      transaction.set(paymentRef, {
        ...paymentData,
        createdAt: serverTimestamp(),
      });

      return { id: paymentRef.id, ...paymentData };
    });
  },

  listPayments: async (scope: AccessScope) => {
    return listBillingRecords("payments", scope);
  },

  addPayment: async (data: Record<string, unknown>): Promise<string> => {
    const ref = await addDoc(collection(db, "payments"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },
};

// ─── IEP Builder ──────────────────────────────────────────────────────────────

export interface SavedGoalState {
  goals: Record<string, unknown>[];
  achievedGoals: Record<string, unknown>[];
  version: number;
}

export const iepDb = {
  saveDraft: async (studentId: string, iepData: Record<string, unknown>, authorUid?: string, authorName?: string): Promise<string> => {
    const iepId = (iepData.id as string) || uuidv4();
    // Save draft into carePlan/main with status=draft (carePlan already has therapist write permission)
    await setDoc(
      doc(db, "students", studentId, "carePlan", "main"),
      {
        draftIep: {
          ...iepData,
          id: iepId,
          studentId,
          status: "draft",
          authorUid: authorUid || "unknown",
          authorName: authorName || "Therapist/Educator",
          updatedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return iepId;
  },

  finalize: async (studentId: string, iepData: Record<string, unknown>, authorUid?: string, authorName?: string): Promise<string> => {
    const iepId = (iepData.id as string) || uuidv4();

    interface RawGoal {
      id?: string;
      title?: string;
      goalArea?: string;
      status?: string;
      progressPercent?: number;
      targetTimeframe?: string;
      measurementMethod?: string;
      rationale?: string;
      milestones?: Array<{
        id: string;
        description: string;
        completed: boolean;
        targetDate?: string;
      }>;
    }

    const rawGoals = Array.isArray(iepData.goals) ? (iepData.goals as RawGoal[]) : [];
    const carePlanGoals = rawGoals.map((g) => ({
      id: g.id || uuidv4(),
      title: g.title || "",
      goalArea: g.goalArea || "General",
      status: g.status || "In Progress",
      progressPercent: g.progressPercent || 0,
      targetTimeframe: g.targetTimeframe || "",
      measurementMethod: g.measurementMethod || "",
      rationale: g.rationale || "",
      milestones: g.milestones || [],
    }));

    const reference = doc(db, "students", studentId, "carePlan", "main");
    await careTransaction(reference, async (transaction, snapshot) => {
    const version = Number(snapshot.data()?.version ?? 0);
    if (Number(iepData.expectedVersion ?? 0) !== version) throw new Error("Care plan changed. Reload before finalizing.");
    transaction.set(
      reference,
      {
        goals: carePlanGoals,
        activeIepId: iepId,
        iepStatus: "Active",
        iepSummary: iepData.summary || "",
        finalizedBy: authorName || "Therapist",
        finalizedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        draftIep: null, // clear draft after finalize
        version: version + 1,
      },
      { merge: true }
    );
    });

    // Notify Parent (non-fatal)
    try {
      const student = await studentsDb.get(studentId);
      if (student?.parentId) {
        await notify(student.parentId, {
          type: "iep_finalized",
          title: "New IEP Finalized ðŸŽ¯",
          message: `A new Individualized Education Program (IEP) has been finalized for ${student.name}.`,
          studentId,
        });
      }
    } catch {
      // notification delivery failure is non-fatal
    }

    return iepId;
  },

  getLatestIEP: async (studentId: string) => {
    const q = query(
      collection(db, "students", studentId, "iepRecords"),
      orderBy("updatedAt", "desc"),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  },

  listIEPRecords: async (studentId: string) => {
    const q = query(
      collection(db, "students", studentId, "iepRecords"),
      orderBy("updatedAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  /**
   * Mark an active goal as "Achieved".
   * - Stamps achievedAt on the goal.
   * - Moves it from goals[] to achievedGoals[] in carePlan/main.
   * - Persisted goals[] reflects only still-active goals.
   */
  markGoalAchieved: async (studentId: string, goalId: string): Promise<SavedGoalState> => {
    const reference = doc(db, "students", studentId, "carePlan", "main");
    return careTransaction(reference, async (transaction, careSnap) => {
    const careData = careSnap.exists() ? careSnap.data() : {};

    const activeGoals: Record<string, unknown>[] = Array.isArray(careData.goals) ? careData.goals : [];
    const goalIndex = activeGoals.findIndex((g) => (g as { id?: string }).id === goalId);
    if (goalIndex === -1) throw new Error("Goal is not in the saved active plan. Finalize or reload the plan first.");

    const achievedGoal = {
      ...activeGoals[goalIndex],
      status: "Achieved",
      achievedAt: new Date().toISOString(),
    };
    const remainingGoals = activeGoals.filter((_, i) => i !== goalIndex);
    const previousAchieved: Record<string, unknown>[] = Array.isArray(careData.achievedGoals) ? careData.achievedGoals : [];

    transaction.set(
      reference,
      {
        goals: remainingGoals,
        achievedGoals: [...previousAchieved, achievedGoal],
        version: Number(careData.version ?? 0) + 1,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return { goals: remainingGoals, achievedGoals: [...previousAchieved, achievedGoal], version: Number(careData.version ?? 0) + 1 };
    });
  },

  /**
   * Save an AI-suggested next goal as a pending draft in carePlan/main.pendingAiGoal.
   * The therapist must explicitly accept it to move it into active goals[].
   */
  savePendingAiGoal: async (studentId: string, goal: Record<string, unknown>): Promise<void> => {
    await setDoc(
      doc(db, "students", studentId, "carePlan", "main"),
      { pendingAiGoal: goal, updatedAt: serverTimestamp() },
      { merge: true }
    );
  },

  /**
   * Accept the pending AI goal: move it from pendingAiGoal into active goals[].
   */
  acceptPendingAiGoal: async (studentId: string, goal: Record<string, unknown>): Promise<SavedGoalState> => {
    const reference = doc(db, "students", studentId, "carePlan", "main");
    return careTransaction(reference, async (transaction, careSnap) => {
    const careData = careSnap.exists() ? careSnap.data() : {};
    const activeGoals: Record<string, unknown>[] = Array.isArray(careData.goals) ? careData.goals : [];
    const achievedGoals: Record<string, unknown>[] = Array.isArray(careData.achievedGoals) ? careData.achievedGoals : [];
    if (activeGoals.some(existing => existing.id === goal.id)) return { goals: activeGoals, achievedGoals, version: Number(careData.version ?? 0) };
    if (!goal.id || careData.pendingAiGoal?.id !== goal.id) throw new Error("Suggestion changed. Reload before accepting.");

    transaction.set(
      reference,
      {
        goals: [...activeGoals, goal],
        pendingAiGoal: null,
        iepStatus: "In Progress",
        version: Number(careData.version ?? 0) + 1,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return { goals: [...activeGoals, goal], achievedGoals, version: Number(careData.version ?? 0) + 1 };
    });
  },

  /**
   * Dismiss (discard) the pending AI goal suggestion without accepting it.
   */
  dismissPendingAiGoal: async (studentId: string): Promise<void> => {
    await setDoc(
      doc(db, "students", studentId, "carePlan", "main"),
      { pendingAiGoal: null, updatedAt: serverTimestamp() },
      { merge: true }
    );
  },
};

export interface RegressionAlertDoc {
  id: string;
  studentId: string;
  studentName: string;
  centerId: string;
  goalId: string;
  goalTitle: string;
  previousProgress: number;
  currentProgress: number;
  decline: number;
  alertLevel: "Monitoring" | "Regression Warning";
  resolved: boolean;
  createdAt: string;
  // Fields added for milestone-log triggered alerts
  milestoneId?: string;
  milestoneDescription?: string;
  observationNotes?: string;
  triggeredBy?: "milestone_log" | "care_plan_update";
  previousMasteryDate?: string;
  observedByName?: string;
  currentObservationStatus?: string;
  reason?: string;
}

function firestoreDate(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value) return (value as { toDate(): Date }).toDate().toISOString();
  return "";
}

export const regressionDb = {
  /** Fetch all unresolved regression alerts for a centre (therapist/admin dashboard) */
  listUnresolved: async (centerId: string): Promise<RegressionAlertDoc[]> => {
    // Alerts now carry centerId directly — query it directly without student join.
    const snap = await getDocs(
      query(
        collection(db, "regressionAlerts"),
        where("centerId", "==", centerId),
        where("resolved", "==", false),
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RegressionAlertDoc, "id">), createdAt: firestoreDate(d.data().createdAt) })).sort((a, b) => firestoreDate(b.createdAt).localeCompare(firestoreDate(a.createdAt)));
  },

  /** Fetch alerts for a specific student (student detail view) */
  listForStudent: async (studentId: string, centerId: string): Promise<RegressionAlertDoc[]> => {
    // Include centerId so the Firestore inMyCenter() rule can be satisfied.
    const snap = await getDocs(
      query(
        collection(db, "regressionAlerts"),
        where("studentId", "==", studentId),
        where("centerId", "==", centerId),
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RegressionAlertDoc, "id">), createdAt: firestoreDate(d.data().createdAt) })).sort((a, b) => firestoreDate(b.createdAt).localeCompare(firestoreDate(a.createdAt)));
  },

  /** Mark an alert as resolved */
  resolve: async (alertId: string): Promise<void> => {
    await updateDoc(doc(db, "regressionAlerts", alertId), { resolved: true });
  },

  /** Fetch ALL regression alerts (resolved + unresolved) for a centre */
  listAll: async (centerId: string): Promise<RegressionAlertDoc[]> => {
    const snap = await getDocs(
      query(
        collection(db, "regressionAlerts"),
        where("centerId", "==", centerId),
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RegressionAlertDoc, "id">), createdAt: firestoreDate(d.data().createdAt) })).sort((a, b) => firestoreDate(b.createdAt).localeCompare(firestoreDate(a.createdAt)));
  },
};

// ─── Milestone Observations (Teacher logging) ─────────────────────────────────
//
// Flow:
//   Teacher observes student → logs milestone status
//   → System checks achievedGoals[] for prior mastery of that goal
//   → No prior mastery  → just save, no alert
//   → Prior mastery + first "Failed/Declined" → Monitoring
//   → Prior mastery + repeated "Failed/Declined" → Regression Warning

export type MilestoneObservationStatus = "Achieved" | "In Progress" | "Failed/Declined";

export interface MilestoneObservationDoc {
  id: string;
  studentId: string;
  studentName: string;
  centerId: string;
  goalId: string;
  goalTitle: string;
  milestoneId?: string;
  milestoneDescription?: string;
  observedStatus: MilestoneObservationStatus;
  notes: string;
  observedBy: string;       // teacher's uid
  observedByName: string;   // teacher's display name
  observedAt: string;       // ISO date
}

const pendingObservations = new Map<string, string>();
export const milestoneObservationsDb = {
  /**
   * Save a teacher observation and run regression detection.
   * Uses achievedGoals[] in carePlan/main as the mastery baseline.
   */
  log: async (
    observation: Omit<MilestoneObservationDoc, "id">,
    _studentDoc: StudentDoc
  ): Promise<{
    alertCreated: boolean;
    alertLevel: "Monitoring" | "Regression Warning" | null;
    previousStatus: string;
    currentStatus: string;
    change: "Mastered/Maintaining" | "Declining" | "In Progress";
    reason?: string;
  }> => {
    void _studentDoc;
    if (!observation.centerId || !auth.currentUser) throw new Error("Profile not loaded. Please sign in and wait for your profile.");
    const { api } = await import("./api");
    const token = await auth.currentUser.getIdToken();
    const key = JSON.stringify([auth.currentUser.uid, observation.studentId, observation.goalId, observation.observedStatus, observation.notes]);
    const requestId = pendingObservations.get(key) ?? uuidv4();
    pendingObservations.set(key, requestId);
    const response = await api.post("/api/regression/observations", {
      ...observation, requestId,
    }, { headers: { Authorization: `Bearer ${token}` } });
    pendingObservations.delete(key);
    return response.data;
  },

  /** Fetch all observations for a student (append-only history) */
  listForStudent: async (studentId: string, centerId?: string): Promise<MilestoneObservationDoc[]> => {
    if (!centerId) throw new Error("Profile not loaded. Please wait before loading history.");
    const q = query(collection(db, "milestoneObservations"),
      where("studentId", "==", studentId), where("centerId", "==", centerId),
      );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MilestoneObservationDoc, "id">) })).sort((a,b) => b.observedAt.localeCompare(a.observedAt)).slice(0,50);
  },
};

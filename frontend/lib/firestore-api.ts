/**
 * firestore-api.ts
 * Direct Firestore data layer — replaces calls to the FastAPI backend.
 * All collections mirror the backend schema exactly.
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
} from "firebase/firestore";
import { db } from "./firebase";
import { v4 as uuidv4 } from "uuid";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StudentDoc {
  id: string;
  name: string;
  dob: string;
  diagnosis: string;
  centerId: string;
  teacherId: string;
  therapistIds: string[];
  enrollmentDate: string;
  iepStatus: string;
  photoUrl: string;
  parentId: string;
  [key: string]: unknown;
}

// ─── Students ─────────────────────────────────────────────────────────────────

export const studentsDb = {
  /**
   * List students for a center. Parents only see their own child.
   */
  list: async (centerId = "center-001", role?: string, uid?: string): Promise<StudentDoc[]> => {
    const q = query(
      collection(db, "students"),
      where("centerId", "==", centerId)
    );
    const snap = await getDocs(q);
    const students: StudentDoc[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<StudentDoc, "id">),
    }));
    if (role === "parent" && uid) {
      return students.filter((s) => s.parentId === uid);
    }
    return students;
  },

  get: async (studentId: string): Promise<StudentDoc | null> => {
    const snap = await getDoc(doc(db, "students", studentId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<StudentDoc, "id">) };
  },

  create: async (data: Omit<StudentDoc, "id">): Promise<string> => {
    const studentId = uuidv4();
    await setDoc(doc(db, "students", studentId), {
      ...data,
      createdAt: serverTimestamp(),
    });
    // Initialise empty sub-documents
    await setDoc(
      doc(db, "students", studentId, "medicalProfile", "main"),
      {
        allergies: [],
        seizureHistory: { hasHistory: false },
        medications: [],
        emergencyContact: {},
        bloodType: "",
        specialPhysicalNeeds: "",
      }
    );
    await setDoc(doc(db, "students", studentId, "carePlan", "main"), {
      goals: [],
    });
    return studentId;
  },

  update: async (studentId: string, data: Partial<StudentDoc>): Promise<void> => {
    await updateDoc(doc(db, "students", studentId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  delete: async (studentId: string): Promise<void> => {
    await deleteDoc(doc(db, "students", studentId));
  },

  getMedical: async (studentId: string) => {
    const snap = await getDoc(
      doc(db, "students", studentId, "medicalProfile", "main")
    );
    return snap.exists() ? snap.data() : {};
  },

  updateMedical: async (studentId: string, data: Record<string, unknown>): Promise<void> => {
    await setDoc(
      doc(db, "students", studentId, "medicalProfile", "main"),
      { ...data, updatedAt: serverTimestamp() },
      { merge: true }
    );
  },

  getCarePlan: async (studentId: string) => {
    const snap = await getDoc(
      doc(db, "students", studentId, "carePlan", "main")
    );
    return snap.exists() ? snap.data() : { goals: [] };
  },

  updateCarePlan: async (studentId: string, data: Record<string, unknown>): Promise<void> => {
    await setDoc(
      doc(db, "students", studentId, "carePlan", "main"),
      data,
      { merge: true }
    );
  },
};

// ─── Daily Care ───────────────────────────────────────────────────────────────

export const dailyCareDb = {
  submit: async (data: Record<string, unknown>, submittedBy: string): Promise<string> => {
    const docId = `${data.date}_${data.studentId}`;
    await setDoc(doc(db, "dailyCareJournals", docId), {
      ...data,
      submittedBy,
      submittedAt: serverTimestamp(),
    });
    // Notify parent
    try {
      const student = await studentsDb.get(data.studentId as string);
      if (student?.parentId) {
        await addDoc(collection(db, "notifications"), {
          recipientId: student.parentId,
          type: "daily_journal",
          studentId: data.studentId,
          date: data.date,
          message: `Daily journal for ${data.date} has been submitted.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
    } catch (_) {
      // Notification failure must not block journal submission
    }
    return docId;
  },

  get: async (studentId: string, date: string) => {
    const docId = `${date}_${studentId}`;
    const snap = await getDoc(doc(db, "dailyCareJournals", docId));
    if (!snap.exists()) return null;
    return snap.data();
  },

  history: async (studentId: string) => {
    const q = query(
      collection(db, "dailyCareJournals"),
      where("studentId", "==", studentId),
      orderBy("date", "desc"),
      limit(30)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data());
  },
};

// ─── ABC Tracker ──────────────────────────────────────────────────────────────

export const abcDb = {
  logIncident: async (data: Record<string, unknown>, loggedBy: string): Promise<string> => {
    const incidentId = uuidv4();
    await setDoc(doc(db, "abcIncidents", incidentId), {
      ...data,
      id: incidentId,
      loggedBy,
      createdAt: serverTimestamp(),
      timestamp: new Date().toISOString(),
    });
    return incidentId;
  },

  listIncidents: async (studentId: string, limitCount = 50) => {
    const q = query(
      collection(db, "abcIncidents"),
      where("studentId", "==", studentId),
      orderBy("timestamp", "desc"),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  getPatterns: async (studentId: string) => {
    const q = query(
      collection(db, "abcIncidents"),
      where("studentId", "==", studentId),
      limit(100)
    );
    const snap = await getDocs(q);
    const incidents = snap.docs.map((d) => d.data());

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

    for (const inc of incidents) {
      antecedentTags.push(...((inc.antecedent as any)?.tags ?? []));
      behaviorTags.push(...((inc.behavior as any)?.tags ?? []));
      consequenceTags.push(...((inc.consequence as any)?.tags ?? []));
      const ts = inc.timestamp as string ?? "";
      if (ts.includes("T")) {
        try { hours.push(parseInt(ts.split("T")[1].split(":")[0])); } catch (_) {}
      }
      severities.push((inc.severity as number) ?? 1);
    }

    const count = (arr: string[]) => {
      const m: Record<string, number> = {};
      arr.forEach((t) => { m[t] = (m[t] ?? 0) + 1; });
      return Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, count]) => ({ tag, count }));
    };

    const countNums = (arr: number[]) => {
      const m: Record<number, number> = {};
      arr.forEach((h) => { m[h] = (m[h] ?? 0) + 1; });
      return Object.entries(m)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 3)
        .map(([hour, count]) => ({ hour: Number(hour), count }));
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
    if (topBehaviors[0]) insights.push(`Most frequent behavior: '${topBehaviors[0].tag}' observed ${topBehaviors[0].count} times`);
    if (peakHours[0]) {
      const h = peakHours[0].hour;
      insights.push(`Peak incident time: ${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`);
    }
    if (avgSeverity >= 3.5) insights.push(`Average severity is high (${avgSeverity}/5) — consider a behavior intervention plan review`);
    else if (avgSeverity > 0 && avgSeverity < 2) insights.push(`Average severity is low (${avgSeverity}/5) — student is showing improvement`);

    return { topAntecedents, topBehaviors, topConsequences, peakHours, avgSeverity, totalIncidents: incidents.length, insights };
  },

  getHeatmap: async (studentId: string) => {
    const q = query(
      collection(db, "abcIncidents"),
      where("studentId", "==", studentId),
      limit(200)
    );
    const snap = await getDocs(q);
    const incidents = snap.docs.map((d) => d.data());

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const grid: Record<string, Record<number, number>> = {};
    days.forEach((day) => {
      grid[day] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    });

    for (const inc of incidents) {
      const ts = inc.timestamp as string ?? "";
      const sev = (inc.severity as number) ?? 1;
      if (ts.includes("T")) {
        try {
          const dt = new Date(ts);
          const dayName = days[dt.getDay() === 0 ? 6 : dt.getDay() - 1];
          grid[dayName][sev] = (grid[dayName][sev] ?? 0) + 1;
        } catch (_) {}
      }
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

export const panicDb = {
  sendAlert: async (data: Record<string, unknown>): Promise<string> => {
    const alertId = uuidv4();
    const alertData = {
      id: alertId,
      ...data,
      timestamp: new Date().toISOString(),
      status: "active",
      resolvedAt: null,
      resolvedBy: null,
    };
    await setDoc(doc(db, "panicAlerts", alertId), alertData);

    // Notify all admins in the same center
    try {
      const adminsSnap = await getDocs(
        query(
          collection(db, "users"),
          where("centerId", "==", data.centerId),
          where("role", "==", "admin")
        )
      );
      for (const adminDoc of adminsSnap.docs) {
        await addDoc(collection(db, "notifications"), {
          recipientId: adminDoc.id,
          type: "panic_alert",
          alertId,
          message: `🚨 PANIC ALERT: ${data.emergencyType} in ${data.location}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
    } catch (_) {}

<<<<<<< HEAD
    // Trigger the backend API to handle email alerts
    try {
      const { api } = await import("./api");
      await api.post("/api/panic/alert", {
        studentId: data.studentId,
        centerId: data.centerId,
        reportedBy: data.reportedBy,
        emergencyType: data.emergencyType,
        description: data.description,
        location: data.location,
      });
      console.log("[Panic] Backend email alert triggered successfully.");
    } catch (e) {
      console.warn("[Panic] Backend not reachable or failed to send email alert:", e);
    }

=======
>>>>>>> 47a58b15e5a94d28bf01459f0341b5fa930906d2
    return alertId;
  },

  listAlerts: async (centerId = "center-001", status = "all") => {
    let q = query(
      collection(db, "panicAlerts"),
      where("centerId", "==", centerId),
      orderBy("timestamp", "desc")
    );
    const snap = await getDocs(q);
    let results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (status === "active" || status === "resolved") {
      results = results.filter((a: any) => a.status === status);
    }
    return results;
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
    const q = query(
      collection(db, "notifications"),
      where("recipientId", "==", recipientId),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  markRead: async (notificationId: string): Promise<void> => {
    await updateDoc(doc(db, "notifications", notificationId), { read: true });
  },
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminDb = {
  listPendingUsers: async (centerId: string) => {
    const q = query(
      collection(db, "users"),
      where("centerId", "==", centerId),
      where("status", "==", "pending")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  approveUser: async (uid: string): Promise<void> => {
    await updateDoc(doc(db, "users", uid), { status: "approved" });
  },

  listAllUsers: async (centerId: string) => {
    const q = query(
      collection(db, "users"),
      where("centerId", "==", centerId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  getActiveAlertCount: async (centerId: string): Promise<number> => {
    const q = query(
      collection(db, "panicAlerts"),
      where("centerId", "==", centerId),
      where("status", "==", "active")
    );
    const snap = await getDocs(q);
    return snap.size;
  },

  listStaff: async (centerId: string) => {
    const q = query(
      collection(db, "staff"),
      where("centerId", "==", centerId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  addStaff: async (data: Record<string, unknown>): Promise<string> => {
    const docRef = await addDoc(collection(db, "staff"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  },

  deleteStaff: async (staffId: string): Promise<void> => {
    await deleteDoc(doc(db, "staff", staffId));
  },
};

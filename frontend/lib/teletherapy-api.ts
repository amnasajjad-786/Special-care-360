/**
 * teletherapy-api.ts
 * Data layer for the Teletherapy & Home Plan Bridge module.
 *
 * Two halves of one loop:
 *   Teletherapy  — a therapist and a guardian meet in a video room.
 *   Home Plan    — the therapist assigns activities to carry out at home, the
 *                  guardian logs each day, and either side can discuss an
 *                  activity in its own thread.
 *
 * As in firestore-api.ts, every record carries a denormalised `centerId` and
 * `parentId`, and every list query carries the matching `where` clause via
 * scopeFilter(). Firestore rejects a list query it cannot prove satisfies the
 * rules, so these two must stay in step.
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
  onSnapshot,
  serverTimestamp,
  writeBatch,
  QueryConstraint,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { auth } from "./firebase";
import { v4 as uuidv4 } from "uuid";
import { AccessScope, studentsDb } from "./firestore-api";
import { googleMeetLink } from "./meet-link";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionStatus = "scheduled" | "completed" | "cancelled";

export interface TeletherapySession {
  id: string;
  studentId: string;
  studentName: string;
  centerId: string;
  parentId: string | null;
  therapistId: string;
  therapistName: string;
  title: string;
  /** ISO 8601 instant the session starts. */
  scheduledAt: string;
  durationMinutes: number;
  status: SessionStatus;
  /** Video room identifier, stable for the lifetime of the session. */
  roomName: string;
  googleMeetUrl?: string;
  sessionNote?: string;
  parentJoinedAt?: string | null;
  therapistJoinedAt?: string | null;
}

export interface HomePlanActivity {
  id: string;
  studentId: string;
  studentName: string;
  centerId: string;
  parentId: string | null;
  title: string;
  instructions: string;
  /** How many times a week the guardian should carry this out. */
  targetPerWeek: number;
  linkedGoalTitle?: string;
  assignedBy: string;
  assignedByName: string;
  active: boolean;
  createdAt?: unknown;
}

export interface HomePlanLog {
  id: string;
  activityId: string;
  studentId: string;
  centerId: string;
  parentId: string;
  /** yyyy-mm-dd, local to the guardian. */
  date: string;
  completed: boolean;
  note: string;
}

export interface HomePlanMessage {
  id: string;
  activityId: string;
  studentId: string;
  centerId: string;
  parentId: string | null;
  senderId: string;
  senderName: string;
  senderRole: string;
  text: string;
  createdAt?: unknown;
}

function scopeFilter(scope: AccessScope): QueryConstraint {
  return scope.role === "parent"
    ? where("parentId", "==", scope.uid)
    : where("centerId", "==", scope.centerId);
}

async function notify(
  recipientId: string | null | undefined,
  payload: { type: string; title: string; message: string; [k: string]: unknown }
): Promise<void> {
  if (!recipientId) return;
  try {
    const student = typeof payload.studentId === "string" ? await studentsDb.get(payload.studentId) : null;
    if (!student) return;
    await addDoc(collection(db, "notifications"), {
      recipientId,
      read: false,
      createdAt: serverTimestamp(),
      ...payload,
      senderId: auth.currentUser?.uid,
      centerId: student.centerId,
      parentId: student.parentId,
    });
  } catch (err) {
    console.warn("[notifications] delivery failed for", recipientId, err);
  }
}

/** Local yyyy-mm-dd. Using toISOString() here would shift the day in any
 *  timezone behind UTC, logging yesterday's activity as today's. */
export function todayKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ─── Teletherapy sessions ─────────────────────────────────────────────────────

export const teletherapyDb = {
  schedule: async (input: {
    studentId: string;
    title: string;
    scheduledAt: string;
    durationMinutes: number;
    therapistId: string;
    therapistName: string;
    googleMeetUrl?: string;
  }): Promise<string> => {
    const meetUrl = googleMeetLink(input.googleMeetUrl);
    if (input.googleMeetUrl?.trim() && !meetUrl) {
      throw new Error("Enter a Google Meet link such as https://meet.google.com/abc-defg-hij.");
    }
    const student = await studentsDb.get(input.studentId);
    if (!student) throw new Error("Student not found.");
    if (!student.parentId) {
      throw new Error(
        "This student has no linked guardian account. Link an approved parent before scheduling a teletherapy session."
      );
    }

    if (Number.isNaN(new Date(input.scheduledAt).getTime())) {
      throw new Error("Please choose a valid date and time.");
    }
    if (input.durationMinutes <= 0 || input.durationMinutes > 240) {
      throw new Error("Duration must be between 1 and 240 minutes.");
    }

    const sessionId = uuidv4();
    const session: TeletherapySession = {
      id: sessionId,
      studentId: input.studentId,
      studentName: student.name,
      centerId: student.centerId,
      parentId: student.parentId ?? null,
      therapistId: input.therapistId,
      therapistName: input.therapistName,
      title: input.title.trim() || "Teletherapy session",
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      status: "scheduled",
      // Room names are derived from the session id, never from the child's
      // name — a guessable room would let an outsider walk into a session.
      roomName: `sc360-${sessionId}`,
      googleMeetUrl: meetUrl,
      sessionNote: "",
      parentJoinedAt: null,
      therapistJoinedAt: null,
    };

    const senderId = auth.currentUser?.uid;
    if (!senderId) throw new Error("Sign in again before scheduling a session.");
    const batch = writeBatch(db);
    batch.set(doc(db, "teletherapySessions", sessionId), {
      ...session,
      createdAt: serverTimestamp(),
    });

    const when = new Date(input.scheduledAt).toLocaleString("en-PK", {
      timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short",
    });
    batch.set(doc(db, "notifications", `teletherapy_${sessionId}`), {
      recipientId: student.parentId,
      senderId,
      centerId: student.centerId,
      parentId: student.parentId,
      read: false,
      createdAt: serverTimestamp(),
      type: "teletherapy_session",
      title: "Teletherapy Session Scheduled",
      message: `${session.title} for ${student.name} with ${input.therapistName} is scheduled for ${when} (Pakistan time), lasting ${input.durationMinutes} minutes.`,
      studentId: input.studentId,
      sessionId,
    });
    // Both records succeed together; notification failures cannot be hidden.
    await batch.commit();

    return sessionId;
  },

  setMeetBackup: async (sessionId: string, value: string): Promise<void> => {
    const meetUrl = googleMeetLink(value);
    if (value.trim() && !meetUrl) {
      throw new Error("Enter a Google Meet link such as https://meet.google.com/abc-defg-hij.");
    }
    await updateDoc(doc(db, "teletherapySessions", sessionId), {
      googleMeetUrl: meetUrl, updatedAt: serverTimestamp(),
    });
  },

  list: async (scope: AccessScope): Promise<TeletherapySession[]> => {
    const students = await studentsDb.list(scope);
    const lists = await Promise.all(students.map(async student => {
      const snap = await getDocs(query(collection(db, "teletherapySessions"),
        scopeFilter(scope), where("studentId", "==", student.id)));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }) as TeletherapySession);
    }));
    return lists.flat().sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  },

  /** Live view — the guardian's list should update the moment a session is booked. */
  subscribe: (
    scope: AccessScope,
    onData: (sessions: TeletherapySession[]) => void,
    onError: (err: unknown) => void
  ): Unsubscribe => {
    let cancelled = false;
    const stops: Unsubscribe[] = [];
    const lists = new Map<string, TeletherapySession[]>();
    void studentsDb.list(scope).then(students => {
      if (cancelled) return;
      if (!students.length) onData([]);
      for (const student of students) {
        stops.push(onSnapshot(query(collection(db, "teletherapySessions"), scopeFilter(scope),
          where("studentId", "==", student.id)), snap => {
            lists.set(student.id, snap.docs.map(d => ({ id: d.id, ...d.data() }) as TeletherapySession));
            onData([...lists.values()].flat().sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
          }, onError));
      }
    }).catch(onError);
    return () => { cancelled = true; stops.forEach(stop => stop()); };
  },

  get: async (sessionId: string): Promise<TeletherapySession | null> => {
    const snap = await getDoc(doc(db, "teletherapySessions", sessionId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as TeletherapySession) : null;
  },

  /** Attendance bookkeeping. A guardian may only ever write their own field —
   *  the rules restrict them to parentJoinedAt/updatedAt. */
  markJoined: async (sessionId: string, role: string): Promise<void> => {
    const field = role === "parent" ? "parentJoinedAt" : "therapistJoinedAt";
    await updateDoc(doc(db, "teletherapySessions", sessionId), {
      [field]: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  },

  complete: async (sessionId: string, sessionNote: string): Promise<void> => {
    await updateDoc(doc(db, "teletherapySessions", sessionId), {
      status: "completed",
      sessionNote,
      updatedAt: serverTimestamp(),
    });
    const session = await teletherapyDb.get(sessionId);
    await notify(session?.parentId, {
      type: "teletherapy_session",
      title: "Session Summary Available",
      message: `The therapist has written up the session for ${session?.studentName ?? "your child"}.`,
      studentId: session?.studentId,
      sessionId,
    });
  },

  cancel: async (sessionId: string): Promise<void> => {
    await updateDoc(doc(db, "teletherapySessions", sessionId), {
      status: "cancelled",
      updatedAt: serverTimestamp(),
    });
    const session = await teletherapyDb.get(sessionId);
    await notify(session?.parentId, {
      type: "teletherapy_session",
      title: "Session Cancelled",
      message: `The session for ${session?.studentName ?? "your child"} has been cancelled.`,
      studentId: session?.studentId,
      sessionId,
    });
  },
};

// ─── Home plan activities ─────────────────────────────────────────────────────

export const homePlanDb = {
  assign: async (input: {
    studentId: string;
    title: string;
    instructions: string;
    targetPerWeek: number;
    linkedGoalTitle?: string;
    assignedBy: string;
    assignedByName: string;
  }): Promise<string> => {
    const student = await studentsDb.get(input.studentId);
    if (!student) throw new Error("Student not found.");
    if (!input.title.trim()) throw new Error("Give the activity a title.");
    if (input.targetPerWeek < 1 || input.targetPerWeek > 7) {
      throw new Error("Target must be between 1 and 7 times per week.");
    }

    const activityId = uuidv4();
    await setDoc(doc(db, "homePlanActivities", activityId), {
      id: activityId,
      studentId: input.studentId,
      studentName: student.name,
      centerId: student.centerId,
      parentId: student.parentId ?? null,
      title: input.title.trim(),
      instructions: input.instructions.trim(),
      targetPerWeek: input.targetPerWeek,
      linkedGoalTitle: input.linkedGoalTitle ?? "",
      assignedBy: input.assignedBy,
      assignedByName: input.assignedByName,
      active: true,
      createdAt: serverTimestamp(),
    });

    await notify(student.parentId, {
      type: "home_plan_activity",
      title: "New Home Activity Assigned",
      message: `${input.assignedByName} assigned "${input.title.trim()}" for ${student.name}.`,
      studentId: input.studentId,
      activityId,
    });

    return activityId;
  },

  listActivities: async (scope: AccessScope, studentId?: string): Promise<HomePlanActivity[]> => {
    const constraints: QueryConstraint[] = [scopeFilter(scope)];
    if (studentId) constraints.push(where("studentId", "==", studentId));
    const snap = await getDocs(query(collection(db, "homePlanActivities"), ...constraints));
    // Sorted in memory so this does not need a third composite index.
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as HomePlanActivity)
      .sort((a, b) => a.title.localeCompare(b.title));
  },

  setActive: async (activityId: string, active: boolean): Promise<void> => {
    await updateDoc(doc(db, "homePlanActivities", activityId), { active });
  },

  deleteActivity: async (activityId: string): Promise<void> => {
    await deleteDoc(doc(db, "homePlanActivities", activityId));
  },

  // --- Daily logs ---

  /**
   * One log per activity per day. The id is deterministic so a guardian
   * toggling twice updates the same record instead of stacking duplicates.
   */
  logDay: async (input: {
    activity: HomePlanActivity;
    date: string;
    completed: boolean;
    note: string;
    parentId: string;
  }): Promise<void> => {
    const logId = `${input.activity.id}_${input.date}`;
    await setDoc(
      doc(db, "homePlanLogs", logId),
      {
        id: logId,
        activityId: input.activity.id,
        studentId: input.activity.studentId,
        centerId: input.activity.centerId,
        parentId: input.parentId,
        date: input.date,
        completed: input.completed,
        note: input.note,
        loggedAt: serverTimestamp(),
      },
      { merge: true }
    );
  },

  listLogs: async (scope: AccessScope, studentId?: string): Promise<HomePlanLog[]> => {
    const constraints: QueryConstraint[] = [scopeFilter(scope)];
    if (studentId) constraints.push(where("studentId", "==", studentId));
    const snap = await getDocs(query(collection(db, "homePlanLogs"), ...constraints));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as HomePlanLog)
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  // --- Per-activity discussion ---

  subscribeMessages: (
    activityId: string,
    studentId: string,
    scope: AccessScope,
    onData: (messages: HomePlanMessage[]) => void,
    onError: (err: unknown) => void
  ): Unsubscribe => {
    return onSnapshot(
      query(
        collection(db, "homePlanMessages"),
        where("activityId", "==", activityId),
        where("studentId", "==", studentId),
        scopeFilter(scope),
        orderBy("createdAt", "asc")
      ),
      (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HomePlanMessage)),
      onError
    );
  },

  sendMessage: async (input: {
    activity: HomePlanActivity;
    text: string;
    senderId: string;
    senderName: string;
    senderRole: string;
  }): Promise<void> => {
    const text = input.text.trim();
    if (!text) return;

    await addDoc(collection(db, "homePlanMessages"), {
      activityId: input.activity.id,
      studentId: input.activity.studentId,
      centerId: input.activity.centerId,
      parentId: input.activity.parentId ?? null,
      // senderId must equal the caller's uid — the rules enforce this so a
      // message cannot be posted under someone else's name.
      senderId: input.senderId,
      senderName: input.senderName,
      senderRole: input.senderRole,
      text,
      createdAt: serverTimestamp(),
    });

    // Tell the other side, never the author.
    const recipient =
      input.senderRole === "parent" ? input.activity.assignedBy : input.activity.parentId;
    await notify(recipient, {
      type: "home_plan_message",
      title: "Home Plan Message",
      message: `${input.senderName} commented on "${input.activity.title}".`,
      studentId: input.activity.studentId,
      activityId: input.activity.id,
    });
  },
};

// ─── Adherence ────────────────────────────────────────────────────────────────

export interface Adherence {
  completed: number;
  expected: number;
  percent: number;
  /** Consecutive days ending today that were marked complete. */
  streak: number;
  /** Last 7 days, oldest first. */
  recent: { date: string; completed: boolean }[];
}

/**
 * Adherence over the trailing `days` window.
 *
 * `expected` prorates the weekly target across the window rather than assuming
 * a full week, so a plan assigned two days ago does not read as 20% adherent.
 */
export function computeAdherence(
  activity: HomePlanActivity,
  logs: HomePlanLog[],
  days = 7,
  now: Date = new Date()
): Adherence {
  const forActivity = new Map<string, HomePlanLog>();
  for (const log of logs) {
    if (log.activityId === activity.id) forActivity.set(log.date, log);
  }

  const recent: { date: string; completed: boolean }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    recent.push({ date: key, completed: forActivity.get(key)?.completed === true });
  }

  const completed = recent.filter((r) => r.completed).length;
  const expected = Math.max(1, Math.round((activity.targetPerWeek * days) / 7));
  const percent = Math.min(100, Math.round((completed / expected) * 100));

  let streak = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].completed) streak++;
    else break;
  }

  return { completed, expected, percent, streak, recent };
}

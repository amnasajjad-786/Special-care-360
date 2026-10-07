/**
 * therapy-timeline-api.ts
 *
 * Dedicated data layer for the Dynamic Therapy Timeline / Scheduling Calendar module.
 * Direct Firestore real-time subscriptions, query builders, conflict checking,
 * parent notification dispatch, and backend validation fallback.
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
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";
import { v4 as uuidv4 } from "uuid";
import { AccessScope } from "./firestore-api";
import { TherapySession } from "@/types";


// ─── Scope Filter Helper (Matches Firestore security rules) ──────────────────

function scopeFilter(scope: AccessScope): QueryConstraint {
  return scope.role === "parent"
    ? where("parentId", "==", scope.uid)
    : where("centerId", "==", scope.centerId);
}

// ─── Conflict Checker ────────────────────────────────────────────────────────

export interface ConflictCheckResult {
  hasConflict: boolean;
  message?: string;
  conflictType?: "therapist" | "student";
}

/**
 * Checks if a session overlaps with any scheduled sessions in the center for the same therapist or student.
 * Overlap condition: max(start1, start2) < min(end1, end2)
 */
export async function detectTherapyConflict(params: {
  centerId: string;
  therapistId: string;
  studentId: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  excludeSessionId?: string;
}): Promise<ConflictCheckResult> {
  const { centerId, therapistId, studentId, date, startTime, endTime, excludeSessionId } = params;

  const targetStart = new Date(`${date}T${startTime}:00`).getTime();
  const targetEnd = new Date(`${date}T${endTime}:00`).getTime();

  if (isNaN(targetStart) || isNaN(targetEnd) || targetEnd <= targetStart) {
    return { hasConflict: false };
  }

  try {
    const q = query(
      collection(db, "therapySessions"),
      where("centerId", "==", centerId || "center-001")
    );
    const snap = await getDocs(q);

    for (const docSnap of snap.docs) {
      if (excludeSessionId && docSnap.id === excludeSessionId) continue;
      const s = docSnap.data() as Partial<TherapySession>;

      // Ignore cancelled or completed sessions
      const st = String(s.status || "").toLowerCase();
      if (st === "cancelled" || st === "completed" || st === "no show" || st === "no-show") {
        continue;
      }

      let existingStart = 0;
      let existingEnd = 0;

      if (s.startDateTime && s.endDateTime) {
        existingStart = new Date(s.startDateTime).getTime();
        existingEnd = new Date(s.endDateTime).getTime();
      } else if (s.date && s.startTime && s.endTime) {
        existingStart = new Date(`${s.date}T${s.startTime}:00`).getTime();
        existingEnd = new Date(`${s.date}T${s.endTime}:00`).getTime();
      } else if (s.scheduledAt) {
        existingStart = new Date(s.scheduledAt).getTime();
        existingEnd = existingStart + (Number(s.durationMinutes) || 45) * 60_000;
      }

      if (!existingStart || !existingEnd || isNaN(existingStart) || isNaN(existingEnd)) {
        continue;
      }

      const overlapStart = Math.max(targetStart, existingStart);
      const overlapEnd = Math.min(targetEnd, existingEnd);

      if (overlapStart < overlapEnd) {
        const fmt = (ms: number) =>
          new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        if (s.therapistId === therapistId) {
          return {
            hasConflict: true,
            conflictType: "therapist",
            message: `Schedule Conflict: This therapist already has a session during the selected time (${fmt(existingStart)} - ${fmt(existingEnd)}).`,
          };
        }
        if (s.studentId === studentId) {
          return {
            hasConflict: true,
            conflictType: "student",
            message: `Schedule Conflict: This student already has a session during the selected time (${fmt(existingStart)} - ${fmt(existingEnd)}).`,
          };
        }
      }
    }
  } catch (err) {
    console.warn("Client conflict check warning:", err);
  }

  return { hasConflict: false };
}

// ─── Notification Dispatcher ──────────────────────────────────────────────────

async function notifyParent(
  parentId: string | null | undefined,
  payload: { type: string; title: string; message: string; studentId: string; sessionId: string }
): Promise<void> {
  if (!parentId) return;
  try {
    await addDoc(collection(db, "notifications"), {
      recipientId: parentId,
      read: false,
      createdAt: serverTimestamp(),
      ...payload,
    });
  } catch (err) {
    console.warn("[therapy-notifications] Failed to notify parent:", parentId, err);
  }
}

// ─── Main Therapy Timeline Data Layer ─────────────────────────────────────────

export const therapyTimelineDb = {
  /**
   * Real-time subscription to center/parent scoped therapy sessions.
   */
  subscribe: (
    scope: AccessScope,
    onData: (sessions: TherapySession[]) => void,
    onError: (err: unknown) => void
  ): Unsubscribe => {
    return onSnapshot(
      query(
        collection(db, "therapySessions"),
        scopeFilter(scope)
      ),
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() as TherapySession;
          return {
            ...data,
            id: d.id,
            // Ensure backwards compatibility aliases
            title: data.title || `${data.therapyType || "Therapy"} - ${data.studentName || "Student"}`,
            scheduledAt: data.startDateTime || data.scheduledAt || `${data.date}T${data.startTime}:00`,
            durationMinutes:
              data.durationMinutes ||
              (data.startDateTime && data.endDateTime
                ? Math.round(
                    (new Date(data.endDateTime).getTime() - new Date(data.startDateTime).getTime()) / 60000
                  )
                : 45),
          };
        });

        // Sort chronologically
        list.sort((a, b) => {
          const aTime = a.startDateTime || a.scheduledAt || `${a.date} ${a.startTime}`;
          const bTime = b.startDateTime || b.scheduledAt || `${b.date} ${b.startTime}`;
          return aTime.localeCompare(bTime);
        });

        onData(list);
      },
      onError
    );
  },

  /**
   * One-time fetch of therapy sessions matching optional filters.
   */
  list: async (
    scope: AccessScope,
    filters?: {
      studentId?: string;
      therapistId?: string;
      therapyType?: string;
      status?: string;
    }
  ): Promise<TherapySession[]> => {
    const constraints: QueryConstraint[] = [scopeFilter(scope)];
    if (filters?.studentId) constraints.push(where("studentId", "==", filters.studentId));
    if (filters?.therapistId) constraints.push(where("therapistId", "==", filters.therapistId));
    if (filters?.therapyType) constraints.push(where("therapyType", "==", filters.therapyType));
    if (filters?.status) constraints.push(where("status", "==", filters.status));

    const snap = await getDocs(query(collection(db, "therapySessions"), ...constraints));
    const list = snap.docs.map((d) => {
      const data = d.data() as TherapySession;
      return {
        ...data,
        id: d.id,
        title: data.title || `${data.therapyType || "Therapy"} - ${data.studentName || "Student"}`,
        scheduledAt: data.startDateTime || data.scheduledAt || `${data.date}T${data.startTime}:00`,
      };
    });

    list.sort((a, b) => {
      const aTime = a.startDateTime || a.scheduledAt || `${a.date} ${a.startTime}`;
      const bTime = b.startDateTime || b.scheduledAt || `${b.date} ${b.startTime}`;
      return aTime.localeCompare(bTime);
    });

    return list;
  },

  /**
   * Fetch a single therapy session by ID.
   */
  get: async (sessionId: string): Promise<TherapySession | null> => {
    const snap = await getDoc(doc(db, "therapySessions", sessionId));
    if (!snap.exists()) return null;
    const data = snap.data() as TherapySession;
    return {
      ...data,
      id: snap.id,
      title: data.title || `${data.therapyType || "Therapy"} - ${data.studentName || "Student"}`,
      scheduledAt: data.startDateTime || data.scheduledAt || `${data.date}T${data.startTime}:00`,
    };
  },


  /**
   * Create a new therapy session (with repeat logic support and conflict validation).
   */
  create: async (
    sessionData: Omit<TherapySession, "id" | "createdAt" | "updatedAt">,
    currentUser: { uid: string; name?: string; role?: string; centerId?: string }
  ): Promise<string[]> => {
    const {
      centerId = currentUser.centerId || "center-001",
      studentId,
      studentName,
      therapistId,
      therapistName,
      therapyType,
      date,
      startTime,
      endTime,
      location,
      sessionType,
      notes = "",
      status = "Scheduled",
      repeatRule = "none",
      parentId = null,
      teletherapySessionId = null,
    } = sessionData;

    // Validate times
    const startDt = new Date(`${date}T${startTime}:00`);
    const endDt = new Date(`${date}T${endTime}:00`);
    if (isNaN(startDt.getTime()) || isNaN(endDt.getTime()) || endDt <= startDt) {
      throw new Error("End time must be after start time.");
    }

    // Determine occurrences for repeat rule
    const offsets: number[] = [0];
    if (repeatRule === "daily") offsets.push(1, 2, 3, 4);
    else if (repeatRule === "weekly") offsets.push(7, 14, 21);
    else if (repeatRule === "biweekly") offsets.push(14, 28);

    const baseDate = new Date(date);
    const createdIds: string[] = [];

    for (const offset of offsets) {
      const occDate = new Date(baseDate);
      occDate.setDate(occDate.getDate() + offset);
      const pad = (n: number) => String(n).padStart(2, "0");
      const occDateStr = `${occDate.getFullYear()}-${pad(occDate.getMonth() + 1)}-${pad(occDate.getDate())}`;

      // Conflict detection for each occurrence
      const conflict = await detectTherapyConflict({
        centerId,
        therapistId,
        studentId,
        date: occDateStr,
        startTime,
        endTime,
      });

      if (conflict.hasConflict) {
        throw new Error(conflict.message || "Schedule Conflict detected for the chosen slot.");
      }

      const occStartDt = new Date(`${occDateStr}T${startTime}:00`);
      const occEndDt = new Date(`${occDateStr}T${endTime}:00`);
      const durationMin = Math.round((occEndDt.getTime() - occStartDt.getTime()) / 60000);
      const sessionId = uuidv4();

      const docPayload = {
        id: sessionId,
        centerId,
        studentId,
        studentName,
        therapistId,
        therapistName,
        therapyType,
        date: occDateStr,
        startTime,
        endTime,
        startDateTime: occStartDt.toISOString(),
        endDateTime: occEndDt.toISOString(),
        location: location || (sessionType === "Tele-Therapy" ? "Virtual Room" : sessionType === "Home Session" ? "Home Visit" : "Therapy Clinic"),
        sessionType,
        notes,
        status,
        repeatRule,
        parentId,
        teletherapySessionId,
        title: `${therapyType} - ${studentName}`,
        scheduledAt: occStartDt.toISOString(),
        durationMinutes: durationMin,
        createdBy: currentUser.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, "therapySessions", sessionId), docPayload);
      createdIds.push(sessionId);

      // Notify parent
      if (parentId) {
        await notifyParent(parentId, {
          type: "therapy_session_scheduled",
          title: "New Therapy Session Scheduled",
          message: `${therapyType} has been scheduled for ${studentName} on ${occDateStr} at ${startTime}.`,
          studentId,
          sessionId,
        });
      }
    }

    return createdIds;
  },

  /**
   * Update an existing therapy session.
   */
  update: async (
    sessionId: string,
    updates: Partial<TherapySession>,
    currentUser?: { uid: string; name?: string }
  ): Promise<void> => {
    const existing = await therapyTimelineDb.get(sessionId);
    if (!existing) throw new Error("Therapy session not found.");

    const targetDate = updates.date || existing.date;
    const targetStartTime = updates.startTime || existing.startTime;
    const targetEndTime = updates.endTime || existing.endTime;
    const targetTherapistId = updates.therapistId || existing.therapistId;
    const targetStudentId = updates.studentId || existing.studentId;

    const timeChanged =
      (updates.date && updates.date !== existing.date) ||
      (updates.startTime && updates.startTime !== existing.startTime) ||
      (updates.endTime && updates.endTime !== existing.endTime) ||
      (updates.therapistId && updates.therapistId !== existing.therapistId);

    if (timeChanged) {
      const conflict = await detectTherapyConflict({
        centerId: existing.centerId,
        therapistId: targetTherapistId,
        studentId: targetStudentId,
        date: targetDate,
        startTime: targetStartTime,
        endTime: targetEndTime,
        excludeSessionId: sessionId,
      });

      if (conflict.hasConflict) {
        throw new Error(conflict.message || "Schedule Conflict detected for the rescheduled time.");
      }

      const startDt = new Date(`${targetDate}T${targetStartTime}:00`);
      const endDt = new Date(`${targetDate}T${targetEndTime}:00`);
      if (endDt <= startDt) throw new Error("End time must be after start time.");

      updates.startDateTime = startDt.toISOString();
      updates.endDateTime = endDt.toISOString();
      updates.scheduledAt = startDt.toISOString();
      updates.durationMinutes = Math.round((endDt.getTime() - startDt.getTime()) / 60000);
    }

    const payload: Record<string, unknown> = {
      ...updates,
      updatedAt: new Date().toISOString(),
      ...(currentUser?.uid ? { updatedBy: currentUser.uid } : {}),
    };

    await updateDoc(doc(db, "therapySessions", sessionId), payload);


    // Notify parent if rescheduled or cancelled
    if (existing.parentId) {
      if (updates.status === "Cancelled" || updates.status === "cancelled") {
        await notifyParent(existing.parentId, {
          type: "therapy_session_cancelled",
          title: "Therapy Session Cancelled",
          message: `The ${existing.therapyType} session for ${existing.studentName} scheduled on ${existing.date} has been cancelled.`,
          studentId: existing.studentId,
          sessionId,
        });
      } else if (timeChanged || updates.status === "Rescheduled" || updates.status === "rescheduled") {
        await notifyParent(existing.parentId, {
          type: "therapy_session_rescheduled",
          title: "Therapy Session Rescheduled",
          message: `The ${existing.therapyType} session for ${existing.studentName} has been rescheduled to ${targetDate} at ${targetStartTime}.`,
          studentId: existing.studentId,
          sessionId,
        });
      }
    }
  },

  /**
   * Delete a session.
   */
  delete: async (sessionId: string): Promise<void> => {
    await deleteDoc(doc(db, "therapySessions", sessionId));
  },
};

/**
 * messaging-api.ts — care-team messaging (Charter scope: secure messaging
 * between parents, therapists and caregivers).
 *
 * One conversation per child. Its members are exactly the people the rules
 * already let see that child: the linked guardian, the assigned teacher,
 * therapists and caregivers, and the centre's admins. Messages are
 * append-only; nobody can edit or delete what was said.
 *
 * Like every other collection, messages carry `centerId` and `parentId`, and
 * list queries filter on the caller's scope so the rules can authorise them.
 */

import { addDoc, collection, onSnapshot, query, serverTimestamp, where, type Timestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { scopeOf, studentsDb, type StudentDoc } from "./firestore-api";
import { recordAudit } from "./audit";

export interface CareMessage {
  id: string;
  studentId: string;
  centerId: string;
  parentId: string | null;
  senderId: string;
  senderName: string;
  senderRole: string;
  text: string;
  createdAt: Timestamp | null;
}

export const MAX_MESSAGE_LENGTH = 2000;

type Profile = { uid?: string; role?: string; centerId?: string; name?: string } | null | undefined;

/** Everyone who should hear about a new message, except its sender. */
function teamRecipients(student: StudentDoc, senderId: string): string[] {
  const ids = new Set<string>();
  if (student.parentId) ids.add(student.parentId);
  if (student.teacherId) ids.add(student.teacherId);
  (student.therapistIds ?? []).forEach((id) => ids.add(id));
  ((student.caregiverIds as string[] | undefined) ?? []).forEach((id) => ids.add(id));
  ids.delete(senderId);
  return [...ids];
}

export const careMessagesDb = {
  /** Live conversation for one child, oldest first. Returns the unsubscribe. */
  subscribe(
    studentId: string,
    profile: Profile,
    onMessages: (messages: CareMessage[]) => void,
    onError: (error: Error) => void,
  ): () => void {
    const scope = scopeOf(profile);
    const scoped = scope.role === "parent" ? where("parentId", "==", scope.uid) : where("centerId", "==", scope.centerId);
    return onSnapshot(
      query(collection(db, "careMessages"), where("studentId", "==", studentId), scoped),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CareMessage, "id">) }));
        // Pending local writes have no server time yet; keep them at the end.
        rows.sort((a, b) => (a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER) - (b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER));
        onMessages(rows);
      },
      onError,
    );
  },

  async send(studentId: string, text: string, profile: Profile): Promise<void> {
    const body = text.trim();
    if (!body) throw new Error("Type a message first.");
    if (body.length > MAX_MESSAGE_LENGTH) throw new Error(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);
    const senderId = auth.currentUser?.uid;
    if (!senderId || !profile?.role) throw new Error("Sign in again before sending.");
    const student = await studentsDb.get(studentId);
    if (!student) throw new Error("Student not found.");

    const ref = await addDoc(collection(db, "careMessages"), {
      studentId,
      centerId: student.centerId,
      parentId: student.parentId ?? null,
      senderId,
      senderName: (profile.name ?? "").slice(0, 120),
      senderRole: profile.role,
      text: body,
      createdAt: serverTimestamp(),
    });

    // Notification delivery is best-effort: the message itself is saved.
    const preview = body.length > 140 ? `${body.slice(0, 137)}...` : body;
    await Promise.all(teamRecipients(student, senderId).map(async (recipientId) => {
      try {
        await addDoc(collection(db, "notifications"), {
          recipientId,
          senderId,
          read: false,
          createdAt: serverTimestamp(),
          type: "care_team_message",
          title: `Message about ${student.name}`,
          message: `${profile.name || "A care team member"}: ${preview}`,
          studentId,
          centerId: student.centerId,
          parentId: student.parentId ?? null,
        });
      } catch (err) {
        console.warn("[messages] notification failed for", recipientId, err);
      }
    }));
    void recordAudit({ action: "message.send", targetType: "careMessage", targetId: ref.id, studentId, summary: `Sent a care-team message (${body.length} characters)` });
  },
};

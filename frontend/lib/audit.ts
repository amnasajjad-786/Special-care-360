/**
 * audit.ts — append-only access and change log (WBS 2.4.3).
 *
 * Entries live in the `auditLogs` collection. The rules let any approved user
 * append an entry about themselves, let admins read their own centre's
 * entries, and forbid every update and delete, so the history cannot be
 * rewritten from a browser.
 *
 * Writing an entry must never block or fail the care action it describes, so
 * failures are logged and swallowed, the same policy as notifications. The
 * backend writes its own entries for the actions it performs.
 */

import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, where, type Timestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

export interface AuditEntry {
  id: string;
  centerId: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  studentId: string | null;
  summary: string;
  source: "web" | "api";
  at: Timestamp | null;
}

interface Actor { uid: string; name: string; role: string; centerId: string }

let cachedActor: Actor | null = null;

async function currentActor(): Promise<Actor | null> {
  const user = auth.currentUser;
  if (!user) return null;
  if (cachedActor?.uid === user.uid) return cachedActor;
  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.data();
  if (!data || data.status !== "approved") return null;
  cachedActor = { uid: user.uid, name: String(data.name ?? ""), role: String(data.role ?? ""), centerId: String(data.centerId ?? "") };
  return cachedActor;
}

/** Forget the cached actor, e.g. on sign-out. */
export function resetAuditActor(): void {
  cachedActor = null;
}

export interface AuditInput {
  action: string;
  targetType: string;
  targetId?: string | null;
  studentId?: string | null;
  summary: string;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const actor = await currentActor();
    if (!actor) return;
    await addDoc(collection(db, "auditLogs"), {
      centerId: actor.centerId,
      actorUid: actor.uid,
      actorName: actor.name.slice(0, 120),
      actorRole: actor.role,
      action: input.action.slice(0, 80),
      targetType: input.targetType.slice(0, 40),
      targetId: String(input.targetId ?? "").slice(0, 200),
      studentId: input.studentId ?? null,
      summary: input.summary.slice(0, 500),
      source: "web",
      at: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[audit] entry not recorded:", input.action, err);
  }
}

const viewedThisSession = new Set<string>();

/** Record that the signed-in user opened a student's record, once per session. */
export function recordStudentView(studentId: string, studentName: string, section = "profile"): void {
  const key = `${studentId}:${section}`;
  if (viewedThisSession.has(key)) return;
  viewedThisSession.add(key);
  void recordAudit({ action: `student.view.${section}`, targetType: "student", targetId: studentId, studentId, summary: `Viewed ${section} of ${studentName}` });
}

type AnyAsync = (...args: never[]) => Promise<unknown>;

/**
 * Wrap data-layer methods so each successful call appends an audit entry.
 * The original call's result and errors pass through untouched; a failed
 * action records nothing.
 */
export function instrument<T extends Record<string, unknown>>(
  target: T,
  rules: { [K in keyof T]?: (args: Parameters<Extract<T[K], AnyAsync>>, result: Awaited<ReturnType<Extract<T[K], AnyAsync>>>) => AuditInput | null },
): void {
  for (const key of Object.keys(rules) as (keyof T)[]) {
    const original = target[key] as unknown as AnyAsync;
    const describe = rules[key] as unknown as (args: unknown[], result: unknown) => AuditInput | null;
    if (typeof original !== "function") continue;
    (target as Record<keyof T, unknown>)[key] = async (...args: unknown[]) => {
      const result = await (original as (...a: unknown[]) => Promise<unknown>)(...args);
      try {
        const entry = describe(args, result);
        if (entry) await recordAudit(entry);
      } catch (err) {
        console.warn("[audit] could not describe", String(key), err);
      }
      return result;
    };
  }
}

export async function listAuditEntries(centerId: string, max = 300): Promise<AuditEntry[]> {
  const snap = await getDocs(query(collection(db, "auditLogs"), where("centerId", "==", centerId), orderBy("at", "desc"), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditEntry, "id">) }));
}

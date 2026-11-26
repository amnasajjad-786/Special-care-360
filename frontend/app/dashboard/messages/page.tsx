"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { MessageSquare, Send, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { scopeOf, studentsDb, type StudentDoc } from "@/lib/firestore-api";
import { careMessagesDb, MAX_MESSAGE_LENGTH, type CareMessage } from "@/lib/messaging-api";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", teacher: "Teacher", therapist: "Therapist", parent: "Parent", caregiver: "Caregiver",
};

export default function MessagesPage() {
  const { profile } = useAuth();
  const [students, setStudents] = useState<StudentDoc[] | null>(null);
  const [studentsError, setStudentsError] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<CareMessage[] | null>(null);
  const [threadError, setThreadError] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    studentsDb.list(scopeOf(profile))
      .then((rows) => {
        setStudents(rows);
        setSelectedId((current) => current || rows[0]?.id || "");
      })
      .catch((err) => {
        console.error("[messages] students failed:", err);
        setStudentsError(true);
      });
  }, [profile]);

  useEffect(() => {
    if (!selectedId || !profile) return;
    // Clear the previous child's thread while the new one loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(null);
    setThreadError(false);
    return careMessagesDb.subscribe(
      selectedId,
      profile,
      setMessages,
      (err) => {
        console.error("[messages] thread failed:", err);
        setThreadError(true);
      },
    );
  }, [selectedId, profile]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const selected = useMemo(() => students?.find((s) => s.id === selectedId) ?? null, [students, selectedId]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    try {
      await careMessagesDb.send(selectedId, draft, profile);
      setDraft("");
    } catch (err) {
      console.error("[messages] send failed:", err);
      toast.error(err instanceof Error ? err.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  };

  if (studentsError) {
    return <div className="glass-card" role="alert" style={{ padding: 24, color: "var(--danger)" }}>Your students could not be loaded. Reload the page to try again.</div>;
  }
  if (students === null) {
    return <div className="skeleton" style={{ height: 320, borderRadius: 16 }} />;
  }
  if (students.length === 0) {
    return (
      <div className="glass-card" style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
        <MessageSquare size={36} style={{ opacity: 0.4, marginBottom: 8 }} />
        <p style={{ margin: 0 }}>You are not linked to any student yet, so there is no care team to message.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 260px) 1fr", gap: 20, alignItems: "start" }} className="messages-layout">
      <style>{`@media (max-width: 760px) { .messages-layout { grid-template-columns: 1fr !important; } }`}</style>

      <aside className="glass-card" style={{ padding: 14 }} aria-label="Conversations">
        <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)", margin: "4px 6px 10px", display: "flex", alignItems: "center", gap: 6 }}>
          <Users size={14} /> Care team conversations
        </div>
        {students.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedId(s.id)}
            style={{
              display: "block", width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10, marginBottom: 4,
              border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem",
              background: s.id === selectedId ? "rgba(123,196,196,0.18)" : "transparent",
              color: s.id === selectedId ? "var(--primary-dark)" : "var(--text-primary)",
            }}
          >
            {s.name}
          </button>
        ))}
      </aside>

      <section className="glass-card" style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 480, maxHeight: "calc(100vh - 160px)" }}>
        <header style={{ padding: "16px 20px", borderBottom: "1px solid rgba(61,79,107,0.08)" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--primary-dark)", display: "flex", alignItems: "center", gap: 8 }}>
            <MessageSquare size={18} /> {selected?.name ?? "Conversation"}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldCheck size={13} /> Visible only to this child&apos;s guardian, assigned staff and centre admins. Messages cannot be edited or deleted.
          </p>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }} aria-live="polite">
          {threadError ? (
            <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>This conversation could not be loaded. Check your connection and reload.</p>
          ) : messages === null ? (
            <div className="skeleton" style={{ height: 120, borderRadius: 10 }} />
          ) : messages.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", margin: "auto", textAlign: "center" }}>No messages yet. Start the conversation with {selected?.name}&apos;s care team.</p>
          ) : messages.map((m) => {
            const mine = m.senderId === profile?.uid;
            const at = m.createdAt?.toDate?.();
            return (
              <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "78%" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: 3, textAlign: mine ? "right" : "left" }}>
                  {mine ? "You" : m.senderName || "Care team"} · {ROLE_LABEL[m.senderRole] ?? m.senderRole}{at ? ` · ${at.toLocaleString()}` : " · sending"}
                </div>
                <div style={{
                  padding: "10px 14px", borderRadius: 14, fontSize: "0.9rem", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                  background: mine ? "var(--accent-teal)" : "rgba(61,79,107,0.06)", color: mine ? "#fff" : "var(--text-primary)",
                }}>
                  {m.text}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} style={{ padding: 14, borderTop: "1px solid rgba(61,79,107,0.08)", display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea
            className="glass-input"
            rows={2}
            value={draft}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); }
            }}
            placeholder={`Message ${selected?.name ?? "the"} care team... (Enter to send, Shift+Enter for a new line)`}
            aria-label="Message"
            style={{ flex: 1, resize: "vertical" }}
          />
          <button type="submit" className="btn-primary" disabled={sending || !draft.trim() || threadError} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px" }}>
            <Send size={15} /> {sending ? "Sending..." : "Send"}
          </button>
        </form>
      </section>
    </div>
  );
}

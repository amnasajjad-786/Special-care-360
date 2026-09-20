"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { homePlanDb, type HomePlanActivity, type HomePlanMessage } from "@/lib/teletherapy-api";
import toast from "react-hot-toast";
import { Send, X, MessageSquare } from "lucide-react";

/**
 * Per-activity discussion between the guardian and the assigning therapist.
 * Messages are append-only — firestore.rules denies updates, so nobody can
 * rewrite what the other side said about a child's care.
 */
export default function ActivityThread({
  activity,
  onClose,
}: {
  activity: HomePlanActivity;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<HomePlanMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = homePlanDb.subscribeMessages(
      activity.id,
      (list) => { setMessages(list); setLoadError(false); },
      (err) => {
        console.error("Thread listener failed:", err);
        setMessages([]);
        setLoadError(true);
      }
    );
    return unsub;
  }, [activity.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !profile) return;
    setSending(true);
    try {
      await homePlanDb.sendMessage({
        activity,
        text,
        senderId: profile.uid,
        senderName: profile.name,
        senderRole: profile.role,
      });
      setText("");
    } catch (err) {
      console.error(err);
      toast.error("Message could not be sent.");
    } finally {
      setSending(false);
    }
  };

  const formatTime = (createdAt: unknown): string => {
    if (!createdAt) return "Sending…";
    const value = createdAt as { toDate?: () => Date };
    const d = typeof value.toDate === "function" ? value.toDate() : new Date(createdAt as string);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px", display: "flex", flexDirection: "column", maxHeight: "80vh" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "14px" }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, color: "var(--primary-dark)", fontWeight: 700, fontSize: "1rem" }}>
              {activity.title}
            </h3>
            <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
              Discussion with {profile?.role === "parent" ? activity.assignedByName : "the family"}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", padding: "4px 2px", minHeight: "160px" }}>
          {loadError ? (
            <p style={{ textAlign: "center", color: "var(--danger)", fontSize: "0.84rem" }}>
              Messages could not be loaded.
            </p>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.84rem", padding: "24px 0" }}>
              <MessageSquare size={30} style={{ opacity: 0.4 }} />
              <p style={{ margin: "8px 0 0" }}>No messages yet. Ask a question about this activity.</p>
            </div>
          ) : (
            messages.map((m) => {
              const mine = m.senderId === profile?.uid;
              return (
                <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                  <div
                    style={{
                      padding: "9px 13px",
                      borderRadius: mine ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                      background: mine ? "var(--accent-teal)" : "rgba(255,255,255,0.7)",
                      color: mine ? "white" : "var(--text-primary)",
                      fontSize: "0.86rem",
                      lineHeight: 1.5,
                      border: mine ? "none" : "1px solid rgba(0,0,0,0.06)",
                      wordBreak: "break-word",
                    }}
                  >
                    {m.text}
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", marginTop: "3px", textAlign: mine ? "right" : "left" }}>
                    {m.senderName} · {formatTime(m.createdAt)}
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={handleSend} style={{ display: "flex", gap: "8px", marginTop: "14px", paddingTop: "12px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
          <input
            className="glass-input"
            placeholder="Write a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-primary" disabled={sending || !text.trim()} style={{ padding: "10px 16px" }}>
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}

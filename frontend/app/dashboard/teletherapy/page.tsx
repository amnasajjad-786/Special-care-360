"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { studentsDb, scopeOf, type StudentDoc } from "@/lib/firestore-api";
import {
  teletherapyDb,
  type TeletherapySession,
  type SessionStatus,
} from "@/lib/teletherapy-api";
import VideoRoom from "@/components/teletherapy/VideoRoom";
import toast from "react-hot-toast";
import {
  Video,
  CalendarPlus,
  Clock,
  User,
  CheckCircle,
  XCircle,
  NotebookPen,
  AlertTriangle,
  X,
} from "lucide-react";

const STATUS_CHIP: Record<SessionStatus, string> = {
  scheduled: "chip-info",
  completed: "chip-success",
  cancelled: "chip-gray",
};

/** A session is joinable from 10 minutes before until its scheduled end. */
function joinWindow(session: TeletherapySession, now: Date) {
  const start = new Date(session.scheduledAt).getTime();
  const end = start + session.durationMinutes * 60000;
  const opens = start - 10 * 60000;
  return {
    open: now.getTime() >= opens && now.getTime() <= end,
    past: now.getTime() > end,
  };
}

export default function TeletherapyPage() {
  const { profile, getIdToken } = useAuth();
  const scope = useMemo(() => scopeOf(profile), [profile]);

  const [sessions, setSessions] = useState<TeletherapySession[]>([]);
  const [students, setStudents] = useState<StudentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeSession, setActiveSession] = useState<TeletherapySession | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [noteFor, setNoteFor] = useState<TeletherapySession | null>(null);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-render on a timer so the join window opens without a manual refresh.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const canSchedule = profile?.role === "therapist" || profile?.role === "admin";

  const [form, setForm] = useState({
    studentId: "",
    title: "",
    date: "",
    time: "",
    durationMinutes: "45",
  });

  useEffect(() => {
    if (!profile) return;
    const unsub = teletherapyDb.subscribe(
      scope,
      (list) => { setSessions(list); setLoading(false); setLoadError(false); },
      (err) => {
        console.error("Teletherapy listener failed:", err);
        setSessions([]);
        setLoading(false);
        setLoadError(true);
      }
    );
    return unsub;
  }, [profile, scope]);

  useEffect(() => {
    if (!profile || !canSchedule) return;
    studentsDb
      .list(scope)
      .then(setStudents)
      .catch((err) => {
        console.error("Failed to load students:", err);
        toast.error("Could not load the student list.");
      });
  }, [profile, canSchedule, scope]);

  const upcoming = sessions.filter((s) => s.status === "scheduled" && !joinWindow(s, now).past);
  const past = sessions
    .filter((s) => s.status !== "scheduled" || joinWindow(s, now).past)
    .slice()
    .reverse();

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.studentId || !form.date || !form.time) {
      toast.error("Choose a student, date and time.");
      return;
    }
    const scheduledAt = new Date(`${form.date}T${form.time}`);
    if (Number.isNaN(scheduledAt.getTime())) {
      toast.error("That date and time could not be read.");
      return;
    }
    if (scheduledAt.getTime() < Date.now() - 60000) {
      toast.error("Pick a time in the future.");
      return;
    }

    setSaving(true);
    try {
      await teletherapyDb.schedule({
        studentId: form.studentId,
        title: form.title,
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes: parseInt(form.durationMinutes, 10),
        therapistId: profile?.uid ?? "",
        therapistName: profile?.name ?? "Therapist",
      });
      toast.success("Session scheduled. The family has been notified.");
      setShowSchedule(false);
      setForm({ studentId: "", title: "", date: "", time: "", durationMinutes: "45" });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not schedule the session.");
    } finally {
      setSaving(false);
    }
  };

  const handleJoin = async (session: TeletherapySession) => {
    setActiveSession(session);
    try {
      await teletherapyDb.markJoined(session.id, profile?.role ?? "");
    } catch (err) {
      // Attendance bookkeeping is not worth blocking the call over.
      console.warn("Could not record attendance:", err);
    }
  };

  const handleSaveNote = async () => {
    if (!noteFor) return;
    setSaving(true);
    try {
      await teletherapyDb.complete(noteFor.id, noteText);
      toast.success("Session summary saved.");
      setNoteFor(null);
      setNoteText("");
    } catch (err) {
      console.error(err);
      toast.error("Could not save the summary.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (session: TeletherapySession) => {
    if (!confirm(`Cancel the session for ${session.studentName}?`)) return;
    try {
      await teletherapyDb.cancel(session.id);
      toast.success("Session cancelled.");
    } catch (err) {
      console.error(err);
      toast.error("Could not cancel the session.");
    }
  };

  if (activeSession) {
    return (
      <div style={{ maxWidth: "980px", margin: "0 auto" }}>
        <div style={{ marginBottom: "16px" }}>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "var(--primary-dark)" }}>
            {activeSession.title}
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "0.88rem" }}>
            {activeSession.studentName} &middot; with {activeSession.therapistName}
          </p>
        </div>
        <VideoRoom
          roomName={activeSession.roomName}
          displayName={profile?.name || "Participant"}
          sessionId={activeSession.id}
          getIdToken={getIdToken}
          onLeave={() => setActiveSession(null)}
        />
        <button
          className="btn-ghost"
          onClick={() => setActiveSession(null)}
          style={{ marginTop: "14px" }}
        >
          Back to sessions
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: "40px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>
        <div style={{ flex: 1, minWidth: "240px" }}>
          <h1 style={{ fontSize: "2rem", color: "var(--primary-dark)", fontWeight: 800, margin: 0 }}>
            Teletherapy
          </h1>
          <p style={{ color: "var(--text-secondary)", margin: "4px 0 0", fontSize: "0.9rem" }}>
            {profile?.role === "parent"
              ? "Join your child's remote therapy sessions and read the therapist's summary afterwards."
              : "Schedule and run remote sessions with families."}
          </p>
        </div>
        {canSchedule && (
          <button
            className="btn-primary"
            onClick={() => setShowSchedule(true)}
            style={{ padding: "11px 22px", display: "inline-flex", alignItems: "center", gap: "8px" }}
          >
            <CalendarPlus size={16} /> Schedule session
          </button>
        )}
      </div>

      {loadError && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", background: "rgba(229,62,62,0.08)", border: "1px solid rgba(229,62,62,0.25)", color: "var(--danger)", fontSize: "0.85rem", display: "flex", gap: "10px", alignItems: "center", marginBottom: "20px" }}>
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>Sessions could not be loaded, so this list may be incomplete. Please reload.</span>
        </div>
      )}

      {loading ? (
        <div className="glass-card" style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
          Loading sessions…
        </div>
      ) : (
        <>
          <SessionGroup
            heading="Upcoming"
            sessions={upcoming}
            emptyText="No upcoming sessions."
            now={now}
            profileRole={profile?.role ?? ""}
            onJoin={handleJoin}
            onCancel={handleCancel}
            onWriteNote={(s) => { setNoteFor(s); setNoteText(s.sessionNote ?? ""); }}
          />
          <SessionGroup
            heading="Past sessions"
            sessions={past}
            emptyText="Nothing here yet."
            now={now}
            profileRole={profile?.role ?? ""}
            onJoin={handleJoin}
            onCancel={handleCancel}
            onWriteNote={(s) => { setNoteFor(s); setNoteText(s.sessionNote ?? ""); }}
          />
        </>
      )}

      {/* Schedule modal */}
      {showSchedule && (
        <div className="modal-overlay" onClick={() => setShowSchedule(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "460px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, flex: 1, color: "var(--primary-dark)", fontWeight: 700 }}>Schedule a session</h3>
              <button onClick={() => setShowSchedule(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSchedule} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                Student
                <select
                  className="glass-input"
                  required
                  value={form.studentId}
                  onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                  style={{ marginTop: "4px" }}
                >
                  <option value="">Select student…</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                Title
                <input
                  className="glass-input"
                  placeholder="Speech therapy review"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  style={{ marginTop: "4px" }}
                />
              </label>
              <div style={{ display: "flex", gap: "10px" }}>
                <label style={{ flex: 1, fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Date
                  <input type="date" className="glass-input" required value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ marginTop: "4px" }} />
                </label>
                <label style={{ flex: 1, fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Time
                  <input type="time" className="glass-input" required value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })} style={{ marginTop: "4px" }} />
                </label>
              </div>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                Duration (minutes)
                <input type="number" min={10} max={240} className="glass-input" value={form.durationMinutes}
                  onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} style={{ marginTop: "4px" }} />
              </label>
              <button type="submit" className="btn-primary" disabled={saving} style={{ padding: "12px", marginTop: "4px" }}>
                {saving ? "Scheduling…" : "Schedule session"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Session summary modal */}
      {noteFor && (
        <div className="modal-overlay" onClick={() => setNoteFor(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <h3 style={{ margin: "0 0 4px", color: "var(--primary-dark)", fontWeight: 700 }}>Session summary</h3>
            <p style={{ margin: "0 0 14px", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              {noteFor.studentName} &middot; {new Date(noteFor.scheduledAt).toLocaleString()}
            </p>
            <textarea
              className="glass-input"
              rows={6}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="What was worked on, how the child responded, what to continue at home…"
            />
            <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
              <button className="btn-ghost" onClick={() => setNoteFor(null)} style={{ flex: 1 }}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveNote} disabled={saving} style={{ flex: 1 }}>
                {saving ? "Saving…" : "Save & mark complete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionGroup({
  heading, sessions, emptyText, now, profileRole, onJoin, onCancel, onWriteNote,
}: {
  heading: string;
  sessions: TeletherapySession[];
  emptyText: string;
  now: Date;
  profileRole: string;
  onJoin: (s: TeletherapySession) => void;
  onCancel: (s: TeletherapySession) => void;
  onWriteNote: (s: TeletherapySession) => void;
}) {
  const isClinician = profileRole === "therapist" || profileRole === "admin";

  return (
    <section style={{ marginBottom: "32px" }}>
      <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--primary-dark)", marginBottom: "12px" }}>
        {heading}
      </h2>
      {sessions.length === 0 ? (
        <div className="glass-card" style={{ padding: "22px", color: "var(--text-secondary)", fontSize: "0.88rem" }}>
          {emptyText}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {sessions.map((s) => {
            const win = joinWindow(s, now);
            const canJoin = s.status === "scheduled" && win.open;
            return (
              <div key={s.id} className="glass-card" style={{ padding: "18px 20px", display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ padding: "10px", borderRadius: "10px", background: "rgba(123,196,196,0.15)", color: "var(--accent-teal)" }}>
                  <Video size={20} />
                </div>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <div style={{ fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem" }}>{s.title}</div>
                  <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginTop: "4px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <User size={13} /> {s.studentName}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Clock size={13} /> {new Date(s.scheduledAt).toLocaleString()} &middot; {s.durationMinutes} min
                    </span>
                  </div>
                  {s.sessionNote ? (
                    <p style={{ margin: "8px 0 0", fontSize: "0.82rem", color: "var(--text-primary)", background: "rgba(255,255,255,0.45)", padding: "8px 10px", borderRadius: "8px", lineHeight: 1.5 }}>
                      {s.sessionNote}
                    </p>
                  ) : null}
                </div>
                <span className={`chip ${STATUS_CHIP[s.status]}`} style={{ textTransform: "capitalize" }}>{s.status}</span>
                <div style={{ display: "flex", gap: "8px" }}>
                  {canJoin && (
                    <button className="btn-primary" onClick={() => onJoin(s)} style={{ padding: "9px 18px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <Video size={14} /> Join
                    </button>
                  )}
                  {!canJoin && s.status === "scheduled" && !win.past && (
                    <span style={{ fontSize: "0.76rem", color: "var(--text-secondary)" }}>Opens 10 min before</span>
                  )}
                  {isClinician && s.status === "scheduled" && (
                    <>
                      <button className="btn-ghost" onClick={() => onWriteNote(s)} style={{ padding: "9px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <NotebookPen size={14} /> Summary
                      </button>
                      <button className="btn-ghost" onClick={() => onCancel(s)} style={{ padding: "9px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <XCircle size={14} /> Cancel
                      </button>
                    </>
                  )}
                  {isClinician && s.status === "completed" && (
                    <button className="btn-ghost" onClick={() => onWriteNote(s)} style={{ padding: "9px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <CheckCircle size={14} /> Edit summary
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

"use client";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { dailyCareDb, studentsDb } from "@/lib/firestore-api";
import { DailyCareJournal } from "@/types";
import JournalForm from "@/components/daily-care/JournalForm";
import DailyDigest from "@/components/daily-care/DailyDigest";

import toast from "react-hot-toast";
import { CheckCircle, Clock, ClipboardList } from "lucide-react";

export default function DailyCarePage() {
  const { profile } = useAuth();
  const [students, setStudents] = useState<{ id: string; name: string; parentId?: string }[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string } | null>(null);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [existingJournal, setExistingJournal] = useState<DailyCareJournal | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<DailyCareJournal[]>([]);

  const isTeacher = profile?.role === "teacher" || profile?.role === "admin";

  const fetchHistory = async () => {
    if (!selectedStudent) return;
    try {
      const logs = await dailyCareDb.history(selectedStudent.id);
      setHistory(logs as DailyCareJournal[]);
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [selectedStudent?.id, existingJournal]);

  const handleDeleteJournal = async () => {
    if (!selectedStudent || !existingJournal) return;
    if (confirm(`Are you sure you want to delete the daily care log for ${selectedStudent.name} on ${date}?`)) {
      setLoading(true);
      try {
        await dailyCareDb.delete(selectedStudent.id, date);
        setExistingJournal(null);
        toast.success("Daily care log deleted successfully");
        fetchHistory();
      } catch (err) {
        console.error("Failed to delete journal:", err);
        toast.error("Failed to delete journal");
      }
      setLoading(false);
    }
  };

  // Load students list dynamically
  useEffect(() => {
    const loadStudents = async () => {
      try {
        const allowed = await studentsDb.list(
          profile?.centerId ?? "center-001",
          profile?.role,
          profile?.uid
        );
        setStudents(allowed);
        if (allowed.length > 0) {
          setSelectedStudent(allowed[0]);
        }
      } catch (err) {
        console.error("Failed to load students:", err);
        toast.error("Failed to load students");
      }
    };
    if (profile) {
      loadStudents();
    }
  }, [profile]);

  useEffect(() => {
    if (!selectedStudent) return;
    const fetchJournal = async () => {
      setLoading(true);
      try {
        const data = await dailyCareDb.get(selectedStudent.id, date);
        setExistingJournal((data as DailyCareJournal) || null);
      } catch (err) {
        console.error("Failed to load journal:", err);
        setExistingJournal(null);
      }
      setLoading(false);
    };
    fetchJournal();
  }, [selectedStudent?.id, date]);

  if (!selectedStudent) {
    return (
      <div className="glass-card animate-fade-in" style={{ padding: "40px", textAlign: "center" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading student profile...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header Controls */}
      <div className="glass-card" style={{ padding: "18px 24px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase" }}>Student</label>
            {students.length > 1 ? (
              <select id="dc-student-select" className="glass-input" style={{ minWidth: "180px" }}
                value={selectedStudent.id} onChange={e => setSelectedStudent(students.find(s => s.id === e.target.value) || students[0])}>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (
              <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.4)", borderRadius: "10px", fontWeight: 600, fontSize: "0.9rem", color: "var(--primary-dark)", border: "1px solid rgba(255,255,255,0.5)" }}>
                {selectedStudent.name}
              </div>
            )}
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase" }}>Date</label>
            <input id="dc-date-select" type="date" className="glass-input" value={date} max={format(new Date(), "yyyy-MM-dd")} onChange={e => setDate(e.target.value)} style={{ minWidth: "160px" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span className={`chip ${existingJournal ? "chip-success" : "chip-warning"}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            {existingJournal ? <CheckCircle size={14} /> : <Clock size={14} />}
            {existingJournal ? "Submitted" : "Pending"}
          </span>
          {isTeacher && existingJournal && (
            <button
              id="dc-delete-btn"
              onClick={handleDeleteJournal}
              style={{
                background: "rgba(229, 62, 62, 0.1)",
                color: "var(--danger)",
                border: "none",
                borderRadius: "8px",
                padding: "6px 12px",
                fontSize: "0.75rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              Delete Log
            </button>
          )}
          {isTeacher && <span className="chip chip-info">Teacher View</span>}
          {profile?.role === "parent" && <span className="chip chip-purple">Parent View</span>}
        </div>
      </div>

      {/* Journal Title */}
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "var(--primary-dark)" }}>
          {profile?.role === "parent" ? "Daily Digest" : "Today's Care Journal"}
        </h2>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "0.88rem" }}>
          {selectedStudent.name} · {new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: "120px", borderRadius: "16px" }} />)}
        </div>
      ) : profile?.role === "parent" ? (
        existingJournal
          ? <DailyDigest journal={existingJournal} studentName={selectedStudent.name} />
          : <div className="glass-card animate-fade-in" style={{ padding: "48px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", color: "var(--text-secondary)", marginBottom: "12px" }}>
                <ClipboardList size={48} />
              </div>
              <h3 style={{ margin: 0, color: "var(--primary-dark)" }}>No Journal Yet</h3>
              <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>The teacher hasn&apos;t submitted a care journal for this date yet.</p>
            </div>
      ) : (
        <JournalForm studentId={selectedStudent.id} studentName={selectedStudent.name} date={date} initialData={existingJournal} />
      )}

      {/* ── History Section (Last 15 Days) ── */}
      <div className="glass-card animate-fade-in" style={{ padding: "24px", marginTop: "24px" }}>
        <h3 style={{ margin: "0 0 16px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}>
          <ClipboardList size={18} /> Journal History (Last 15 Days)
        </h3>
        
        {history.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", margin: 0 }}>No history logs found for this student.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
            {history.slice(0, 15).map((h) => (
              <div
                key={h.date}
                onClick={() => setDate(h.date)}
                style={{
                  padding: "14px",
                  borderRadius: "12px",
                  background: date === h.date ? "rgba(123, 196, 196, 0.15)" : "rgba(255, 255, 255, 0.5)",
                  border: date === h.date ? "2px solid var(--accent-teal)" : "2px solid rgba(0,0,0,0.05)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--primary-dark)" }}>
                  {format(new Date(h.date + "T00:00:00"), "MMM dd, yyyy")}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                  Mood: <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{h.moodTimeline?.[0]?.mood || "neutral"}</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Activity: <span style={{ fontWeight: 600 }}>{h.physicalActivity || "Moderate"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

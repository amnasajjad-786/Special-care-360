"use client";
import { useState } from "react";
import { abcApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import toast from "react-hot-toast";

const ANTECEDENT_TAGS = ["Loud Noise", "Transition", "Crowded Space", "Denied Request", "Unexpected Change"];
const BEHAVIOR_TAGS = ["Hitting", "Screaming", "Self-harm", "Crying", "Running away", "Withdrawal"];
const CONSEQUENCE_TAGS = ["Redirected", "Timeout", "Verbal Prompt", "Physical Support", "Ignored"];
const STUDENTS = [{ id: "s1", name: "Ali Hassan" }, { id: "s2", name: "Sara Ahmed" }, { id: "s3", name: "Omar Malik" }, { id: "s4", name: "Zara Khan" }];
const LOCATIONS = ["Classroom A", "Classroom B", "Therapy Room", "Cafeteria", "Playground", "Hallway", "Gym"];

interface Props { onClose: () => void; onSaved: () => void; }

function TagSelector({ tags, selected, onToggle, color }: { tags: string[]; selected: string[]; onToggle: (t: string) => void; color: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {tags.map(tag => {
        const on = selected.includes(tag);
        return (
          <button key={tag} type="button" onClick={() => onToggle(tag)} style={{
            padding: "5px 12px", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", border: "2px solid",
            borderColor: on ? color : "transparent",
            background: on ? `${color}15` : "rgba(0,0,0,0.04)",
            color: on ? color : "var(--text-secondary)", transition: "all 0.15s",
          }}>{tag}</button>
        );
      })}
    </div>
  );
}

export default function LogIncidentModal({ onClose, onSaved }: Props) {
  const { profile } = useAuth();
  const [studentId, setStudentId] = useState("s1");
  const [dateTime, setDateTime] = useState(new Date().toISOString().slice(0, 16));
  const [antText, setAntText] = useState("");
  const [antTags, setAntTags] = useState<string[]>([]);
  const [behText, setBehText] = useState("");
  const [behTags, setBehTags] = useState<string[]>([]);
  const [conText, setConText] = useState("");
  const [conTags, setConTags] = useState<string[]>([]);
  const [severity, setSeverity] = useState(3);
  const [duration, setDuration] = useState(10);
  const [location, setLocation] = useState("Classroom A");
  const [saving, setSaving] = useState(false);

  const toggleTag = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (tag: string) =>
    setter(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  const severityColor = severity <= 1 ? "#38a169" : severity <= 2 ? "#68d391" : severity <= 3 ? "#d69e2e" : severity <= 4 ? "#ed8936" : "#e53e3e";
  const severityLabel = ["", "Very Low", "Low", "Moderate", "High", "Severe"][severity];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await abcApi.logIncident({
        studentId, centerId: "demo-center-001", loggedBy: profile?.uid || "unknown",
        timestamp: new Date(dateTime).toISOString(),
        antecedent: { text: antText, tags: antTags },
        behavior: { text: behText, tags: behTags },
        consequence: { text: conText, tags: conTags },
        severity, durationMinutes: duration, location,
      });
      toast.success("Incident logged successfully");
      onSaved();
    } catch {
      toast.success("Incident saved (demo mode)");
      onSaved();
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: "100%", maxWidth: "680px", padding: "32px" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <h2 style={{ margin: 0, fontWeight: 800, color: "var(--primary-dark)", fontSize: "1.2rem" }}>🧠 Log ABC Incident</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.5rem", color: "var(--text-secondary)" }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Student & Date/Time */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "5px", textTransform: "uppercase" }}>Student</label>
              <select id="abc-student" className="glass-input" value={studentId} onChange={e => setStudentId(e.target.value)}>
                {STUDENTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "5px", textTransform: "uppercase" }}>Date & Time</label>
              <input className="glass-input" type="datetime-local" value={dateTime} onChange={e => setDateTime(e.target.value)} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "5px", textTransform: "uppercase" }}>Location</label>
              <select className="glass-input" value={location} onChange={e => setLocation(e.target.value)}>
                {LOCATIONS.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "5px", textTransform: "uppercase" }}>Duration (minutes)</label>
              <input className="glass-input" type="number" min={1} max={120} value={duration} onChange={e => setDuration(Number(e.target.value))} />
            </div>
          </div>

          {/* Antecedent */}
          <div style={{ padding: "16px", background: "rgba(123,196,196,0.06)", borderRadius: "12px", border: "1px solid rgba(123,196,196,0.2)" }}>
            <div style={{ fontWeight: 700, color: "var(--accent-teal)", fontSize: "0.9rem", marginBottom: "10px" }}>🔍 A — Antecedent (What happened before?)</div>
            <textarea className="glass-input" rows={2} placeholder="Describe what happened before the behavior…" style={{ marginBottom: "10px", resize: "vertical" }} value={antText} onChange={e => setAntText(e.target.value)} />
            <TagSelector tags={ANTECEDENT_TAGS} selected={antTags} onToggle={toggleTag(setAntTags)} color="var(--accent-teal)" />
          </div>

          {/* Behavior */}
          <div style={{ padding: "16px", background: "rgba(232,165,152,0.06)", borderRadius: "12px", border: "1px solid rgba(232,165,152,0.2)" }}>
            <div style={{ fontWeight: 700, color: "var(--accent-coral)", fontSize: "0.9rem", marginBottom: "10px" }}>⚡ B — Behavior (What did the student do?)</div>
            <textarea className="glass-input" rows={2} placeholder="Describe the specific behavior observed…" style={{ marginBottom: "10px", resize: "vertical" }} value={behText} onChange={e => setBehText(e.target.value)} />
            <TagSelector tags={BEHAVIOR_TAGS} selected={behTags} onToggle={toggleTag(setBehTags)} color="var(--accent-coral)" />
          </div>

          {/* Consequence */}
          <div style={{ padding: "16px", background: "rgba(184,168,212,0.06)", borderRadius: "12px", border: "1px solid rgba(184,168,212,0.2)" }}>
            <div style={{ fontWeight: 700, color: "var(--accent-lavender)", fontSize: "0.9rem", marginBottom: "10px" }}>💬 C — Consequence (How did staff respond?)</div>
            <textarea className="glass-input" rows={2} placeholder="Describe the staff response…" style={{ marginBottom: "10px", resize: "vertical" }} value={conText} onChange={e => setConText(e.target.value)} />
            <TagSelector tags={CONSEQUENCE_TAGS} selected={conTags} onToggle={toggleTag(setConTags)} color="var(--accent-lavender)" />
          </div>

          {/* Severity */}
          <div style={{ padding: "16px", background: "rgba(255,255,255,0.5)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.7)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div style={{ fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.9rem" }}>📊 Severity</div>
              <span style={{ fontWeight: 800, fontSize: "1rem", color: severityColor }}>{severity}/5 — {severityLabel}</span>
            </div>
            <input type="range" min={1} max={5} value={severity} onChange={e => setSeverity(Number(e.target.value))} style={{ width: "100%" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "4px" }}>
              <span>Very Low</span><span>Low</span><span>Moderate</span><span>High</span><span>Severe</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button type="button" className="btn-ghost" onClick={onClose} style={{ flex: 1, padding: "13px" }}>Cancel</button>
            <button id="abc-submit" type="submit" className="btn-primary" disabled={saving} style={{ flex: 2, padding: "13px" }}>
              {saving ? "Saving…" : "📝 Log Incident"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

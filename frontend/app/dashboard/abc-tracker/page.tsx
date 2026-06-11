"use client";
import { useEffect, useState } from "react";
import { abcApi } from "@/lib/api";
import { ABCIncident, PatternAnalysis, HeatmapCell } from "@/types";
import HeatmapGrid from "@/components/abc-tracker/HeatmapGrid";
import TrendChart from "@/components/abc-tracker/TrendChart";
import TriggerBarChart from "@/components/abc-tracker/TriggerBarChart";
import PatternTable from "@/components/abc-tracker/PatternTable";
import LogIncidentModal from "@/components/abc-tracker/LogIncidentModal";
import { useAuth } from "@/lib/auth-context";

const MOCK_INCIDENTS: ABCIncident[] = [
  { id: "i1", studentId: "s1", centerId: "demo-center-001", loggedBy: "t1", timestamp: "2026-04-22T09:00:00Z", antecedent: { text: "Loud announcement", tags: ["Loud Noise"] }, behavior: { text: "Covered ears, rocking", tags: ["Screaming"] }, consequence: { text: "Moved to quiet corner", tags: ["Redirected"] }, severity: 3, durationMinutes: 8, location: "Classroom A" },
  { id: "i2", studentId: "s1", centerId: "demo-center-001", loggedBy: "t1", timestamp: "2026-04-21T13:30:00Z", antecedent: { text: "Activity changed", tags: ["Transition", "Unexpected Change"] }, behavior: { text: "Threw materials", tags: ["Hitting", "Screaming"] }, consequence: { text: "Verbal prompt", tags: ["Verbal Prompt"] }, severity: 4, durationMinutes: 15, location: "Classroom A" },
  { id: "i3", studentId: "s1", centerId: "demo-center-001", loggedBy: "t1", timestamp: "2026-04-20T10:00:00Z", antecedent: { text: "Request denied", tags: ["Denied Request"] }, behavior: { text: "Crying", tags: ["Crying", "Withdrawal"] }, consequence: { text: "Ignored then redirected", tags: ["Ignored", "Redirected"] }, severity: 2, durationMinutes: 5, location: "Therapy Room" },
  { id: "i4", studentId: "s1", centerId: "demo-center-001", loggedBy: "t1", timestamp: "2026-04-19T14:00:00Z", antecedent: { text: "Crowded lunch hall", tags: ["Crowded Space"] }, behavior: { text: "Self-stimulatory", tags: ["Self-harm"] }, consequence: { text: "Physical support", tags: ["Physical Support"] }, severity: 4, durationMinutes: 12, location: "Cafeteria" },
  { id: "i5", studentId: "s1", centerId: "demo-center-001", loggedBy: "t1", timestamp: "2026-04-18T09:30:00Z", antecedent: { text: "Loud music", tags: ["Loud Noise"] }, behavior: { text: "Running out", tags: ["Running away"] }, consequence: { text: "Teacher followed", tags: ["Physical Support"] }, severity: 3, durationMinutes: 6, location: "Therapy Room" },
];

const MOCK_PATTERNS: PatternAnalysis = {
  topAntecedents: [{ tag: "Loud Noise", count: 2 }, { tag: "Transition", count: 1 }, { tag: "Denied Request", count: 1 }, { tag: "Crowded Space", count: 1 }],
  topBehaviors: [{ tag: "Screaming", count: 2 }, { tag: "Hitting", count: 1 }, { tag: "Crying", count: 1 }, { tag: "Self-harm", count: 1 }],
  topConsequences: [{ tag: "Redirected", count: 2 }, { tag: "Physical Support", count: 2 }, { tag: "Verbal Prompt", count: 1 }],
  peakHours: [{ hour: 9, count: 2 }, { hour: 13, count: 2 }, { hour: 14, count: 1 }],
  avgSeverity: 3.2,
  totalIncidents: 5,
  insights: [
    "Most common trigger: 'Loud Noise' (2 incidents)",
    "Most frequent behavior: 'Screaming' observed 2 times",
    "Peak incident time: 9:00 AM",
    "Average severity is moderate (3.2/5) — consider sensory accommodations",
  ],
};

const MOCK_HEATMAP: HeatmapCell[] = [
  { day: "Mon", severity: 3, count: 1 }, { day: "Mon", severity: 4, count: 1 },
  { day: "Tue", severity: 2, count: 1 }, { day: "Wed", severity: 4, count: 1 },
  { day: "Thu", severity: 3, count: 1 }, { day: "Fri", severity: 1, count: 0 },
];

const STUDENTS = [{ id: "s1", name: "Ali Hassan" }, { id: "s2", name: "Sara Ahmed" }, { id: "s3", name: "Omar Malik" }];

export default function ABCTrackerPage() {
  const { profile } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState(STUDENTS[0]);
  const [incidents, setIncidents] = useState<ABCIncident[]>([]);
  const [patterns, setPatterns] = useState<PatternAnalysis | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const canWrite = profile?.role ? ["teacher", "therapist", "admin"].includes(profile.role) : false;

  const loadData = async (studentId: string) => {
    setLoading(true);
    try {
      const [incRes, patRes, heatRes] = await Promise.all([
        abcApi.listIncidents(studentId),
        abcApi.getPatterns(studentId),
        abcApi.getHeatmap(studentId),
      ]);
      setIncidents(incRes.data);
      setPatterns(patRes.data);
      setHeatmap(heatRes.data);
    } catch {
      setIncidents(MOCK_INCIDENTS);
      setPatterns(MOCK_PATTERNS);
      setHeatmap(MOCK_HEATMAP);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(selectedStudent.id); }, [selectedStudent.id]);

  const handleSaved = () => { setShowModal(false); loadData(selectedStudent.id); };

  return (
    <div>
      {/* Header */}
      <div className="glass-card" style={{ padding: "16px 24px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase" }}>Student</label>
          <select id="abc-student-select" className="glass-input" style={{ minWidth: "180px" }}
            value={selectedStudent.id}
            onChange={e => setSelectedStudent(STUDENTS.find(s => s.id === e.target.value) || STUDENTS[0])}>
            {STUDENTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }} />
        {canWrite && (
          <button id="abc-log-btn" className="btn-primary" onClick={() => setShowModal(true)} style={{ padding: "10px 20px" }}>
            + Log Incident
          </button>
        )}
      </div>

      {/* Stats row */}
      {patterns && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
          {[
            { label: "Total Incidents", value: patterns.totalIncidents, icon: "📊", color: "var(--accent-purple-soft)" },
            { label: "Avg Severity", value: `${patterns.avgSeverity}/5`, icon: "📈", color: patterns.avgSeverity >= 3.5 ? "var(--danger)" : "var(--warning)" },
            { label: "Top Trigger", value: patterns.topAntecedents[0]?.tag || "—", icon: "🔍", color: "var(--accent-coral)" },
            { label: "Top Behavior", value: patterns.topBehaviors[0]?.tag || "—", icon: "⚡", color: "var(--accent-teal)" },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="glass-card" style={{ padding: "18px" }}>
              <div style={{ fontSize: "1.4rem", marginBottom: "6px" }}>{icon}</div>
              <div style={{ fontWeight: 800, fontSize: "1.15rem", color, marginBottom: "2px" }}>{value}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
        <HeatmapGrid data={loading ? [] : heatmap} />
        {/* AI Insights */}
        <div className="glass-card" style={{ padding: "20px" }}>
          <h3 style={{ margin: "0 0 14px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem" }}>🤖 AI Behavioral Insights</h3>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: "36px", borderRadius: "8px", marginBottom: "8px" }} />)
          ) : patterns?.insights.map((insight, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", padding: "10px", borderRadius: "10px", background: i % 2 === 0 ? "rgba(123,196,196,0.06)" : "rgba(184,168,212,0.06)", marginBottom: "8px", border: "1px solid rgba(255,255,255,0.5)" }}>
              <span style={{ fontSize: "1rem" }}>💡</span>
              <span style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.5 }}>{insight}</span>
            </div>
          ))}
          {patterns && (
            <div style={{ marginTop: "12px", padding: "12px", borderRadius: "10px", background: "rgba(61,79,107,0.06)", border: "1px solid rgba(61,79,107,0.1)" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "6px" }}>Peak Hours</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {patterns.peakHours.map(h => {
                  const period = h.hour < 12 ? "AM" : "PM";
                  const hr = h.hour % 12 || 12;
                  return <span key={h.hour} className="chip chip-info">{hr}:00 {period} ({h.count})</span>;
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
        <TrendChart incidents={loading ? [] : incidents} />
        <TriggerBarChart patterns={loading ? null : patterns} />
      </div>

      <PatternTable patterns={loading ? null : patterns} />

      {/* Recent incidents table */}
      <div className="glass-card" style={{ padding: "20px", marginTop: "20px" }}>
        <h3 style={{ margin: "0 0 16px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem" }}>📝 Recent Incidents</h3>
        {loading ? (
          <div className="skeleton" style={{ height: "150px", borderRadius: "8px" }} />
        ) : incidents.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "24px 0" }}>No incidents recorded</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Date/Time</th><th>Antecedent</th><th>Behavior</th><th>Consequence</th><th>Severity</th><th>Duration</th><th>Location</th></tr></thead>
              <tbody>
                {incidents.slice(0, 10).map(inc => {
                  const sevColors = ["", "#38a169", "#68d391", "#d69e2e", "#ed8936", "#e53e3e"];
                  return (
                    <tr key={inc.id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: "0.82rem" }}>{new Date(inc.timestamp).toLocaleDateString()} {new Date(inc.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                      <td>
                        <div style={{ fontSize: "0.82rem" }}>{inc.antecedent.text || "—"}</div>
                        <div style={{ display: "flex", gap: "4px", marginTop: "3px", flexWrap: "wrap" }}>
                          {inc.antecedent.tags.map(t => <span key={t} className="chip chip-info" style={{ fontSize: "0.65rem", padding: "1px 6px" }}>{t}</span>)}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: "0.82rem" }}>{inc.behavior.text || "—"}</div>
                        <div style={{ display: "flex", gap: "4px", marginTop: "3px", flexWrap: "wrap" }}>
                          {inc.behavior.tags.map(t => <span key={t} className="chip chip-danger" style={{ fontSize: "0.65rem", padding: "1px 6px" }}>{t}</span>)}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                          {inc.consequence.tags.map(t => <span key={t} className="chip chip-purple" style={{ fontSize: "0.65rem", padding: "1px 6px" }}>{t}</span>)}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 800, fontSize: "1rem", color: sevColors[inc.severity] }}>{inc.severity}</span>
                        <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>/5</span>
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>{inc.durationMinutes}m</td>
                      <td style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{inc.location}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && <LogIncidentModal onClose={() => setShowModal(false)} onSaved={handleSaved} />}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { abcDb, studentsDb } from "@/lib/firestore-api";
import { ABCIncident, PatternAnalysis, HeatmapCell } from "@/types";
import HeatmapGrid from "@/components/abc-tracker/HeatmapGrid";
import TrendChart from "@/components/abc-tracker/TrendChart";
import TriggerBarChart from "@/components/abc-tracker/TriggerBarChart";
import PatternTable from "@/components/abc-tracker/PatternTable";
import LogIncidentModal from "@/components/abc-tracker/LogIncidentModal";
import { useAuth } from "@/lib/auth-context";

import toast from "react-hot-toast";
import ReactMarkdown from "react-markdown";

export default function ABCTrackerPage() {
  const { profile } = useAuth();
  const [students, setStudents] = useState<{ id: string; name: string; parentId?: string }[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string } | null>(null);
  const [incidents, setIncidents] = useState<ABCIncident[]>([]);
  const [patterns, setPatterns] = useState<PatternAnalysis | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // AI Insights State
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [btnHover, setBtnHover] = useState(false);

  const canWrite = profile?.role ? ["teacher", "therapist", "admin"].includes(profile.role) : false;

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

  const loadData = async (studentId: string) => {
    setLoading(true);
    try {
      const [incidents, patterns, heatmap] = await Promise.all([
        abcDb.listIncidents(studentId),
        abcDb.getPatterns(studentId),
        abcDb.getHeatmap(studentId),
      ]);
      setIncidents(incidents as unknown as ABCIncident[]);
      setPatterns(patterns as unknown as PatternAnalysis);
      setHeatmap(heatmap as unknown as HeatmapCell[]);
    } catch (err) {
      console.error("Failed to load ABC data:", err);
      toast.error("Failed to load behavioral data");
      setIncidents([]);
      setPatterns(null);
      setHeatmap([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedStudent) {
      loadData(selectedStudent.id);
    }
  }, [selectedStudent?.id]);

  const handleSaved = () => {
    if (selectedStudent) {
      setShowModal(false);
      loadData(selectedStudent.id);
    }
  };

  const generateAiReport = async () => {
    if (!selectedStudent) return;
    setAiLoading(true);
    setShowAiModal(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/ai-insights/abc/${selectedStudent.id}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to fetch AI insights");
      }
      const data = await res.json();
      setAiReport(data.report);
    } catch (err: any) {
      console.error("AI Gen Error:", err);
      toast.error(err.message || "AI generation failed. Make sure Gemini API Key is set.");
      setShowAiModal(false);
    } finally {
      setAiLoading(false);
    }
  };

  if (!selectedStudent) {
    return (
      <div className="glass-card animate-fade-in" style={{ padding: "40px", textAlign: "center" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading student profile...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="glass-card" style={{ padding: "16px 24px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase" }}>Student</label>
          {students.length > 1 ? (
            <select id="abc-student-select" className="glass-input" style={{ minWidth: "180px" }}
              value={selectedStudent.id}
              onChange={e => setSelectedStudent(students.find(s => s.id === e.target.value) || students[0])}>
              {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : (
            <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.4)", borderRadius: "10px", fontWeight: 600, fontSize: "0.9rem", color: "var(--primary-dark)", border: "1px solid rgba(255,255,255,0.5)" }}>
              {selectedStudent.name}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        {canWrite && (
          <div style={{ display: "flex", gap: "12px" }}>
            <button 
              className="btn-primary" 
              onClick={generateAiReport}
              onMouseEnter={() => setBtnHover(true)}
              onMouseLeave={() => setBtnHover(false)}
              style={{ 
                padding: "10px 20px", 
                background: btnHover 
                  ? "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)" 
                  : "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)", 
                boxShadow: btnHover
                  ? "0 6px 20px rgba(99, 102, 241, 0.5)"
                  : "0 4px 14px rgba(99, 102, 241, 0.3)",
                transform: btnHover ? "translateY(-1px)" : "none",
                transition: "all 0.2s ease",
                border: "none",
              }}
            >
              🪄 Generate Deep AI Report
            </button>
            <button id="abc-log-btn" className="btn-primary" onClick={() => setShowModal(true)} style={{ padding: "10px 20px" }}>
              + Log Incident
            </button>
          </div>
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

      {/* AI Report Modal */}
      {showAiModal && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(30,40,60,0.5)", backdropFilter: "blur(4px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div className="glass-card animate-slide-up" style={{ width: "90%", maxWidth: "800px", maxHeight: "85vh", display: "flex", flexDirection: "column", background: "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(240,245,255,0.95))" }}>
            <div style={{ padding: "24px 30px", borderBottom: "1px solid rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, color: "var(--primary-dark)", display: "flex", alignItems: "center", gap: "10px" }}>
                <span>🤖</span> Deep Behavioral Analysis
              </h2>
              <button onClick={() => setShowAiModal(false)} style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text-secondary)" }}>&times;</button>
            </div>
            <div style={{ padding: "30px", overflowY: "auto", flex: 1 }}>
              {aiLoading ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "300px", gap: "20px" }}>
                  <div className="spinner" style={{ width: "48px", height: "48px", border: "5px solid rgba(123,196,196,0.3)", borderTopColor: "var(--accent-teal)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  <p style={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "1.1rem" }}>Analyzing {selectedStudent?.name}&apos;s behavioral patterns...</p>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : (
                <div className="markdown-content" style={{ lineHeight: 1.7, color: "var(--text-primary)", fontSize: "0.95rem" }}>
                  {/* @ts-ignore - ReactMarkdown types can sometimes clash with React 19 */}
                  <ReactMarkdown>{aiReport || "No report generated."}</ReactMarkdown>
                  <style>{`
                    .markdown-content h3 {
                      font-size: 1.15rem;
                      font-weight: 700;
                      color: var(--primary-dark);
                      margin-top: 22px;
                      margin-bottom: 8px;
                      border-bottom: 1px solid rgba(61, 79, 107, 0.15);
                      padding-bottom: 6px;
                    }
                    .markdown-content p {
                      margin-bottom: 12px;
                    }
                    .markdown-content ul, .markdown-content ol {
                      padding-left: 20px;
                      margin-bottom: 16px;
                      list-style-position: outside;
                    }
                    .markdown-content ul {
                      list-style-type: disc;
                    }
                    .markdown-content ol {
                      list-style-type: decimal;
                    }
                    .markdown-content li {
                      margin-bottom: 8px;
                    }
                    .markdown-content strong {
                      font-weight: 700;
                      color: var(--primary-dark);
                    }
                  `}</style>
                </div>
              )}
            </div>
            {/* Modal Footer */}
            <div style={{ padding: "16px 30px", borderTop: "1px solid rgba(61, 79, 107, 0.08)", display: "flex", justifyContent: "flex-end", gap: "12px", background: "rgba(61, 79, 107, 0.02)" }}>
              <button className="btn-ghost" onClick={() => setShowAiModal(false)}>Close</button>
              {!aiLoading && aiReport && (
                <button 
                  className="btn-primary" 
                  onClick={async () => {
                    try {
                      // Fetch current Care Plan to avoid overwriting existing goals
                      const existing = await studentsDb.getCarePlan(selectedStudent.id);
                      await studentsDb.updateCarePlan(selectedStudent.id, { 
                        ...existing,
                        lastAiReport: { 
                          report: aiReport, 
                          timestamp: new Date().toISOString() 
                        } 
                      });
                      toast.success("AI Report saved to Care Plan!");
                    } catch (err) {
                      console.error("Save error:", err);
                      toast.error("Failed to save report to Care Plan.");
                    }
                  }}
                  style={{ padding: "10px 20px" }}
                >
                  💾 Save to Care Plan
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

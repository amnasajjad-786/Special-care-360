"use client";
import { useEffect, useMemo, useState } from "react";
import { abcDb, studentsDb, scopeOf, computePatterns, computeHeatmap, timeOfDayOf, SENSORY_FACTORS, TIME_OF_DAY } from "@/lib/firestore-api";
import { ABCIncident, PatternAnalysis, HeatmapCell } from "@/types";
import HeatmapGrid from "@/components/abc-tracker/HeatmapGrid";
import TrendChart from "@/components/abc-tracker/TrendChart";
import TriggerBarChart from "@/components/abc-tracker/TriggerBarChart";
import PatternTable from "@/components/abc-tracker/PatternTable";
import LogIncidentModal from "@/components/abc-tracker/LogIncidentModal";
import { useAuth } from "@/lib/auth-context";

import toast from "react-hot-toast";
import ReactMarkdown from "react-markdown";
import { Sparkles, BarChart2, TrendingUp, Search, Zap, BrainCircuit, Lightbulb, ClipboardList, Save, X, Filter, MapPin, Ear, Clock } from "lucide-react";

const NO_FILTERS = { from: "", to: "", timeOfDay: "", location: "", sensory: "" };

export default function ABCTrackerPage() {
  const { profile, getIdToken } = useAuth();
  const [students, setStudents] = useState<{ id: string; name: string; parentId?: string }[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string } | null>(null);
  const [incidents, setIncidents] = useState<ABCIncident[]>([]);
  // Filters belong to the student they were set for, so switching child
  // starts from a clean slate without resetting state inside an effect.
  const [filterState, setFilterState] = useState<{ studentId?: string; values: typeof NO_FILTERS }>({ values: NO_FILTERS });
  const filters = filterState.studentId === selectedStudent?.id ? filterState.values : NO_FILTERS;
  const setFilters = (next: typeof NO_FILTERS | ((current: typeof NO_FILTERS) => typeof NO_FILTERS)) =>
    setFilterState({ studentId: selectedStudent?.id, values: typeof next === "function" ? next(filters) : next });
  const filtersActive = Object.values(filters).some(Boolean);
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
        const allowed = await studentsDb.list(scopeOf(profile));
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
    const scope = scopeOf(profile);
    setLoading(true);
    try {
      // One scoped fetch. Patterns, heatmap and filters are derived from it
      // in memory, so filtering never widens what the rules allow.
      const loaded = await abcDb.listIncidents(studentId, scope, 200);
      setIncidents(loaded as unknown as ABCIncident[]);
    } catch (err) {
      console.error("Failed to load ABC data:", err);
      toast.error("Failed to load behavioral data");
      setIncidents([]);
    }
    setLoading(false);
  };

  const filtered = useMemo(() => incidents.filter((inc) => {
    const at = new Date(inc.timestamp);
    if (filters.from && !(at >= new Date(`${filters.from}T00:00:00`))) return false;
    if (filters.to && !(at <= new Date(`${filters.to}T23:59:59.999`))) return false;
    if (filters.timeOfDay && timeOfDayOf(inc.timestamp) !== filters.timeOfDay) return false;
    if (filters.location && inc.location !== filters.location) return false;
    if (filters.sensory && !(inc.sensoryFactors ?? []).includes(filters.sensory)) return false;
    return true;
  }), [incidents, filters]);
  const patterns = useMemo(
    () => (filtered.length ? computePatterns(filtered as unknown as Record<string, unknown>[]) as PatternAnalysis : null),
    [filtered]);
  const heatmap = useMemo(() => computeHeatmap(filtered as unknown as Record<string, unknown>[]) as HeatmapCell[], [filtered]);
  const locations = useMemo(() => [...new Set(incidents.map((i) => i.location).filter(Boolean))].sort(), [incidents]);

  const selectedStudentId = selectedStudent?.id;
  useEffect(() => {
    if (selectedStudentId) {
      loadData(selectedStudentId);
    }
    // loadData is stable for a given profile; re-running on its identity would
    // refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId]);

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
      const token = await getIdToken();
      if (!token) throw new Error("You must be signed in to generate insights.");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/ai-insights/abc/${selectedStudent.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to fetch AI insights");
      }
      const data = await res.json();
      setAiReport(data.report);
    } catch (err) {
      console.error("AI Gen Error:", err);
      toast.error(err instanceof Error ? err.message : "AI generation failed. Check that the Gemini API key is set.");
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
              disabled={incidents.length < 5 || loading}
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
                opacity: incidents.length < 5 || loading ? 0.55 : 1,
                cursor: incidents.length < 5 || loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <Sparkles size={16} /> {incidents.length < 5 ? `AI report needs ${5 - incidents.length} more observation${5 - incidents.length === 1 ? "" : "s"}` : "Generate Deep AI Report"}
            </button>
            <button id="abc-log-btn" className="btn-primary" onClick={() => setShowModal(true)} style={{ padding: "10px 20px" }}>
              + Log Incident
            </button>
          </div>
        )}
      </div>

      {incidents.length < 5 && !loading && (
        <div className="glass-card" role="status" style={{ padding: "14px 18px", marginBottom: 20, color: "var(--text-secondary)" }}>
          Pattern summaries and AI analysis appear after 5 incidents, as required by the clinical reporting threshold. {5 - incidents.length} more observation{5 - incidents.length === 1 ? " is" : "s are"} needed.
        </div>
      )}

      {/* Filters (WBS 3.3.3): time, location and sensory factor */}
      {incidents.length > 0 && (
        <div className="glass-card" style={{ padding: "14px 18px", marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.85rem", alignSelf: "center" }}>
            <Filter size={16} /> Filter incidents
          </div>
          <FilterField label="From">
            <input type="date" className="glass-input" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          </FilterField>
          <FilterField label="To">
            <input type="date" className="glass-input" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          </FilterField>
          <FilterField label="Time of day">
            <select className="glass-input" value={filters.timeOfDay} onChange={(e) => setFilters((f) => ({ ...f, timeOfDay: e.target.value }))}>
              <option value="">Any time</option>
              {TIME_OF_DAY.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </FilterField>
          <FilterField label="Location">
            <select className="glass-input" value={filters.location} onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}>
              <option value="">Any location</option>
              {locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </FilterField>
          <FilterField label="Sensory factor">
            <select className="glass-input" value={filters.sensory} onChange={(e) => setFilters((f) => ({ ...f, sensory: e.target.value }))}>
              <option value="">Any</option>
              {SENSORY_FACTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </FilterField>
          {filtersActive && (
            <button className="btn-ghost" style={{ padding: "8px 14px" }} onClick={() => setFilters(NO_FILTERS)}>
              Clear filters
            </button>
          )}
          <div style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--text-secondary)", alignSelf: "center" }} role="status">
            Showing {filtered.length} of {incidents.length} incidents
          </div>
        </div>
      )}

      {filtersActive && filtered.length === 0 && (
        <div className="glass-card" role="status" style={{ padding: "14px 18px", marginBottom: 20, color: "var(--text-secondary)" }}>
          No incidents match these filters.
        </div>
      )}

      {/* Stats row */}
      {patterns && incidents.length >= 5 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
          {[
            { label: "Total Incidents", value: patterns.totalIncidents, icon: <BarChart2 size={22} style={{ color: "var(--accent-purple)" }} />, color: "var(--accent-purple-soft)" },
            { label: "Avg Severity", value: `${patterns.avgSeverity}/5`, icon: <TrendingUp size={22} style={{ color: patterns.avgSeverity >= 3.5 ? "var(--danger)" : "var(--warning)" }} />, color: patterns.avgSeverity >= 3.5 ? "var(--danger)" : "var(--warning)" },
            { label: "Top Trigger", value: patterns.topAntecedents[0]?.tag || "—", icon: <Search size={22} style={{ color: "var(--accent-coral)" }} />, color: "var(--accent-coral)" },
            { label: "Top Behavior", value: patterns.topBehaviors[0]?.tag || "—", icon: <Zap size={22} style={{ color: "var(--accent-teal)" }} />, color: "var(--accent-teal)" },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="glass-card" style={{ padding: "18px" }}>
              <div style={{ marginBottom: "6px", display: "flex", alignItems: "center" }}>{icon}</div>
              <div style={{ fontWeight: 800, fontSize: "1.15rem", color, marginBottom: "2px" }}>{value}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main grid */}
      {incidents.length >= 5 && <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
        <HeatmapGrid data={loading ? [] : heatmap} />
        {/* AI Insights */}
        <div className="glass-card" style={{ padding: "20px" }}>
          <h3 style={{ margin: "0 0 14px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "8px" }}>
            <BrainCircuit size={18} /> AI Behavioral Insights
          </h3>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: "36px", borderRadius: "8px", marginBottom: "8px" }} />)
          ) : patterns?.insights.map((insight, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", padding: "10px", borderRadius: "10px", background: i % 2 === 0 ? "rgba(123,196,196,0.06)" : "rgba(184,168,212,0.06)", marginBottom: "8px", border: "1px solid rgba(255,255,255,0.5)", alignItems: "flex-start" }}>
              <Lightbulb size={16} style={{ color: "#dd6b20", flexShrink: 0, marginTop: "2px" }} />
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
        <TrendChart incidents={loading ? [] : filtered} />
        <TriggerBarChart patterns={loading ? null : patterns} />
      </div>
      </>}

      {incidents.length >= 5 && <PatternTable patterns={loading ? null : patterns} />}

      {incidents.length >= 5 && patterns && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px", marginTop: "20px" }}>
          <Breakdown title="By time of day" icon={<Clock size={16} />} rows={patterns.byTimeOfDay ?? []} total={filtered.length} />
          <Breakdown title="By location" icon={<MapPin size={16} />} rows={patterns.byLocation ?? []} total={filtered.length} />
          <Breakdown title="By sensory factor" icon={<Ear size={16} />} rows={patterns.bySensoryFactor ?? []} total={filtered.length} />
        </div>
      )}

      {/* Recent incidents table */}
      <div className="glass-card" style={{ padding: "20px", marginTop: "20px" }}>
        <h3 style={{ margin: "0 0 16px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "8px" }}>
          <ClipboardList size={18} /> Recent Incidents
        </h3>
        {loading ? (
          <div className="skeleton" style={{ height: "150px", borderRadius: "8px" }} />
        ) : filtered.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "24px 0" }}>{incidents.length === 0 ? "No incidents recorded" : "No incidents match these filters"}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Date/Time</th><th>Antecedent</th><th>Behavior</th><th>Consequence</th><th>Severity</th><th>Duration</th><th>Location</th><th>Sensory</th></tr></thead>
              <tbody>
                {filtered.map(inc => {
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
                      <td style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{(inc.sensoryFactors ?? []).join(", ") || "—"}</td>
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
                <BrainCircuit size={22} /> Deep Behavioral Analysis
              </h2>
              <button onClick={() => setShowAiModal(false)} style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text-secondary)" }}><X size={20} /></button>
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
                      // Merge only the report. Re-sending the goals would trip the
                      // care-plan version check and could overwrite a concurrent edit.
                      await studentsDb.updateCarePlan(selectedStudent.id, {
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
                  style={{ padding: "10px 20px", display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <Save size={16} /> Save to Care Plan
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", minWidth: 140 }}>
      {label}
      {children}
    </label>
  );
}

function Breakdown({ title, icon, rows, total }: { title: string; icon: React.ReactNode; rows: { tag: string; count: number }[]; total: number }) {
  return (
    <div className="glass-card" style={{ padding: "18px" }}>
      <h3 style={{ margin: "0 0 12px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 8 }}>{icon} {title}</h3>
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>None recorded for the incidents shown.</p>
      ) : rows.map((row) => (
        <div key={row.tag} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: 3 }}>
            <span>{row.tag}</span><strong>{row.count}</strong>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: "rgba(61,79,107,0.08)" }}>
            <div style={{ width: `${Math.round((row.count / Math.max(total, 1)) * 100)}%`, height: "100%", borderRadius: 999, background: "var(--accent-teal)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

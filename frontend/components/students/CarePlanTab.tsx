"use client";
import { useEffect, useState } from "react";
import { CarePlan, IEPGoal } from "@/types";
import toast from "react-hot-toast";
import { Target, Save, BrainCircuit, CheckCircle2, Hourglass, Sparkles, Link2, Check, RefreshCw } from "lucide-react";
import { milestoneObservationsDb, studentsDb, type MilestoneObservationDoc } from "@/lib/firestore-api";
import GoalProgressChart from "./GoalProgressChart";
import { useAuth } from "@/lib/auth-context";
import ReactMarkdown from "react-markdown";

const STATUS_OPTIONS = ["In Progress", "Mastered", "Regressed"] as const;
const STATUS_STYLES: Record<string, string> = {
  "In Progress": "chip-info",
  Mastered: "chip-success",
  Regressed: "chip-danger",
};

interface Props { studentId: string; carePlan: CarePlan; canEdit: boolean; onChange?: (data: CarePlan) => void; }

export default function CarePlanTab({ studentId, carePlan: initial, canEdit, onChange }: Props) {
  const { profile, getIdToken } = useAuth();
  const isTherapist = profile?.role === "therapist";
  const [goals, setGoals] = useState<IEPGoal[]>((initial?.goals || []).filter(goal => goal.status !== "Achieved"));
  const [version, setVersion] = useState(initial?.version ?? 0);
  const [observations, setObservations] = useState<MilestoneObservationDoc[] | null>(null);
  const [observationError, setObservationError] = useState(false);
  const centerId = profile?.centerId;

  useEffect(() => {
    if (!centerId) return;
    let cancelled = false;
    milestoneObservationsDb.listForStudent(studentId, centerId)
      .then((rows) => { if (!cancelled) { setObservations(rows); setObservationError(false); } })
      .catch((err) => { console.error("[care plan] progress history failed:", err); if (!cancelled) setObservationError(true); });
    return () => { cancelled = true; };
  }, [studentId, centerId]);

  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: "", status: "In Progress" as IEPGoal["status"], progressPercent: 0 });

  // AI IEP Generation state
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<IEPGoal[]>([]);
  const [aiSummary, setAiSummary] = useState<string>("");

  const handleGenerateAiIEP = async () => {
    setGeneratingAi(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("You must be logged in as therapist.");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/ai-insights/iep/${studentId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to generate AI IEP goals");
      }

      const data = await res.json();
      setAiSuggestions(data.goals || []);
      setAiSummary(data.summary || "");
      toast.success(`Generated ${data.goals?.length || 0} AI goals with Correlation`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Error generating IEP");
    } finally {
      setGeneratingAi(false);
    }
  };

  const adoptAiGoal = (goalToAdopt: IEPGoal) => {
    setGoals(prev => [...prev, goalToAdopt]);
    setAiSuggestions(prev => prev.filter(g => g.id !== goalToAdopt.id));
    toast.success("Goal added to Care Plan");
  };

  const save = async () => {
    setSaving(true);
    try {
      const savedVersion = await studentsDb.updateCarePlan(studentId, { goals, expectedVersion: version });
      setVersion(savedVersion);
      onChange?.({ ...initial, goals, version: savedVersion });
      toast.success("Care plan saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Save failed"); }
    finally { setSaving(false); }
  };

  const addGoal = () => {
    if (!newGoal.title) return;
    const goal: IEPGoal = { id: Date.now().toString(), ...newGoal };
    setGoals(g => [...g, goal]);
    setNewGoal({ title: "", status: "In Progress", progressPercent: 0 });
    setShowAdd(false);
  };

  const updateGoal = (id: string, key: keyof IEPGoal, val: string | number) =>
    setGoals(g => g.map(goal => goal.id === id ? { ...goal, [key]: val } : goal));

  const removeGoal = (id: string) => setGoals(g => g.filter(goal => goal.id !== id));

  const progressColors: Record<string, string> = { "In Progress": "var(--accent-teal)", Mastered: "var(--success)", Regressed: "var(--danger)" };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
        <div>
          <h3 style={{ margin: 0, fontWeight: 700, color: "var(--primary-dark)", fontSize: "1.05rem" }}>
            Active Care Plan Goals (IEP)
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
            Current Finalized &amp; Ongoing Goals ({goals.length} active)
          </p>
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="btn-ghost"
              onClick={handleGenerateAiIEP}
              disabled={generatingAi}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                fontSize: "0.85rem",
                color: "var(--accent-purple)",
                borderColor: "var(--accent-purple)",
              }}
            >
              {generatingAi ? <RefreshCw size={15} className="spin" /> : <Sparkles size={15} />}
              {generatingAi ? "Correlating & Generating..." : "Generate AI IEP (Correlation)"}
            </button>
            <button className="btn-primary" onClick={() => setShowAdd(true)} style={{ padding: "8px 18px", fontSize: "0.85rem" }}>
              + Add Goal
            </button>
          </div>
        )}
      </div>

      {observationError ? (
        <div className="glass-card" role="alert" style={{ padding: "14px 18px", color: "var(--danger)", fontSize: "0.85rem" }}>
          Progress history could not be loaded. Reload the page to try again.
        </div>
      ) : observations === null ? (
        <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
      ) : (
        <GoalProgressChart observations={observations} goals={[...(initial?.goals ?? []), ...(initial?.achievedGoals ?? [])]} />
      )}

      {/* AI Suggested Goals Section with Correlation Analytics */}
      {aiSuggestions.length > 0 && (
        <div className="glass-card animate-slide-down" style={{ padding: "20px", border: "2px dashed var(--accent-purple)", background: "rgba(124, 58, 237, 0.03)", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Sparkles size={18} style={{ color: "var(--accent-purple)" }} />
              <h4 style={{ margin: 0, fontWeight: 700, color: "var(--accent-purple)", fontSize: "0.95rem" }}>
                AI IEP Suggestions with Tri-Pillar Correlation
              </h4>
            </div>
            <button className="btn-ghost" onClick={() => setAiSuggestions([])} style={{ fontSize: "0.75rem", padding: "4px 8px" }}>
              Dismiss
            </button>
          </div>

          {aiSummary && (
            <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "14px", fontStyle: "italic" }}>
              &ldquo;{aiSummary}&rdquo;
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {aiSuggestions.map((sug) => (
              <div key={sug.id} style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: "8px", padding: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                  <div>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--accent-purple)", letterSpacing: "0.5px" }}>
                      {sug.goalArea || "Clinical Development"}
                    </span>
                    <h5 style={{ margin: "3px 0 6px", fontSize: "0.92rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      {sug.title}
                    </h5>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => adoptAiGoal(sug)}
                    style={{ fontSize: "0.78rem", padding: "5px 12px", display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}
                  >
                    <Check size={14} /> Adopt Goal
                  </button>
                </div>

                {/* Correlation Metrics Badge */}
                {sug.correlation && (
                  <div style={{
                    marginTop: "8px",
                    padding: "8px 12px",
                    background: "rgba(124, 58, 237, 0.06)",
                    borderRadius: "6px",
                    borderLeft: "3px solid var(--accent-purple)",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "10px",
                    fontSize: "0.78rem"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", fontWeight: 700, color: "var(--accent-purple)" }}>
                      <Link2 size={13} />
                      <span>{sug.correlation.correlatedPillar} Correlation:</span>
                    </div>
                    <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                      {sug.correlation.factor}
                    </span>
                    <span className="chip" style={{ background: "#ede9fe", color: "#6d28d9", fontSize: "0.72rem", padding: "2px 8px" }}>
                      Confidence: {(sug.correlation.score * 100).toFixed(0)}% ({sug.correlation.strength})
                    </span>
                  </div>
                )}

                {/* Rationale */}
                {sug.rationale && (
                  <p style={{ margin: "8px 0 0", fontSize: "0.78rem", color: "var(--text-secondary)", whiteSpace: "pre-line" }}>
                    <strong>Clinical Rationale:</strong> {sug.rationale}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showAdd && (
        <div className="glass-card animate-slide-down" style={{ padding: "20px", marginBottom: "16px", border: "2px solid var(--accent-teal)" }}>
          <h4 style={{ margin: "0 0 14px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem" }}>New IEP Goal</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input className="glass-input" placeholder="Goal title…" value={newGoal.title} onChange={e => setNewGoal(g => ({ ...g, title: e.target.value }))} autoFocus />
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", minWidth: "80px" }}>Progress</label>
              <input type="range" min={0} max={100} value={newGoal.progressPercent} onChange={e => setNewGoal(g => ({ ...g, progressPercent: Number(e.target.value) }))} style={{ flex: 1 }} />
              <span style={{ fontSize: "0.82rem", fontWeight: 700, minWidth: "36px" }}>{newGoal.progressPercent}%</span>
            </div>
            <select className="glass-input" value={newGoal.status} onChange={e => setNewGoal(g => ({ ...g, status: e.target.value as IEPGoal["status"] }))}>
              {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn-ghost" onClick={() => setShowAdd(false)} style={{ flex: 1 }}>Cancel</button>
              <button className="btn-primary" onClick={addGoal} style={{ flex: 1 }}>Add Goal</button>
            </div>
          </div>
        </div>
      )}

      {goals.length === 0 && !showAdd ? (
        <div className="glass-card" style={{ padding: "40px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", color: "var(--text-secondary)", marginBottom: "12px" }}>
            <Target size={40} />
          </div>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>No IEP goals added yet</p>
        </div>
      ) : goals.map((goal) => (
        <div key={goal.id} className="glass-card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-primary)" }}>{goal.title}</span>
                <span className={`chip ${STATUS_STYLES[goal.status]}`}>{goal.status}</span>
              </div>
              {/* Progress bar */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ flex: 1, height: "8px", background: "rgba(0,0,0,0.06)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${goal.progressPercent}%`,
                    background: progressColors[goal.status] || "var(--accent-teal)",
                    borderRadius: "4px", transition: "width 0.4s ease",
                  }} />
                </div>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", minWidth: "36px" }}>
                  {goal.progressPercent}%
                </span>
              </div>

              {/* Correlation details for adopted goal if present */}
              {goal.correlation && (
                <div style={{
                  marginTop: "10px",
                  padding: "6px 10px",
                  background: "rgba(124, 58, 237, 0.05)",
                  borderRadius: "6px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.75rem",
                  color: "var(--accent-purple)",
                  border: "1px solid rgba(124, 58, 237, 0.15)"
                }}>
                  <Link2 size={12} />
                  <span><strong>{goal.correlation.correlatedPillar} Link:</strong> {goal.correlation.factor} ({(goal.correlation.score * 100).toFixed(0)}% match)</span>
                </div>
              )}

              {/* Milestones list if defined */}
              {Array.isArray(goal.milestones) && goal.milestones.length > 0 && (
                <div style={{ marginTop: "12px", background: "rgba(0,0,0,0.02)", padding: "10px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px", textTransform: "uppercase" }}>
                    Milestones ({goal.milestones.filter(m => m.completed).length}/{goal.milestones.length} completed):
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {goal.milestones.map((m) => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem" }}>
                        <span style={{ display: "inline-flex" }}>{m.completed ? <CheckCircle2 size={15} color="var(--success)" /> : <Hourglass size={15} color="var(--text-secondary)" />}</span>
                        <span style={{ color: m.completed ? "var(--success)" : "var(--text-primary)", textDecoration: m.completed ? "line-through" : "none" }}>
                          {m.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {canEdit && (
                <div style={{ display: "flex", gap: "10px", marginTop: "12px", alignItems: "center" }}>
                  <input type="range" min={0} max={100} value={goal.progressPercent}
                    onChange={e => updateGoal(goal.id, "progressPercent", Number(e.target.value))}
                    style={{ flex: 1 }} />
                  <select
                    className="glass-input" style={{ width: "auto", fontSize: "0.82rem", padding: "5px 10px" }}
                    value={goal.status}
                    onChange={e => updateGoal(goal.id, "status", e.target.value as IEPGoal["status"])}
                  >
                    {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>
            {canEdit && (
              <button onClick={() => removeGoal(goal.id)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: "1.3rem", marginTop: "-4px" }}>
                Ã—
              </button>
            )}
          </div>
        </div>
      ))}

      {canEdit && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn-primary" onClick={save} disabled={saving} style={{ padding: "12px 28px" }}>
            {saving ? "Saving…" : (
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Save size={16} /> Save Care Plan
              </span>
            )}
          </button>
        </div>
      )}

      {/* AI Behavioral Analysis Report Section - Restricted to Therapist Only */}
      {isTherapist && initial?.lastAiReport && (
        <div className="glass-card animate-fade-in" style={{ padding: "20px", marginTop: "16px", border: "1px dashed var(--accent-purple-soft)", background: "rgba(255, 255, 255, 0.9)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", borderBottom: "1px solid rgba(61, 79, 107, 0.08)", paddingBottom: "8px" }}>
            <h4 style={{ margin: 0, fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "8px" }}>
              <BrainCircuit size={18} style={{ color: "var(--accent-purple)" }} /> Latest AI Behavioral Analysis
            </h4>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 500 }}>
              Generated on {new Date(initial.lastAiReport.timestamp).toLocaleDateString()} at {new Date(initial.lastAiReport.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="markdown-content" style={{ fontSize: "0.88rem", lineHeight: 1.6, color: "var(--text-primary)", maxHeight: "300px", overflowY: "auto", paddingRight: "8px" }}>
            
            <ReactMarkdown>{initial.lastAiReport.report}</ReactMarkdown>
          </div>
          <style>{`
            .markdown-content h3 {
              font-size: 1rem;
              font-weight: 700;
              color: var(--primary-dark);
              margin-top: 14px;
              margin-bottom: 6px;
              border-bottom: 1px solid rgba(61, 79, 107, 0.1);
              padding-bottom: 4px;
            }
            .markdown-content p {
              margin-bottom: 8px;
            }
            .markdown-content ul, .markdown-content ol {
              padding-left: 16px;
              margin-bottom: 12px;
            }
            .markdown-content li {
              margin-bottom: 4px;
            }
            .markdown-content strong {
              font-weight: 700;
              color: var(--primary-dark);
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

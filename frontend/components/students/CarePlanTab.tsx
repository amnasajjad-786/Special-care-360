"use client";
import { useState, useEffect } from "react";
import { CarePlan, IEPGoal } from "@/types";
import toast from "react-hot-toast";
import { studentsDb } from "@/lib/firestore-api";
import ReactMarkdown from "react-markdown";

const STATUS_OPTIONS = ["In Progress", "Mastered", "Regressed"] as const;
const STATUS_STYLES: Record<string, string> = {
  "In Progress": "chip-info",
  Mastered: "chip-success",
  Regressed: "chip-danger",
};

interface Props { studentId: string; carePlan: CarePlan; canEdit: boolean; onChange?: (data: CarePlan) => void; }

export default function CarePlanTab({ studentId, carePlan: initial, canEdit, onChange }: Props) {
  const [goals, setGoals] = useState<IEPGoal[]>(initial?.goals || []);

  useEffect(() => {
    if (onChange) onChange({ ...initial, goals });
  }, [goals, onChange]); // eslint-disable-line react-hooks/exhaustive-deps
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: "", status: "In Progress" as IEPGoal["status"], progressPercent: 0 });

  const save = async () => {
    setSaving(true);
    try {
      await studentsDb.updateCarePlan(studentId, { goals } as unknown as Record<string, unknown>);
      toast.success("Care plan saved");
    } catch { toast.error("Save failed"); }
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
          <h3 style={{ margin: 0, fontWeight: 700, color: "var(--primary-dark)", fontSize: "1.05rem" }}>IEP Goals</h3>
          <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
            {goals.filter(g => g.status === "Mastered").length} of {goals.length} goals mastered
          </p>
        </div>
        {canEdit && <button className="btn-primary" onClick={() => setShowAdd(true)} style={{ padding: "8px 18px", fontSize: "0.85rem" }}>+ Add Goal</button>}
      </div>

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
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🎯</div>
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
                ×
              </button>
            )}
          </div>
        </div>
      ))}

      {canEdit && goals.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn-primary" onClick={save} disabled={saving} style={{ padding: "12px 28px" }}>
            {saving ? "Saving…" : "💾 Save Care Plan"}
          </button>
        </div>
      )}

      {/* AI Behavioral Analysis Report Section */}
      {initial?.lastAiReport && (
        <div className="glass-card animate-fade-in" style={{ padding: "20px", marginTop: "16px", border: "1px dashed var(--accent-purple-soft)", background: "rgba(255, 255, 255, 0.9)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", borderBottom: "1px solid rgba(61, 79, 107, 0.08)", paddingBottom: "8px" }}>
            <h4 style={{ margin: 0, fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🤖</span> Latest AI Behavioral Analysis
            </h4>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 500 }}>
              Generated on {new Date(initial.lastAiReport.timestamp).toLocaleDateString()} at {new Date(initial.lastAiReport.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="markdown-content" style={{ fontSize: "0.88rem", lineHeight: 1.6, color: "var(--text-primary)", maxHeight: "300px", overflowY: "auto", paddingRight: "8px" }}>
            {/* @ts-ignore - ReactMarkdown type clash */}
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

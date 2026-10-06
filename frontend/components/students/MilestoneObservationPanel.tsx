"use client";

/**
 * MilestoneObservationPanel
 * ─────────────────────────
 * Shown to TEACHER role in the Care Plan tab.
 * Lets the teacher log their direct classroom/therapy observation of each
 * IEP goal/milestone using defined performance criteria — NOT a random number.
 *
 * Observation statuses (maps to actual student performance):
 *   "Achieved"        — student consistently meets the milestone criteria
 *   "In Progress"     — improving but not yet consistently meeting criteria
 *   "Failed/Declined" — previously met skill is now clearly lost/declining
 *
 * On save, the system checks achievedGoals[] for prior mastery and runs
 * regression detection automatically via milestoneObservationsDb.log().
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  milestoneObservationsDb,
  MilestoneObservationDoc,
  MilestoneObservationStatus,
  studentsDb,
  type StudentDoc,
} from "@/lib/firestore-api";
import { IEPGoal, CarePlan } from "@/types";
import toast from "react-hot-toast";
import {
  ClipboardList,
  CheckCircle,
  Clock,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Send,
} from "lucide-react";

interface Props {
  studentId: string;
  studentName: string;
  centerId: string;
  carePlan: CarePlan;
}

const OBS_OPTIONS: { value: MilestoneObservationStatus; label: string; description: string; color: string }[] = [
  {
    value: "Achieved",
    label: "✅ Achieved",
    description: "Student consistently meets the skill/milestone criteria today",
    color: "#10b981",
  },
  {
    value: "In Progress",
    label: "🔄 In Progress",
    description: "Student shows improvement but has not yet consistently met the criteria",
    color: "#f59e0b",
  },
  {
    value: "Failed/Declined",
    label: "⚠️ Failed / Declined",
    description: "Student does not meet a previously achieved skill — clear loss or significant decline observed",
    color: "#ef4444",
  },
];

export default function MilestoneObservationPanel({ studentId, studentName, centerId, carePlan }: Props) {
  const { profile, user } = useAuth();

  // All IEP goals: active goals + achieved goals combined
  const activeGoals: IEPGoal[] = Array.isArray(carePlan.goals) ? carePlan.goals : [];
  const achievedGoals: IEPGoal[] = Array.isArray(carePlan.achievedGoals) ? carePlan.achievedGoals : [];
  const allGoals = [...activeGoals, ...achievedGoals];

  const [selectedGoalId, setSelectedGoalId] = useState<string>("");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>("");
  const [observedStatus, setObservedStatus] = useState<MilestoneObservationStatus | "">("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<MilestoneObservationDoc[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const selectedGoal = allGoals.find((g) => g.id === selectedGoalId) ?? null;
  const milestones = selectedGoal?.milestones ?? [];

  // Load observation history when panel first opens
  useEffect(() => {
    if (!showHistory) return;
    setLoadingHistory(true);
    milestoneObservationsDb
      .listForStudent(studentId)
      .then(setHistory)
      .catch(() => toast.error("Could not load observation history."))
      .finally(() => setLoadingHistory(false));
  }, [showHistory, studentId]);

  const handleSubmit = async () => {
    if (!selectedGoalId || !observedStatus) {
      toast.error("Please select a goal and observation status.");
      return;
    }

    setSaving(true);
    try {
      // Get the full StudentDoc for staffRecipients in regression detection
      const studentDoc = (await studentsDb.get(studentId)) as StudentDoc | null;
      if (!studentDoc) throw new Error("Student not found");

      const selectedMilestone = milestones.find((m) => m.id === selectedMilestoneId);

      const observation: Omit<MilestoneObservationDoc, "id"> = {
        studentId,
        studentName,
        centerId,
        goalId: selectedGoalId,
        goalTitle: selectedGoal?.title ?? "",
        milestoneId: selectedMilestoneId || undefined,
        milestoneDescription: selectedMilestone?.description || undefined,
        observedStatus: observedStatus as MilestoneObservationStatus,
        notes,
        observedBy: user?.uid ?? "",
        observedByName: profile?.name ?? "Teacher",
        observedAt: new Date().toISOString(),
      };

      const { alertCreated, alertLevel } = await milestoneObservationsDb.log(observation, studentDoc);

      if (alertCreated && alertLevel === "Regression Warning") {
        toast("⚠️ Regression Warning created and sent to therapist/admin.", {
          icon: "🚨",
          style: { background: "#fef2f2", color: "#991b1b", border: "1px solid #fca5a5" },
        });
      } else if (alertLevel === "Monitoring") {
        toast("📋 Monitoring alert created. One more decline will trigger a Regression Warning.", {
          icon: "⚠️",
          style: { background: "#fffbeb", color: "#92400e", border: "1px solid #fcd34d" },
        });
      } else {
        toast.success("Observation logged successfully.");
      }

      // Reset form
      setSelectedGoalId("");
      setSelectedMilestoneId("");
      setObservedStatus("");
      setNotes("");

      // Refresh history if open
      if (showHistory) {
        const updated = await milestoneObservationsDb.listForStudent(studentId);
        setHistory(updated);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to save observation.");
    } finally {
      setSaving(false);
    }
  };

  if (allGoals.length === 0) {
    return (
      <div className="glass-card" style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.88rem" }}>
        <ClipboardList size={32} style={{ marginBottom: "8px", opacity: 0.4 }} />
        <p style={{ margin: 0 }}>No IEP goals available to observe yet.</p>
        <p style={{ margin: "4px 0 0", fontSize: "0.78rem" }}>The therapist must create goals in IEP Builder first.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h3 style={{ margin: 0, fontWeight: 700, color: "var(--primary-dark)", fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "8px" }}>
            <ClipboardList size={18} /> Log Milestone Observation
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Record what you actually observed during today&apos;s classroom / therapy session
          </p>
        </div>
      </div>

      {/* Observation Form */}
      <div className="glass-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>

        {/* Goal selector */}
        <div>
          <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
            IEP Goal / Skill *
          </label>
          <select
            className="glass-input"
            value={selectedGoalId}
            onChange={(e) => { setSelectedGoalId(e.target.value); setSelectedMilestoneId(""); }}
          >
            <option value="">— Select a goal —</option>
            {activeGoals.length > 0 && (
              <optgroup label="Active Goals">
                {activeGoals.map((g) => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </optgroup>
            )}
            {achievedGoals.length > 0 && (
              <optgroup label="Previously Achieved Goals (monitoring for regression)">
                {achievedGoals.map((g) => (
                  <option key={g.id} value={g.id}>✅ {g.title}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* Milestone selector (optional, if goal has milestones) */}
        {milestones.length > 0 && (
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
              Specific Milestone (optional)
            </label>
            <select
              className="glass-input"
              value={selectedMilestoneId}
              onChange={(e) => setSelectedMilestoneId(e.target.value)}
            >
              <option value="">— Whole goal (no specific milestone) —</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>{m.description}</option>
              ))}
            </select>
          </div>
        )}

        {/* Observation status — performance-based, not a percentage */}
        <div>
          <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
            Observed Performance Today *
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {OBS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: `1.5px solid ${observedStatus === opt.value ? opt.color : "rgba(0,0,0,0.08)"}`,
                  background: observedStatus === opt.value ? `${opt.color}10` : "white",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <input
                  type="radio"
                  name="observedStatus"
                  value={opt.value}
                  checked={observedStatus === opt.value}
                  onChange={() => setObservedStatus(opt.value)}
                  style={{ marginTop: "2px", flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", color: opt.color }}>{opt.label}</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" }}>{opt.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Optional notes */}
        <div>
          <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
            Observation Notes (optional)
          </label>
          <textarea
            className="glass-input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe what you observed — e.g. student could not follow 2-step instructions that were mastered last week..."
            style={{ width: "100%", resize: "vertical", fontSize: "0.85rem" }}
          />
        </div>

        {/* Submit */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={saving || !selectedGoalId || !observedStatus}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 22px", fontWeight: 700 }}
          >
            <Send size={15} />
            {saving ? "Saving..." : "Save Observation"}
          </button>
        </div>
      </div>

      {/* Observation History (collapsible) */}
      <div className="glass-card" style={{ padding: "14px 18px" }}>
        <button
          onClick={() => setShowHistory((v) => !v)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.9rem", padding: 0 }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Clock size={16} /> Observation History
          </span>
          {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showHistory && (
          <div style={{ marginTop: "14px" }}>
            {loadingHistory ? (
              <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem", textAlign: "center" }}>Loading...</div>
            ) : history.length === 0 ? (
              <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem", textAlign: "center" }}>No observations logged yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {history.map((obs) => {
                  const statusColor = obs.observedStatus === "Achieved" ? "#10b981"
                    : obs.observedStatus === "Failed/Declined" ? "#ef4444" : "#f59e0b";
                  return (
                    <div key={obs.id} style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: "8px", padding: "10px 12px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                      {obs.observedStatus === "Achieved" && <CheckCircle size={16} style={{ color: "#10b981", flexShrink: 0, marginTop: "2px" }} />}
                      {obs.observedStatus === "In Progress" && <Clock size={16} style={{ color: "#f59e0b", flexShrink: 0, marginTop: "2px" }} />}
                      {obs.observedStatus === "Failed/Declined" && <TrendingDown size={16} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>{obs.goalTitle}</div>
                        {obs.milestoneDescription && (
                          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Milestone: {obs.milestoneDescription}</div>
                        )}
                        <div style={{ fontSize: "0.78rem", color: statusColor, fontWeight: 700, marginTop: "2px" }}>{obs.observedStatus}</div>
                        {obs.notes && <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px", fontStyle: "italic" }}>&quot;{obs.notes}&quot;</div>}
                        <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                          {obs.observedByName} · {new Date(obs.observedAt).toLocaleDateString()} {new Date(obs.observedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

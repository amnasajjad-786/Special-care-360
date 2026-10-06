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
  Trophy,
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
    label: "✅ Mastered / Consistent Performance",
    description: "Student successfully meets the defined skill/milestone criteria during activity",
    color: "#10b981",
  },
  {
    value: "In Progress",
    label: "🔄 Progressing / Partial Performance",
    description: "Student shows developing ability or requires partial assistance with criteria",
    color: "#f59e0b",
  },
  {
    value: "Failed/Declined",
    label: "⚠️ Not Demonstrated / Unable to Perform",
    description: "Student cannot demonstrate or fails to perform the skill/milestone criteria",
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
  const [showAchievedHistory, setShowAchievedHistory] = useState(true);

  const [lastResult, setLastResult] = useState<{
    goalTitle: string;
    previousStatus: string;
    currentStatus: string;
    change: "Mastered/Maintaining" | "Declining" | "In Progress";
    alertCreated: boolean;
    alertLevel: "Monitoring" | "Regression Warning" | null;
    reason?: string;
  } | null>(null);

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

      const result = await milestoneObservationsDb.log(observation, studentDoc);

      setLastResult({
        goalTitle: selectedGoal?.title ?? "Selected Skill",
        previousStatus: result.previousStatus,
        currentStatus: result.currentStatus,
        change: result.change,
        alertCreated: result.alertCreated,
        alertLevel: result.alertLevel,
        reason: result.reason,
      });

      if (result.alertCreated && result.alertLevel === "Regression Warning") {
        toast("⚠️ Early Regression Warning created for Therapist/Admin.", {
          icon: "🚨",
          style: { background: "#fef2f2", color: "#991b1b", border: "1px solid #fca5a5" },
        });
      } else if (result.alertLevel === "Monitoring") {
        toast("📋 Monitoring alert updated. Confirmed downward trend will trigger Warning.", {
          icon: "⚠️",
          style: { background: "#fffbeb", color: "#92400e", border: "1px solid #fcd34d" },
        });
      } else {
        toast.success("Progress observation saved (Mastered/Maintaining).");
      }

      // Reset form fields
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

        {/* Mastery History Info & Goal Selector */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Select Skill / Milestone from History *
            </label>
            {achievedGoals.length > 0 && (
              <span style={{ fontSize: "0.74rem", background: "rgba(16,185,129,0.12)", color: "var(--success)", padding: "2px 8px", borderRadius: "999px", fontWeight: 700 }}>
                {achievedGoals.length} Mastered Skill{achievedGoals.length > 1 ? "s" : ""} in Mastery History
              </span>
            )}
          </div>
          <select
            className="glass-input"
            value={selectedGoalId}
            onChange={(e) => { setSelectedGoalId(e.target.value); setSelectedMilestoneId(""); }}
          >
            <option value="">— Select a skill/goal to observe —</option>
            {achievedGoals.length > 0 && (
              <optgroup label="⭐ PREVIOUSLY MASTERED / ACHIEVED SKILLS (Mastery History)">
                {achievedGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    🏆 {g.title} {g.achievedAt ? `(Achieved: ${new Date(g.achievedAt).toLocaleDateString()})` : "(Mastered)"}
                  </option>
                ))}
              </optgroup>
            )}
            {activeGoals.length > 0 && (
              <optgroup label="📋 Active / In-Progress Goals (No prior mastery)">
                {activeGoals.map((g) => (
                  <option key={g.id} value={g.id}>⏳ {g.title}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* Milestone selector (optional, if goal has milestones) */}
        {milestones.length > 0 && (
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
              Target Milestone Criteria ({milestones.length} defined)
            </label>
            <select
              className="glass-input"
              value={selectedMilestoneId}
              onChange={(e) => setSelectedMilestoneId(e.target.value)}
            >
              <option value="">— Whole Skill / Goal Criteria —</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.completed ? "✅ " : "⏳ "}{m.description}
                </option>
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

        {/* Automated Comparison Result Card (shown when an observation is logged) */}
        {lastResult && (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "8px",
              border: `1.5px solid ${
                lastResult.change === "Declining"
                  ? lastResult.alertLevel === "Regression Warning"
                    ? "rgba(239, 68, 68, 0.4)"
                    : "rgba(245, 158, 11, 0.4)"
                  : "rgba(16, 185, 129, 0.3)"
              }`,
              background:
                lastResult.change === "Declining"
                  ? lastResult.alertLevel === "Regression Warning"
                    ? "rgba(239, 68, 68, 0.05)"
                    : "rgba(245, 158, 11, 0.05)"
                  : "rgba(16, 185, 129, 0.05)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
              <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--primary-dark)" }}>
                Analysis for &quot;{lastResult.goalTitle}&quot;:
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "2px 10px",
                  borderRadius: "999px",
                  background:
                    lastResult.change === "Declining"
                      ? lastResult.alertLevel === "Regression Warning"
                        ? "rgba(239, 68, 68, 0.15)"
                        : "rgba(245, 158, 11, 0.15)"
                      : "rgba(16, 185, 129, 0.15)",
                  color:
                    lastResult.change === "Declining"
                      ? lastResult.alertLevel === "Regression Warning"
                        ? "var(--danger)"
                        : "#92400e"
                      : "var(--success)",
                }}
              >
                {lastResult.change === "Declining"
                  ? `⚠️ ${lastResult.alertLevel || "Early Regression Alert"}`
                  : `✅ ${lastResult.change}`}
              </span>
            </div>

            <div style={{ display: "flex", gap: "16px", fontSize: "0.82rem", color: "var(--text-secondary)", flexWrap: "wrap" }}>
              <div>
                Previous/Mastered Value: <strong style={{ color: "var(--text-primary)" }}>{lastResult.previousStatus}</strong>
              </div>
              <div>
                Current Observed Value: <strong style={{ color: "var(--text-primary)" }}>{lastResult.currentStatus}</strong>
              </div>
              <div>
                Detected Status:{" "}
                <strong
                  style={{
                    color:
                      lastResult.change === "Declining"
                        ? "var(--danger)"
                        : "var(--success)",
                  }}
                >
                  {lastResult.change}
                </strong>
              </div>
            </div>

            {lastResult.reason && (
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                {lastResult.reason}
              </div>
            )}
          </div>
        )}

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

      {/* ── Achieved Goals History (Student's IEP Mastery Baseline) ── */}
      {achievedGoals.length > 0 && (
        <div className="glass-card" style={{ padding: "16px 20px" }}>
          <button
            onClick={() => setShowAchievedHistory((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontWeight: 800,
              color: "var(--primary-dark)",
              fontSize: "0.95rem",
              width: "100%",
              justifyContent: "space-between",
              padding: 0,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Trophy size={18} style={{ color: "#10b981" }} />
              {studentName}&apos;s Achieved Goals History ({achievedGoals.length})
            </span>
            {showAchievedHistory ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {showAchievedHistory && (
            <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {achievedGoals.map((ag) => (
                <div
                  key={ag.id}
                  style={{
                    background: "rgba(16,185,129,0.06)",
                    border: "1px solid rgba(16,185,129,0.2)",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                  }}
                >
                  <Trophy size={20} style={{ color: "#10b981", flexShrink: 0, marginTop: "2px" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.9rem" }}>{ag.title}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      {ag.goalArea || "General"} &nbsp;·&nbsp; Achieved on {ag.achievedAt ? new Date(ag.achievedAt).toLocaleDateString() : "Prior IEP Milestone"}
                    </div>
                    {/* Render target milestones if available */}
                    {Array.isArray(ag.milestones) && ag.milestones.length > 0 && (
                      <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                        {ag.milestones.map((m) => (
                          <div key={m.id} style={{ fontSize: "0.76rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>✅</span>
                            <span>{m.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="chip" style={{ marginLeft: "auto", background: "rgba(16,185,129,0.15)", color: "#065f46", fontWeight: 700, fontSize: "0.72rem", flexShrink: 0 }}>
                    ✅ Achieved
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

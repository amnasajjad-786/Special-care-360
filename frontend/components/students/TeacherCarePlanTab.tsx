"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  milestoneObservationsDb,
  MilestoneObservationDoc,
  MilestoneObservationStatus,
  studentsDb,
  StudentDoc,
} from "@/lib/firestore-api";
import { CarePlan, IEPGoal } from "@/types";
import {
  Trophy,
  History,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  Clock,
  Send,
} from "lucide-react";
import toast from "react-hot-toast";

interface Props {
  studentId: string;
  studentName: string;
  centerId: string;
  carePlan: CarePlan;
}

// Professional status options for teacher observation
const PERFORMANCE_OPTIONS: {
  value: MilestoneObservationStatus;
  label: string;
  badge: string;
  description: string;
  color: string;
  icon: typeof CheckCircle2;
}[] = [
  {
    value: "Achieved",
    label: "Maintaining Mastery",
    badge: "Consistent Performance",
    description: "Student retains the skill and performs consistently during daily activities.",
    color: "#10b981",
    icon: CheckCircle2,
  },
  {
    value: "In Progress",
    label: "Improving / Developing",
    badge: "Progressing with Prompts",
    description: "Student is actively developing the skill with partial guidance or verbal cues.",
    color: "#3b82f6",
    icon: TrendingUp,
  },
  {
    value: "Failed/Declined",
    label: "Skill Loss / Declining",
    badge: "Unable to Demonstrate",
    description: "Student shows noticeable loss of previously mastered ability or cannot perform.",
    color: "#ef4444",
    icon: AlertCircle,
  },
];

export default function TeacherCarePlanTab({
  studentId,
  studentName,
  centerId,
  carePlan,
}: Props) {
  const { profile, user } = useAuth();
  const achievedGoals: IEPGoal[] = Array.isArray(carePlan.achievedGoals) ? carePlan.achievedGoals : [];

  // Selected performance per goal: { [goalId]: "Achieved" | "In Progress" | "Failed/Declined" }
  const [selectedStatus, setSelectedStatus] = useState<Record<string, MilestoneObservationStatus>>({});
  // Notes per goal: { [goalId]: string }
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Saving state per goal: { [goalId]: boolean }
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);

  // Latest analysis per goal
  const [goalResults, setGoalResults] = useState<
    Record<
      string,
      {
        previousStatus: string;
        currentStatus: string;
        change: string;
        alertLevel: string | null;
        alertCreated: boolean;
        reason?: string;
      }
    >
  >({});

  // Observation history for this student
  const [history, setHistory] = useState<MilestoneObservationDoc[]>([]);

  const resolvedCenterId = centerId || profile?.centerId || "";

  useEffect(() => {
    if (!studentId || !resolvedCenterId) return;
    milestoneObservationsDb
      .listForStudent(studentId, resolvedCenterId || undefined)
      .then(setHistory)
      .catch((err) => console.error("Could not load observation history:", err));
  }, [studentId, resolvedCenterId]);

  const handleRecordStatus = async (goal: IEPGoal) => {
    const currentStatus = selectedStatus[goal.id];
    if (!currentStatus) {
      toast.error("Please select current skill performance first.");
      return;
    }

    if (!resolvedCenterId) {
      toast.error("Profile not loaded yet — please wait a moment and try again.");
      return;
    }

    setSavingGoalId(goal.id);
    try {
      const studentDoc = (await studentsDb.get(studentId)) as StudentDoc | null;
      if (!studentDoc) throw new Error("Student not found");

      const observation: Omit<MilestoneObservationDoc, "id"> = {
        studentId,
        studentName,
        centerId: resolvedCenterId,
        goalId: goal.id,
        goalTitle: goal.title,
        observedStatus: currentStatus,
        notes: notes[goal.id] || "",
        observedBy: user?.uid ?? "",
        observedByName: profile?.name ?? "Teacher",
        observedAt: new Date().toISOString(),
      };

      const result = await milestoneObservationsDb.log(observation, studentDoc);

      setGoalResults((prev) => ({
        ...prev,
        [goal.id]: {
          previousStatus: result.previousStatus,
          currentStatus: result.currentStatus,
          change: result.change,
          alertLevel: result.alertLevel,
          alertCreated: result.alertCreated,
          reason: result.reason,
        },
      }));

      if (result.alertCreated && result.alertLevel === "Regression Warning") {
        toast("Regression warning sent to assigned therapists.", {
          style: { background: "#fef2f2", color: "#991b1b", border: "1px solid #fca5a5" },
        });
      } else if (result.alertLevel === "Monitoring") {
        toast("Marked as Monitoring. Another decline will trigger a Regression Warning.", {
          style: { background: "#fffbeb", color: "#92400e", border: "1px solid #fcd34d" },
        });
      } else {
        toast.success("Skill performance logged successfully.");
      }

      // Refresh history list
      try {
        const updatedHistory = await milestoneObservationsDb.listForStudent(studentId, resolvedCenterId);
        setHistory(updatedHistory);
      } catch {
        toast.error("Progress log saved; history could not be refreshed. Please reload when connected.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[TeacherCarePlanTab] Save failed:", message, err);
      toast.error(`Failed to save: ${message}`);
    } finally {
      setSavingGoalId(null);
    }
  };


  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
        <div>
          <h3 style={{ margin: 0, fontWeight: 700, color: "var(--primary-dark)", fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "8px" }}>
            <History size={18} /> IEP Achieved Goals History &amp; Skill Tracking
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
            Finalized Therapist IEP Mastery Baseline for {studentName} — Review and verify current classroom performance.
          </p>
        </div>
        <span
          className="chip"
          style={{
            background: "rgba(16,185,129,0.12)",
            color: "var(--success)",
            fontWeight: 700,
            fontSize: "0.8rem",
          }}
        >
          {achievedGoals.length} Mastered Goal{achievedGoals.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Achieved Goals Cards */}
      {achievedGoals.length === 0 ? (
        <div className="glass-card" style={{ padding: "40px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", color: "var(--text-secondary)", marginBottom: "12px" }}>
            <Trophy size={40} style={{ opacity: 0.35 }} />
          </div>
          <h4 style={{ margin: 0, color: "var(--primary-dark)", fontWeight: 700 }}>No Achieved IEP Goals Yet</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "6px 0 0" }}>
            When the Therapist marks this student&apos;s IEP goals as &quot;Achieved&quot; in the IEP Builder, they will appear here for classroom performance tracking.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {achievedGoals.map((ag) => {
            const currentSelected = selectedStatus[ag.id];
            const result = goalResults[ag.id];
            const isSaving = savingGoalId === ag.id;

            // Find most recent observation for this goal from history
            const lastObs = history.find((h) => h.goalId === ag.id);

            return (
              <div
                key={ag.id}
                className="glass-card"
                style={{
                  padding: "18px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  border: "1px solid rgba(16,185,129,0.2)",
                  background: "rgba(255,255,255,0.95)",
                }}
              >
                {/* Goal Info Header */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                    <Trophy size={22} style={{ color: "#10b981", flexShrink: 0, marginTop: "2px" }} />
                    <div>
                      <div style={{ fontWeight: 800, color: "var(--primary-dark)", fontSize: "0.95rem" }}>
                        {ag.title}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                        <strong>{ag.goalArea || "General"}</strong> &nbsp;·&nbsp; Mastered on{" "}
                        {ag.achievedAt ? new Date(ag.achievedAt).toLocaleDateString() : "Earlier IEP Milestone"}
                      </div>
                    </div>
                  </div>

                  <span
                    className="chip"
                    style={{
                      background: "rgba(16,185,129,0.15)",
                      color: "#065f46",
                      fontWeight: 700,
                      fontSize: "0.75rem",
                      flexShrink: 0,
                    }}
                  >
                    🏆 Mastered Baseline
                  </span>
                </div>

                {/* Milestones if present */}
                {Array.isArray(ag.milestones) && ag.milestones.length > 0 && (
                  <div
                    style={{
                      background: "rgba(0,0,0,0.02)",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid rgba(0,0,0,0.04)",
                    }}
                  >
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "4px" }}>
                      Achieved Criteria:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                      {ag.milestones.map((m) => (
                        <div key={m.id} style={{ fontSize: "0.78rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>✅</span>
                          <span>{m.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Current Performance Selection */}
                <div>
                  <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "8px" }}>
                    Track Current Student Skill Performance:
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "8px" }}>
                    {PERFORMANCE_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isSelected = currentSelected === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setSelectedStatus((prev) => ({ ...prev, [ag.id]: opt.value }))
                          }
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "10px",
                            padding: "10px 12px",
                            borderRadius: "8px",
                            border: `1.5px solid ${isSelected ? opt.color : "rgba(0,0,0,0.08)"}`,
                            background: isSelected ? `${opt.color}12` : "#ffffff",
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <Icon
                            size={18}
                            style={{
                              color: isSelected ? opt.color : "var(--text-secondary)",
                              flexShrink: 0,
                              marginTop: "2px",
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: "0.84rem", color: isSelected ? opt.color : "var(--text-primary)" }}>
                              {opt.label}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                              {opt.badge}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Optional Note + Save Action */}
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    className="glass-input"
                    value={notes[ag.id] || ""}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [ag.id]: e.target.value }))
                    }
                    placeholder="Classroom observation note (e.g., student demonstrated independently during snack time)..."
                    style={{ flex: 1, minWidth: "220px", fontSize: "0.82rem", padding: "8px 12px" }}
                  />

                  <button
                    className="btn-primary"
                    onClick={() => handleRecordStatus(ag)}
                    disabled={isSaving || !currentSelected}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 18px",
                      fontWeight: 700,
                      fontSize: "0.82rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Send size={14} />
                    {isSaving ? "Saving..." : "Save Progress Log"}
                  </button>
                </div>

                {/* Analysis / Detection Result Card */}
                {result && (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "6px",
                      border: `1px solid ${
                        result.change === "Declining"
                          ? result.alertLevel === "Regression Warning"
                            ? "rgba(239, 68, 68, 0.4)"
                            : "rgba(245, 158, 11, 0.4)"
                          : "rgba(16, 185, 129, 0.3)"
                      }`,
                      background:
                        result.change === "Declining"
                          ? result.alertLevel === "Regression Warning"
                            ? "rgba(239, 68, 68, 0.05)"
                            : "rgba(245, 158, 11, 0.05)"
                          : "rgba(16, 185, 129, 0.05)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      fontSize: "0.8rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                      <span style={{ fontWeight: 700, color: "var(--primary-dark)" }}>
                        Current Assessment Comparison:
                      </span>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "999px",
                          background:
                            result.change === "Declining"
                              ? result.alertLevel === "Regression Warning"
                                ? "rgba(239, 68, 68, 0.15)"
                                : "rgba(245, 158, 11, 0.15)"
                              : "rgba(16, 185, 129, 0.15)",
                          color:
                            result.change === "Declining"
                              ? result.alertLevel === "Regression Warning"
                                ? "var(--danger)"
                                : "#92400e"
                              : "var(--success)",
                        }}
                      >
                        {result.change === "Declining"
                          ? `⚠️ ${result.alertLevel || "Early Regression Alert"}`
                          : "✅ Mastered / Maintaining"}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "16px", color: "var(--text-secondary)", flexWrap: "wrap" }}>
                      <div>
                        IEP Baseline: <strong style={{ color: "var(--text-primary)" }}>{result.previousStatus}</strong>
                      </div>
                      <div>
                        Current Performance: <strong style={{ color: "var(--text-primary)" }}>{result.currentStatus}</strong>
                      </div>
                      <div>
                        Status:{" "}
                        <strong
                          style={{
                            color:
                              result.change === "Declining"
                                ? "var(--danger)"
                                : "var(--success)",
                          }}
                        >
                          {result.change}
                        </strong>
                      </div>
                    </div>

                    {result.reason && (
                      <div style={{ color: "var(--text-secondary)", fontStyle: "italic", fontSize: "0.75rem" }}>
                        {result.reason}
                      </div>
                    )}
                  </div>
                )}

                {/* Previous observation stamp if available */}
                {lastObs && !result && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Clock size={12} />
                    <span>
                      Last checked by {lastObs.observedByName}:{" "}
                      <strong style={{ color: "var(--text-primary)" }}>{lastObs.observedStatus}</strong> on{" "}
                      {new Date(lastObs.observedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

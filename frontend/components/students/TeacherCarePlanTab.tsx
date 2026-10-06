"use client";

import { useState } from "react";
import { CarePlan, IEPGoal } from "@/types";
import { Trophy, ChevronDown, ChevronUp, History } from "lucide-react";

interface Props {
  studentName: string;
  carePlan: CarePlan;
}

export default function TeacherCarePlanTab({ studentName, carePlan }: Props) {
  const [showHistory, setShowHistory] = useState(true);
  const achievedGoals: IEPGoal[] = Array.isArray(carePlan.achievedGoals) ? carePlan.achievedGoals : [];

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
        <div>
          <h3 style={{ margin: 0, fontWeight: 700, color: "var(--primary-dark)", fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "8px" }}>
            <History size={18} /> IEP Mastery History
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
            Finalized Therapist IEP Achieved Goals &amp; Skills for {studentName}
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
          {achievedGoals.length} Goal{achievedGoals.length === 1 ? "" : "s"} Mastered
        </span>
      </div>

      {/* Achieved Goals List */}
      {achievedGoals.length === 0 ? (
        <div className="glass-card" style={{ padding: "40px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", color: "var(--text-secondary)", marginBottom: "12px" }}>
            <Trophy size={40} style={{ opacity: 0.35 }} />
          </div>
          <h4 style={{ margin: 0, color: "var(--primary-dark)", fontWeight: 700 }}>No Achieved IEP Goals Yet</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "6px 0 0" }}>
            When the Therapist marks this student&apos;s IEP goals as &quot;Achieved&quot; in the IEP Builder, they will appear here as the student&apos;s official mastery history.
          </p>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: "16px 20px" }}>
          <button
            onClick={() => setShowHistory((v) => !v)}
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
              Achieved Goals History ({achievedGoals.length})
            </span>
            {showHistory ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {showHistory && (
            <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {achievedGoals.map((ag) => (
                <div
                  key={ag.id}
                  style={{
                    background: "rgba(16,185,129,0.06)",
                    border: "1px solid rgba(16,185,129,0.2)",
                    borderRadius: "8px",
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                  }}
                >
                  <Trophy size={20} style={{ color: "#10b981", flexShrink: 0, marginTop: "2px" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.92rem" }}>
                      {ag.title}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "3px" }}>
                      {ag.goalArea || "General"} &nbsp;·&nbsp; Achieved on{" "}
                      {ag.achievedAt ? new Date(ag.achievedAt).toLocaleDateString() : "—"}
                    </div>

                    {/* Milestones list if defined */}
                    {Array.isArray(ag.milestones) && ag.milestones.length > 0 && (
                      <div
                        style={{
                          marginTop: "10px",
                          background: "rgba(255,255,255,0.7)",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          border: "1px solid rgba(16,185,129,0.15)",
                        }}
                      >
                        <div style={{ fontSize: "0.73rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase" }}>
                          Milestones Met:
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {ag.milestones.map((m) => (
                            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "var(--text-primary)" }}>
                              <span>✅</span>
                              <span>{m.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <span
                    className="chip"
                    style={{
                      marginLeft: "auto",
                      background: "rgba(16,185,129,0.15)",
                      color: "#065f46",
                      fontWeight: 700,
                      fontSize: "0.75rem",
                      flexShrink: 0,
                    }}
                  >
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

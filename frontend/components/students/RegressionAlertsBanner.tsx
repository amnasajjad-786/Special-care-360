"use client";

import { useEffect, useState } from "react";
import { regressionDb, RegressionAlertDoc } from "@/lib/firestore-api";
import { AlertTriangle, TrendingDown, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";

interface Props {
  centerId: string;
  /** If provided, only show alerts for this student */
  studentId?: string;
}

export default function RegressionAlertsBanner({ centerId, studentId }: Props) {
  const [alerts, setAlerts] = useState<RegressionAlertDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const fetch = studentId
      ? regressionDb.listForStudent(studentId, centerId)
      : regressionDb.listUnresolved(centerId);

    fetch
      .then((data) => setAlerts(studentId ? data.filter((a) => !a.resolved) : data))
      .catch((err) => console.error("Failed to load regression alerts:", err))
      .finally(() => setLoading(false));
  }, [centerId, studentId]);

  const handleResolve = async (alertId: string) => {
    setResolving(alertId);
    try {
      await regressionDb.resolve(alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      toast.success("Alert marked as resolved.");
    } catch {
      toast.error("Failed to resolve alert.");
    } finally {
      setResolving(null);
    }
  };

  if (loading || alerts.length === 0) return null;

  const warnings = alerts.filter((a) => a.alertLevel === "Regression Warning");
  const monitoring = alerts.filter((a) => a.alertLevel === "Monitoring");

  return (
    <div
      style={{
        marginBottom: "16px",
        border: `2px solid ${warnings.length > 0 ? "var(--danger)" : "#f59e0b"}`,
        borderRadius: "12px",
        overflow: "hidden",
        background: warnings.length > 0 ? "rgba(239,68,68,0.04)" : "rgba(245,158,11,0.04)",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: warnings.length > 0 ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
          border: "none",
          cursor: "pointer",
          justifyContent: "space-between",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 800, color: warnings.length > 0 ? "var(--danger)" : "#92400e", fontSize: "0.9rem" }}>
          <AlertTriangle size={17} />
          Early Regression Alert System
          {warnings.length > 0 && (
            <span style={{ background: "var(--danger)", color: "white", borderRadius: "999px", padding: "1px 8px", fontSize: "0.72rem", fontWeight: 700 }}>
              {warnings.length} Warning{warnings.length > 1 ? "s" : ""}
            </span>
          )}
          {monitoring.length > 0 && (
            <span style={{ background: "#f59e0b", color: "white", borderRadius: "999px", padding: "1px 8px", fontSize: "0.72rem", fontWeight: 700 }}>
              {monitoring.length} Monitoring
            </span>
          )}
        </span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {/* Alert rows */}
      {expanded && (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {alerts.map((alert) => {
            const isWarning = alert.alertLevel === "Regression Warning";
            return (
              <div
                key={alert.id}
                style={{
                  background: "white",
                  border: `1px solid ${isWarning ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)"}`,
                  borderRadius: "8px",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                }}
              >
                <TrendingDown
                  size={20}
                  style={{ color: isWarning ? "var(--danger)" : "#f59e0b", flexShrink: 0, marginTop: "2px" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--primary-dark)" }}>
                      {alert.studentName}
                    </span>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "999px",
                        background: isWarning ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
                        color: isWarning ? "var(--danger)" : "#92400e",
                      }}
                    >
                      {alert.alertLevel}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "3px" }}>
                    Skill: <strong style={{ color: "var(--text-primary)" }}>&quot;{alert.goalTitle}&quot;</strong>
                    {alert.milestoneDescription && (
                      <span style={{ marginLeft: "6px", color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                        (Milestone: {alert.milestoneDescription})
                      </span>
                    )}
                  </div>
                  {alert.triggeredBy === "milestone_log" ? (
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "3px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      <span>Previous Mastery: <strong style={{ color: "var(--success)" }}>Achieved / Mastered {alert.previousMasteryDate ? `(${new Date(alert.previousMasteryDate).toLocaleDateString()})` : ""}</strong></span>
                      <span>Current Status: <strong style={{ color: isWarning ? "var(--danger)" : "#d97706" }}>{alert.currentObservationStatus || "Failed/Declined"}</strong></span>
                      <span>Change: <strong style={{ color: isWarning ? "var(--danger)" : "#d97706" }}>Declined</strong></span>
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "3px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      <span>Previous: <strong>{alert.previousProgress}%</strong></span>
                      <span>Current: <strong style={{ color: isWarning ? "var(--danger)" : "#d97706" }}>{alert.currentProgress}%</strong></span>
                      <span>Change: <strong style={{ color: isWarning ? "var(--danger)" : "#d97706" }}>↓{alert.decline}%</strong></span>
                    </div>
                  )}
                  {alert.reason && (
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "4px", background: "rgba(0,0,0,0.03)", padding: "4px 8px", borderRadius: "4px" }}>
                      Reason: <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{alert.reason}</span>
                    </div>
                  )}
                  {typeof alert.createdAt === "string" && (
                    <div style={{ fontSize: "0.73rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                      Detected: {new Date(alert.createdAt).toLocaleString()}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleResolve(alert.id)}
                  disabled={resolving === alert.id}
                  style={{
                    background: "none",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    padding: "5px 10px",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    color: "#6b7280",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                  title="Mark as resolved"
                >
                  <CheckCircle size={13} />
                  {resolving === alert.id ? "..." : "Resolve"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

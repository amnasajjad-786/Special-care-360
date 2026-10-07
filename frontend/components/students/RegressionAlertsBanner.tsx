"use client";

import { useEffect, useState } from "react";
import { regressionDb, RegressionAlertDoc } from "@/lib/firestore-api";
import {
  AlertTriangle,
  TrendingDown,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  User,
  Activity,
  Calendar,
  ArrowDownRight,
  ClipboardCheck,
} from "lucide-react";
import toast from "react-hot-toast";

interface Props {
  centerId: string;
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

  const isWarningBanner = warnings.length > 0;

  return (
    <div
      style={{
        marginBottom: "16px",
        border: `2px solid ${isWarningBanner ? "#ef4444" : "#f59e0b"}`,
        borderRadius: "12px",
        overflow: "hidden",
        background: isWarningBanner ? "rgba(239,68,68,0.03)" : "rgba(245,158,11,0.03)",
      }}
    >
      {/* ── Banner Header ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: isWarningBanner ? "rgba(239,68,68,0.09)" : "rgba(245,158,11,0.09)",
          border: "none",
          cursor: "pointer",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontWeight: 800,
            color: isWarningBanner ? "#b91c1c" : "#92400e",
            fontSize: "0.9rem",
          }}
        >
          <AlertTriangle size={17} />
          Early Regression Alert System
          {warnings.length > 0 && (
            <span
              style={{
                background: "#ef4444",
                color: "white",
                borderRadius: "999px",
                padding: "1px 10px",
                fontSize: "0.72rem",
                fontWeight: 700,
              }}
            >
              {warnings.length} Regression Warning{warnings.length > 1 ? "s" : ""}
            </span>
          )}
          {monitoring.length > 0 && (
            <span
              style={{
                background: "#f59e0b",
                color: "white",
                borderRadius: "999px",
                padding: "1px 10px",
                fontSize: "0.72rem",
                fontWeight: 700,
              }}
            >
              {monitoring.length} Monitoring
            </span>
          )}
        </span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {/* ── Alert Cards ───────────────────────────────────────────────────── */}
      {expanded && (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {alerts.map((alert) => {
            const isWarning = alert.alertLevel === "Regression Warning";
            const accentColor = isWarning ? "#ef4444" : "#f59e0b";
            const accentBg = isWarning ? "rgba(239,68,68,0.07)" : "rgba(245,158,11,0.07)";
            const accentBorder = isWarning ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)";

            const prevPct = alert.previousProgress ?? 100;
            const currPct = alert.currentProgress ?? 20;
            const changePct = prevPct - currPct;

            const alertDate =
              alert.createdAt && typeof alert.createdAt === "string"
                ? new Date(alert.createdAt).toLocaleDateString("en-US", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "—";

            return (
              <div
                key={alert.id}
                style={{
                  background: "white",
                  border: `1.5px solid ${accentBorder}`,
                  borderRadius: "10px",
                  overflow: "hidden",
                }}
              >
                {/* Card Header */}
                <div
                  style={{
                    background: accentBg,
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: `1px solid ${accentBorder}`,
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <TrendingDown size={16} style={{ color: accentColor }} />
                    <span style={{ fontWeight: 800, fontSize: "0.88rem", color: "#1e293b" }}>
                      {isWarning ? "⚠️ Regression Warning" : "📋 Monitoring — Possible Regression"}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: "999px",
                      background: isWarning ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                      color: accentColor,
                    }}
                  >
                    {isWarning ? "Therapist Review Required" : "Under Observation"}
                  </span>
                </div>

                {/* Card Body */}
                <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>

                  {/* Row 1: Student + Skill */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <User size={14} style={{ color: "#64748b", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>Student</div>
                        <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#0f172a" }}>{alert.studentName}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Activity size={14} style={{ color: "#64748b", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>Skill / Goal</div>
                        <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#0f172a" }}>{alert.goalTitle}</div>
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Progress Comparison */}
                  <div
                    style={{
                      background: "rgba(0,0,0,0.025)",
                      border: "1px solid rgba(0,0,0,0.06)",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      display: "grid",
                      gridTemplateColumns: "1fr auto 1fr auto 1fr",
                      alignItems: "center",
                      gap: "8px",
                      textAlign: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.68rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: "3px" }}>
                        Previous Mastered Level
                      </div>
                      <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#10b981" }}>{prevPct}%</div>
                      <div style={{ fontSize: "0.68rem", color: "#10b981", fontWeight: 600 }}>IEP Baseline</div>
                    </div>

                    <ArrowDownRight size={22} style={{ color: accentColor, flexShrink: 0 }} />

                    <div>
                      <div style={{ fontSize: "0.68rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: "3px" }}>
                        Current Teacher Log
                      </div>
                      <div style={{ fontSize: "1.4rem", fontWeight: 800, color: accentColor }}>{currPct}%</div>
                      <div style={{ fontSize: "0.68rem", color: accentColor, fontWeight: 600 }}>
                        {alert.currentObservationStatus || "Skill Loss"}
                      </div>
                    </div>

                    <div style={{ width: "1px", height: "40px", background: "rgba(0,0,0,0.08)" }} />

                    <div>
                      <div style={{ fontSize: "0.68rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: "3px" }}>
                        Change
                      </div>
                      <div style={{ fontSize: "1.4rem", fontWeight: 800, color: accentColor }}>
                        ↓{changePct}%
                      </div>
                      <div
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          color: isWarning ? "#b91c1c" : "#92400e",
                        }}
                      >
                        {isWarning ? "Regression Detected" : "Monitoring"}
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Status + Date */}
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <ClipboardCheck size={13} style={{ color: "#64748b" }} />
                      <span style={{ fontSize: "0.78rem", color: "#475569" }}>
                        Status:{" "}
                        <strong style={{ color: accentColor }}>
                          {isWarning ? "Regression Detected" : "Flagged for Monitoring"}
                        </strong>
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Calendar size={13} style={{ color: "#64748b" }} />
                      <span style={{ fontSize: "0.78rem", color: "#475569" }}>
                        Date: <strong style={{ color: "#0f172a" }}>{alertDate}</strong>
                      </span>
                    </div>
                    {alert.observedByName && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <User size={13} style={{ color: "#64748b" }} />
                        <span style={{ fontSize: "0.78rem", color: "#475569" }}>
                          Logged by: <strong style={{ color: "#0f172a" }}>{alert.observedByName}</strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Row 4: Reason */}
                  {alert.reason && (
                    <div
                      style={{
                        background: accentBg,
                        border: `1px solid ${accentBorder}`,
                        borderRadius: "6px",
                        padding: "8px 12px",
                        fontSize: "0.78rem",
                        color: "#334155",
                        lineHeight: 1.5,
                      }}
                    >
                      <span style={{ fontWeight: 700, color: accentColor }}>Reason: </span>
                      {alert.reason}
                    </div>
                  )}

                  {/* Row 5: Action + Resolve */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        color: accentColor,
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <AlertTriangle size={13} />
                      {isWarning
                        ? "Action: Therapist Review Required"
                        : "Action: Continue Monitoring — Another decline triggers Warning"}
                    </div>

                    <button
                      onClick={() => handleResolve(alert.id)}
                      disabled={resolving === alert.id}
                      style={{
                        background: "none",
                        border: "1px solid #d1d5db",
                        borderRadius: "6px",
                        padding: "5px 12px",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        color: "#6b7280",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        whiteSpace: "nowrap",
                      }}
                      title="Mark as resolved"
                    >
                      <CheckCircle size={13} />
                      {resolving === alert.id ? "Resolving..." : "Mark Resolved"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

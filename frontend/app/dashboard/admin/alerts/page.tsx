"use client";
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { panicDb, studentsDb } from "@/lib/firestore-api";
import { PanicAlert } from "@/types";
import { useAuth } from "@/lib/auth-context";
import toast from "react-hot-toast";
import { Zap, Frown, HeartPulse, AlertTriangle, AlertOctagon, CheckCircle, MapPin } from "lucide-react";

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AlertsPage() {
  const { profile } = useAuth();
  const [alerts, setAlerts] = useState<PanicAlert[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");

  // Load student names for display
  useEffect(() => {
    if (!profile) return;
    studentsDb.list(profile.centerId ?? "center-001").then((students) => {
      const map: Record<string, string> = {};
      students.forEach((s) => { map[s.id] = s.name; });
      setStudentNames(map);
    });
  }, [profile]);

  // Real-time Firestore listener
  useEffect(() => {
    if (!profile) return;
    const centerId = profile.centerId ?? "center-001";
    try {
      const q = query(
        collection(db, "panicAlerts"),
        where("centerId", "==", centerId),
        orderBy("timestamp", "desc")
      );
      const unsub = onSnapshot(q, (snap) => {
        setAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() } as PanicAlert)));
      }, (err) => {
        console.error("Failed to load alerts:", err);
        toast.error("Failed to load alerts");
      });
      return unsub;
    } catch (err) {
      console.error(err);
    }
  }, [profile]);

  const handleResolve = async (alertId: string) => {
    setResolving(alertId);
    try {
      await panicDb.resolveAlert(alertId, profile?.uid || "admin");
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: "resolved", resolvedAt: new Date().toISOString(), resolvedBy: profile?.uid || "admin" } : a));
      toast.success("Alert marked as resolved");
    } catch (err) {
      console.error(err);
      toast.error("Failed to resolve alert");
    }
    setResolving(null);
  };

  const filtered = alerts.filter(a => filter === "all" ? true : a.status === filter);
  const activeCount = alerts.filter(a => a.status === "active").length;

  const EMERGENCY_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
    Seizure: Zap,
    "Severe Meltdown": Frown,
    "Self-Injury": HeartPulse,
    "Aggressive Behavior": AlertTriangle,
    "Medical Emergency": HeartPulse,
    Other: AlertOctagon,
  };

  return (
    <div>
      {/* Active alert banner */}
      {activeCount > 0 && (
        <div style={{ padding: "16px 20px", borderRadius: "12px", background: "rgba(229,62,62,0.1)", border: "2px solid rgba(229,62,62,0.35)", marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px", animation: "pulse-ring 2s infinite" }}>
          <span style={{ display: "inline-flex", color: "var(--danger)" }}><AlertOctagon size={28} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: "var(--danger)", fontSize: "1rem" }}>
              {activeCount} Active Emergency Alert{activeCount > 1 ? "s" : ""}
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>Respond immediately — students need assistance</div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div className="tab-bar">
          {(["all", "active", "resolved"] as const).map(f => (
            <button key={f} className={`tab-item ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)} style={{ textTransform: "capitalize", position: "relative" }}>
              {f}
              {f === "active" && activeCount > 0 && (
                <span style={{ marginLeft: "6px", background: "var(--danger)", color: "white", borderRadius: "999px", padding: "1px 6px", fontSize: "0.68rem", fontWeight: 700 }}>{activeCount}</span>
              )}
            </button>
          ))}
        </div>
        <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{filtered.length} alert{filtered.length !== 1 ? "s" : ""}</div>
      </div>

      {/* Alert cards */}
      {filtered.length === 0 ? (
        <div className="glass-card" style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", color: "var(--success)", marginBottom: "16px" }}><CheckCircle size={52} /></div>
          <h2 style={{ margin: 0, color: "var(--primary-dark)" }}>No {filter !== "all" ? filter : ""} alerts</h2>
          <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>Everything is calm right now.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {filtered.map(alert => {
            const isActive = alert.status === "active";
            return (
              <div
                key={alert.id}
                className="glass-card animate-fade-in"
                style={{
                  padding: "24px",
                  border: isActive ? "2px solid rgba(229,62,62,0.4)" : "2px solid rgba(0,0,0,0.05)",
                  background: isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                  {/* Icon */}
                  <div style={{
                    width: "52px", height: "52px", borderRadius: "50%", flexShrink: 0,
                    background: isActive ? "rgba(229,62,62,0.1)" : "rgba(0,0,0,0.06)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "22px",
                  }}>
                    {(() => {
                      const IconComp = EMERGENCY_ICONS[alert.emergencyType] || AlertOctagon;
                      return <IconComp size={24} style={{ color: isActive ? "var(--danger)" : "var(--text-secondary)" }} />;
                    })()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800, fontSize: "1rem", color: isActive ? "var(--danger)" : "var(--text-primary)" }}>
                        {alert.emergencyType}
                      </span>
                      <span className={`chip ${isActive ? "chip-danger" : "chip-gray"}`}>
                        {isActive ? "ACTIVE" : "Resolved"}
                      </span>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginLeft: "auto" }}>
                        {timeAgo(alert.timestamp)}
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                      <div>
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Student</div>
                        <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text-primary)" }}>{studentNames[alert.studentId] || alert.studentId}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Location</div>
                        <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "4px" }}><MapPin size={14} style={{ color: "var(--text-secondary)" }} /> {alert.location}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Reported By</div>
                        <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text-primary)" }}>{alert.reportedBy.name}</div>
                      </div>
                    </div>

                    {alert.description && (
                      <p style={{ margin: "0 0 10px", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{alert.description}</p>
                    )}

                    {!isActive && alert.resolvedAt && (
                      <div style={{ fontSize: "0.78rem", color: "var(--success)", fontWeight: 600 }}>
                        Resolved {timeAgo(alert.resolvedAt)}
                      </div>
                    )}
                  </div>

                  {isActive && (
                    <button
                      id={`resolve-${alert.id}`}
                      className="btn-primary"
                      disabled={resolving === alert.id}
                      onClick={() => handleResolve(alert.id)}
                      style={{ flexShrink: 0, padding: "10px 18px", fontSize: "0.85rem" }}
                    >
                      {resolving === alert.id ? "Resolving…" : "Mark Resolved"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

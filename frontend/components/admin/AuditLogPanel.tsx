"use client";

/**
 * Admin view of the centre's append-only audit trail (WBS 2.4.3).
 * Shows who viewed or changed which record, when, and from where.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import { listAuditEntries, type AuditEntry } from "@/lib/audit";
import { downloadCsv } from "@/lib/workflow-state";

const CATEGORIES: { id: string; label: string; match: (action: string) => boolean }[] = [
  { id: "", label: "All activity", match: () => true },
  { id: "view", label: "Record views", match: (a) => a.startsWith("student.view") },
  { id: "student", label: "Student & medical changes", match: (a) => /^(student\.(create|update|archive)|medical\.|careplan\.)/.test(a) },
  { id: "care", label: "Daily care, ABC & observations", match: (a) => /^(dailycare|abc|observation)\./.test(a) },
  { id: "clinical", label: "IEP, regression & therapy", match: (a) => /^(iep|regression|therapy|teletherapy|homeplan|video)\./.test(a) },
  { id: "safety", label: "Emergency alerts", match: (a) => a.startsWith("panic.") },
  { id: "accounts", label: "Accounts & staff", match: (a) => /^(user|staff|auth)\./.test(a) },
  { id: "finance", label: "Fees & payments", match: (a) => /^(invoice|payment|fees)\./.test(a) },
  { id: "documents", label: "Documents & messages", match: (a) => /^(document|message)\./.test(a) },
];

function when(entry: AuditEntry): Date | null {
  return entry.at && typeof entry.at.toDate === "function" ? entry.at.toDate() : null;
}

export default function AuditLogPanel({ centerId }: { centerId: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [actor, setActor] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries(await listAuditEntries(centerId));
    } catch (err) {
      console.error("[audit] load failed:", err);
      setError("The audit log could not be loaded. Check your connection and that the Firestore rules and indexes are deployed.");
    }
  }, [centerId]);

  useEffect(() => {
    // One fetch on open; the Refresh button reloads. A live listener is not
    // needed for a log reviewed after the fact.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const actors = useMemo(() => [...new Map((entries ?? []).map((e) => [e.actorUid, `${e.actorName || "Unknown"} (${e.actorRole})`])).entries()], [entries]);
  const shown = useMemo(() => {
    const matcher = CATEGORIES.find((c) => c.id === category)?.match ?? (() => true);
    const needle = search.trim().toLowerCase();
    return (entries ?? []).filter((e) =>
      matcher(e.action)
      && (!actor || e.actorUid === actor)
      && (!needle || `${e.summary} ${e.action} ${e.actorName} ${e.targetId}`.toLowerCase().includes(needle)));
  }, [entries, category, actor, search]);

  const exportCsv = () => {
    downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["When", "Actor", "Role", "Action", "Target type", "Target id", "Student id", "Summary", "Source"],
      ...shown.map((e) => [when(e)?.toISOString() ?? "", e.actorName, e.actorRole, e.action, e.targetType, e.targetId, e.studentId ?? "", e.summary, e.source]),
    ]);
  };

  return (
    <div className="glass-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontWeight: 700, color: "var(--primary-dark)", display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={18} /> Audit log
        </h3>
        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Append-only record of who viewed or changed what. Entries cannot be edited or deleted.</span>
        <div style={{ flex: 1 }} />
        <button className="btn-ghost" onClick={() => void load()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px" }}>
          <RefreshCw size={14} /> Refresh
        </button>
        <button className="btn-ghost" onClick={exportCsv} disabled={!shown.length} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px" }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <select className="glass-input" style={{ maxWidth: 260 }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Activity type">
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select className="glass-input" style={{ maxWidth: 260 }} value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Person">
          <option value="">Everyone</option>
          {actors.map(([uid, label]) => <option key={uid} value={uid}>{label}</option>)}
        </select>
        <input className="glass-input" style={{ maxWidth: 280 }} placeholder="Search summary, action or record id" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error ? (
        <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
      ) : entries === null ? (
        <div className="skeleton" style={{ height: 160, borderRadius: 8 }} />
      ) : shown.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>{entries.length === 0 ? "No audit entries recorded yet." : "No entries match these filters."}</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Summary</th><th>Record</th></tr></thead>
            <tbody>
              {shown.map((e) => {
                const at = when(e);
                return (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>{at ? at.toLocaleString() : "Pending"}</td>
                    <td style={{ fontSize: "0.82rem" }}>{e.actorName || "Unknown"}<div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{e.actorRole}{e.source === "api" ? " · server" : ""}</div></td>
                    <td><span className="chip chip-info" style={{ fontSize: "0.7rem" }}>{e.action}</span></td>
                    <td style={{ fontSize: "0.82rem" }}>{e.summary}</td>
                    <td style={{ fontSize: "0.72rem", color: "var(--text-secondary)", wordBreak: "break-all" }}>{e.targetType}{e.targetId ? ` · ${e.targetId}` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "10px 0 0" }}>Showing {shown.length} of the latest {entries.length} entries.</p>
        </div>
      )}
    </div>
  );
}

"use client";
import { PatternAnalysis } from "@/types";

interface Props { patterns: PatternAnalysis | null; }

const IMPACT_COLORS = ["", "var(--success)", "var(--accent-teal)", "var(--warning)", "var(--accent-coral)", "var(--danger)"];
const IMPACT_LABELS = ["", "Very Low", "Low", "Moderate", "High", "Severe"];

export default function PatternTable({ patterns }: Props) {
  if (!patterns) return (
    <div className="glass-card" style={{ padding: "20px" }}>
      <div className="skeleton" style={{ height: "180px", borderRadius: "8px" }} />
    </div>
  );

  const rows = patterns.topAntecedents.map((ant, i) => ({
    trigger: ant.tag,
    frequency: ant.count,
    behavior: patterns.topBehaviors[i]?.tag || "—",
    impact: Math.min(5, Math.round(patterns.avgSeverity)),
  }));

  return (
    <div className="glass-card" style={{ padding: "20px" }}>
      <h3 style={{ margin: "0 0 16px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem" }}>📋 Pattern Analysis</h3>
      {rows.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", textAlign: "center", padding: "20px 0" }}>No patterns detected yet</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Trigger</th>
                <th>Frequency</th>
                <th>Associated Behavior</th>
                <th>Impact Level</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{row.trigger}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ height: "6px", width: `${Math.min(100, row.frequency * 20)}px`, background: "var(--accent-coral)", borderRadius: "3px" }} />
                      <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{row.frequency}x</span>
                    </div>
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>{row.behavior}</td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 700, background: `${IMPACT_COLORS[row.impact]}18`, color: IMPACT_COLORS[row.impact] }}>
                      {Array.from({ length: row.impact }).map((_, j) => "●").join("")} {IMPACT_LABELS[row.impact]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

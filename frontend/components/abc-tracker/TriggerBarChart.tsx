"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { PatternAnalysis } from "@/types";
import { Target } from "lucide-react";

interface Props { patterns: PatternAnalysis | null; }

export default function TriggerBarChart({ patterns }: Props) {
  if (!patterns) return <div className="glass-card" style={{ padding: "20px", height: "220px" }}><div className="skeleton" style={{ height: "100%", borderRadius: "8px" }} /></div>;

  const data = patterns.topAntecedents.map((a, i) => ({
    name: a.tag.length > 14 ? a.tag.slice(0, 14) + "…" : a.tag,
    fullName: a.tag,
    count: a.count,
    color: ["var(--accent-coral)", "var(--accent-lavender)", "var(--accent-teal)", "var(--accent-purple-soft)", "#f6ad55"][i % 5],
  }));

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: { fullName: string; count: number } }[] }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.6)", borderRadius: "10px", padding: "10px 14px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
        <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)" }}>{d.fullName}</div>
        <div style={{ fontSize: "0.82rem", color: "var(--accent-coral)", fontWeight: 600, marginTop: "4px" }}>{d.count} occurrences</div>
      </div>
    );
  };

  return (
    <div className="glass-card" style={{ padding: "20px" }}>
      <h3 style={{ margin: "0 0 4px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "8px" }}>
        <Target size={18} /> Trigger Frequency
      </h3>
      <p style={{ margin: "0 0 14px", fontSize: "0.78rem", color: "var(--text-secondary)" }}>Top antecedents triggering incidents</p>
      {data.length === 0 ? (
        <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "0.85rem" }}>No trigger data yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 20 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} angle={-20} textAnchor="end" />
            <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Occurrences">
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

"use client";
import { ABCIncident } from "@/types";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Legend } from "recharts";
import { format, parseISO } from "date-fns";

interface Props { incidents: ABCIncident[]; }

export default function TrendChart({ incidents }: Props) {
  // Group by date
  const byDate: Record<string, { count: number; avgSev: number; totalSev: number }> = {};
  incidents.forEach(inc => {
    const d = inc.timestamp.split("T")[0];
    if (!byDate[d]) byDate[d] = { count: 0, avgSev: 0, totalSev: 0 };
    byDate[d].count += 1;
    byDate[d].totalSev += inc.severity;
    byDate[d].avgSev = byDate[d].totalSev / byDate[d].count;
  });

  const chartData = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date: format(parseISO(date), "MMM d"),
      incidents: data.count,
      avgSeverity: Math.round(data.avgSev * 10) / 10,
    }));

  const avgCount = chartData.length ? (chartData.reduce((sum, d) => sum + d.incidents, 0) / chartData.length) : 0;

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.6)", borderRadius: "10px", padding: "10px 14px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
        <div style={{ fontWeight: 700, marginBottom: "6px", fontSize: "0.82rem", color: "var(--text-secondary)" }}>{label}</div>
        {payload.map(p => (
          <div key={p.name} style={{ fontSize: "0.88rem", color: p.color, fontWeight: 600 }}>{p.name}: {p.value}</div>
        ))}
      </div>
    );
  };

  return (
    <div className="glass-card" style={{ padding: "20px" }}>
      <h3 style={{ margin: "0 0 4px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem" }}>📈 Trend Frequency</h3>
      <p style={{ margin: "0 0 16px", fontSize: "0.78rem", color: "var(--text-secondary)" }}>Daily incident count & severity over time</p>
      {chartData.length === 0 ? (
        <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "0.85rem" }}>No data yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} />
            <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: "0.8rem" }} />
            <ReferenceLine y={avgCount} stroke="rgba(123,196,196,0.5)" strokeDasharray="4 4" label={{ value: "Avg", position: "right", fontSize: 10, fill: "var(--accent-teal)" }} />
            <Line type="monotone" dataKey="incidents" stroke="var(--accent-purple-soft)" strokeWidth={2.5} dot={{ r: 4, fill: "var(--accent-purple-soft)" }} name="Incidents" activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="avgSeverity" stroke="var(--accent-teal)" strokeWidth={2} dot={{ r: 3, fill: "var(--accent-teal)" }} name="Avg Severity" strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

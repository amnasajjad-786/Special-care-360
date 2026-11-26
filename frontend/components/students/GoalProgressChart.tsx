"use client";

/**
 * Longitudinal skill progress per IEP goal (WBS 3.5.3 / FP #17).
 *
 * Plots each recorded observation for the selected goal. A measured mastery
 * percentage is plotted as recorded. Older, category-only observations have
 * no measurement, so they are drawn at their category's level and labelled
 * as estimates in the tooltip — never presented as measured values.
 */

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import type { MilestoneObservationDoc } from "@/lib/firestore-api";

export const MASTERY_THRESHOLD = 80;
const CATEGORY_SCORE: Record<string, number> = { Achieved: 100, "In Progress": 60, "Failed/Declined": 20 };

export function statusForPercent(percent: number): MilestoneObservationDoc["observedStatus"] {
  if (percent >= MASTERY_THRESHOLD) return "Achieved";
  if (percent >= 40) return "In Progress";
  return "Failed/Declined";
}

interface Point {
  at: number;
  label: string;
  score: number;
  measured: boolean;
  status: string;
  by: string;
}

export default function GoalProgressChart({
  observations,
  goals,
}: {
  observations: MilestoneObservationDoc[];
  goals: { id: string; title: string }[];
}) {
  const goalsWithData = useMemo(() => {
    const ids = new Set(observations.map((o) => o.goalId));
    const known = goals.filter((g) => ids.has(g.id));
    // Observations can outlive a goal's removal from the plan; keep them visible.
    for (const o of observations) {
      if (!known.some((g) => g.id === o.goalId)) known.push({ id: o.goalId, title: o.goalTitle || "Removed goal" });
    }
    return known;
  }, [observations, goals]);

  const [chosen, setChosen] = useState("");
  const goalId = goalsWithData.some((g) => g.id === chosen) ? chosen : goalsWithData[0]?.id ?? "";

  const points: Point[] = useMemo(() => observations
    .filter((o) => o.goalId === goalId)
    .map((o) => {
      const measured = typeof o.masteryPercent === "number";
      return {
        at: new Date(o.observedAt).getTime(),
        label: new Date(o.observedAt).toLocaleDateString(),
        score: measured ? (o.masteryPercent as number) : (o.progressScore ?? CATEGORY_SCORE[o.observedStatus] ?? 0),
        measured,
        status: o.observedStatus,
        by: o.observedByName,
      };
    })
    .filter((p) => !Number.isNaN(p.at))
    .sort((a, b) => a.at - b.at), [observations, goalId]);

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="glass-card" style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem", display: "flex", alignItems: "center", gap: 8 }}>
          <TrendingUp size={18} /> Skill progress over time
        </h3>
        {goalsWithData.length > 0 && (
          <select className="glass-input" style={{ maxWidth: 320 }} value={goalId} onChange={(e) => setChosen(e.target.value)} aria-label="Goal to chart">
            {goalsWithData.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        )}
      </div>

      {points.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          No progress observations recorded yet. Teachers record them from the Care Plan tab.
        </p>
      ) : (
        <>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(61,79,107,0.12)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fontSize: 11 }} unit="%" />
                <ReferenceLine y={MASTERY_THRESHOLD} stroke="var(--success)" strokeDasharray="4 4" label={{ value: `Mastery ${MASTERY_THRESHOLD}%`, fontSize: 11, position: "insideTopRight" }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as Point;
                    return (
                      <div className="glass-card" style={{ padding: "8px 10px", fontSize: "0.78rem" }}>
                        <div style={{ fontWeight: 700 }}>{p.label}</div>
                        <div>{p.measured ? `${p.score}% measured` : `${p.status} (category estimate, ${p.score}%)`}</div>
                        <div style={{ color: "var(--text-secondary)" }}>Recorded by {p.by}</div>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="score" stroke="var(--accent-teal)" strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 8 }}>
            <span>Observations: <strong style={{ color: "var(--text-primary)" }}>{points.length}</strong></span>
            <span>First: <strong style={{ color: "var(--text-primary)" }}>{first.score}%</strong> ({first.label})</span>
            <span>Latest: <strong style={{ color: "var(--text-primary)" }}>{last.score}%</strong> ({last.label})</span>
            {points.length > 1 && (
              <span>Change: <strong style={{ color: last.score >= first.score ? "var(--success)" : "var(--danger)" }}>{last.score - first.score >= 0 ? "+" : ""}{last.score - first.score} points</strong></span>
            )}
            {points.some((p) => !p.measured) && <span>Points without a measured percentage are category estimates.</span>}
          </div>
        </>
      )}
    </div>
  );
}

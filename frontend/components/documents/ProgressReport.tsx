"use client";

/**
 * Printable progress report for one child (Charter: "download progress
 * reports"). Compiled in the browser from records the viewer is already
 * allowed to read, then printed or saved as PDF through the browser's own
 * print dialog. Every figure is a count or value taken from saved records;
 * sections with no records say so rather than showing placeholder content.
 */

import { useEffect, useMemo, useState } from "react";
import { Printer, X } from "lucide-react";
import {
  abcDb, dailyCareDb, milestoneObservationsDb, scopeOf, studentsDb,
  type MilestoneObservationDoc, type StudentDoc,
} from "@/lib/firestore-api";
import type { IEPGoal } from "@/types";

type Profile = { uid?: string; role?: string; centerId?: string; name?: string } | null | undefined;
type Rec = Record<string, unknown>;

const PERIODS = [
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 180, label: "Last 6 months" },
];

interface ReportData {
  goals: IEPGoal[];
  achieved: IEPGoal[];
  observations: MilestoneObservationDoc[];
  incidents: Rec[];
  journals: Rec[];
  failed: string[];
}

function scoreOf(o: MilestoneObservationDoc): number {
  if (typeof o.masteryPercent === "number") return o.masteryPercent;
  if (typeof o.progressScore === "number") return o.progressScore;
  return { Achieved: 100, "In Progress": 60, "Failed/Declined": 20 }[o.observedStatus] ?? 0;
}

function tally(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export default function ProgressReport({ student, profile, onClose }: { student: StudentDoc; profile: Profile; onClose: () => void }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    const scope = scopeOf(profile);
    const failed: string[] = [];
    const guard = <T,>(label: string, work: Promise<T>, empty: T) =>
      work.catch((err) => { console.error(`[report] ${label} failed:`, err); failed.push(label); return empty; });
    Promise.all([
      guard("care plan", studentsDb.getCarePlan(student.id), { goals: [] } as Rec),
      guard("progress observations", milestoneObservationsDb.listForStudent(student.id, scope.centerId), [] as MilestoneObservationDoc[]),
      guard("behaviour incidents", abcDb.listIncidents(student.id, scope, 200) as Promise<Rec[]>, [] as Rec[]),
      guard("daily care journals", dailyCareDb.history(student.id, scope, 200) as Promise<Rec[]>, [] as Rec[]),
    ]).then(([plan, observations, incidents, journals]) => {
      setData({
        goals: ((plan.goals as IEPGoal[]) ?? []).filter((g) => g.status !== "Achieved"),
        achieved: (plan.achievedGoals as IEPGoal[]) ?? [],
        observations, incidents, journals, failed,
      });
    });
  }, [student.id, profile]);

  const since = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    return start;
  }, [days]);

  const view = useMemo(() => {
    if (!data) return null;
    const inPeriod = (value: unknown) => {
      const at = new Date(String(value ?? ""));
      return !Number.isNaN(at.getTime()) && at >= since;
    };
    const observations = data.observations.filter((o) => inPeriod(o.observedAt));
    const incidents = data.incidents.filter((i) => inPeriod(i.timestamp));
    const journals = data.journals.filter((j) => inPeriod(`${j.date}T12:00:00`));
    const byGoal = new Map<string, MilestoneObservationDoc[]>();
    [...observations].sort((a, b) => a.observedAt.localeCompare(b.observedAt)).forEach((o) => {
      byGoal.set(o.goalId, [...(byGoal.get(o.goalId) ?? []), o]);
    });
    const severities = incidents.map((i) => Number(i.severity)).filter((n) => n > 0);
    const moods = journals.flatMap((j) => ((j.moodTimeline as { mood?: string }[]) ?? []).map((m) => m.mood ?? "").filter(Boolean));
    const meals = journals.flatMap((j) => Object.values((j.meals as Record<string, { ate?: string }>) ?? {}).map((m) => m?.ate ?? "").filter((v) => v && v !== "not-recorded"));
    return {
      observations, incidents, journals, byGoal,
      avgSeverity: severities.length ? (severities.reduce((a, b) => a + b, 0) / severities.length).toFixed(1) : null,
      triggers: tally(incidents.flatMap((i) => ((i.antecedent as { tags?: string[] })?.tags ?? []))).slice(0, 5),
      behaviours: tally(incidents.flatMap((i) => ((i.behavior as { tags?: string[] })?.tags ?? []))).slice(0, 5),
      moods: tally(moods), meals: tally(meals),
    };
  }, [data, since]);

  const allGoals = data ? [...data.goals, ...data.achieved] : [];
  const generated = new Date();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-report, .print-report * { visibility: visible !important; }
          .print-report { position: absolute; inset: 0 auto auto 0; width: 100%; max-height: none !important; overflow: visible !important; box-shadow: none !important; }
          .no-print { display: none !important; }
        }
        .print-report h3 { font-size: 1rem; margin: 22px 0 8px; color: var(--primary-dark); border-bottom: 1px solid rgba(61,79,107,0.15); padding-bottom: 4px; }
        .print-report table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .print-report th, .print-report td { text-align: left; padding: 6px 8px; border-bottom: 1px solid rgba(61,79,107,0.08); vertical-align: top; }
      `}</style>
      <div className="modal-box print-report" style={{ width: "100%", maxWidth: 820, maxHeight: "90vh", overflowY: "auto", padding: 32 }} onClick={(e) => e.stopPropagation()}>
        <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <select className="glass-input" style={{ maxWidth: 200 }} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Report period">
            {PERIODS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <button className="btn-primary" disabled={!view} onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Printer size={15} /> Print / Save as PDF
          </button>
          <button className="btn-ghost" onClick={onClose} aria-label="Close report"><X size={16} /></button>
        </div>

        <h2 style={{ margin: 0, color: "var(--primary-dark)" }}>Progress report: {student.name}</h2>
        <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
          Special Care 360 · {since.toLocaleDateString()} to {generated.toLocaleDateString()} · generated {generated.toLocaleString()}{profile?.name ? ` by ${profile.name}` : ""}
        </p>
        {student.diagnosis ? <p style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>Diagnosis on file: {String(student.diagnosis)}</p> : null}

        {!view || !data ? (
          <div className="skeleton" style={{ height: 240, borderRadius: 10, marginTop: 20 }} />
        ) : (
          <>
            {data.failed.length > 0 && (
              <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: 14 }}>
                Some sections could not be loaded and are incomplete: {data.failed.join(", ")}.
              </p>
            )}

            <h3>IEP goals</h3>
            {allGoals.length === 0 ? <p>No IEP goals are recorded.</p> : (
              <table>
                <thead><tr><th>Goal</th><th>Status</th><th>Observations in period</th><th>First → latest</th></tr></thead>
                <tbody>
                  {allGoals.map((g) => {
                    const points = view.byGoal.get(g.id) ?? [];
                    return (
                      <tr key={g.id}>
                        <td>{g.title}{g.goalArea ? <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{g.goalArea}</div> : null}</td>
                        <td>{g.status === "Achieved" || data.achieved.includes(g) ? `Mastered${g.achievedAt ? ` ${new Date(g.achievedAt).toLocaleDateString()}` : ""}` : g.status}</td>
                        <td>{points.length}</td>
                        <td>{points.length ? `${scoreOf(points[0])}% → ${scoreOf(points[points.length - 1])}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              Percentages are measured mastery where recorded; observations logged only as a category are shown at that category&apos;s level (Achieved 100, In Progress 60, Not demonstrated 20).
            </p>

            <h3>Behaviour (ABC incidents)</h3>
            {view.incidents.length === 0 ? <p>No behaviour incidents recorded in this period.</p> : (
              <table>
                <tbody>
                  <tr><th>Incidents recorded</th><td>{view.incidents.length}</td></tr>
                  <tr><th>Average severity</th><td>{view.avgSeverity ?? "—"} / 5</td></tr>
                  <tr><th>Most recorded triggers</th><td>{view.triggers.map(([t, n]) => `${t} (${n})`).join(", ") || "None tagged"}</td></tr>
                  <tr><th>Most recorded behaviours</th><td>{view.behaviours.map(([t, n]) => `${t} (${n})`).join(", ") || "None tagged"}</td></tr>
                </tbody>
              </table>
            )}

            <h3>Daily care</h3>
            {view.journals.length === 0 ? <p>No daily care journals recorded in this period.</p> : (
              <table>
                <tbody>
                  <tr><th>Journals recorded</th><td>{view.journals.length}</td></tr>
                  <tr><th>Recorded moods</th><td>{view.moods.map(([m, n]) => `${m} (${n})`).join(", ") || "None recorded"}</td></tr>
                  <tr><th>Meals</th><td>{view.meals.map(([m, n]) => `${m} (${n})`).join(", ") || "None recorded"}</td></tr>
                </tbody>
              </table>
            )}

            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 24 }}>
              This report summarises records entered by the care team. It is not a clinical assessment. Discuss questions with the child&apos;s therapist.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

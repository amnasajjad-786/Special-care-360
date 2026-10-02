"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Clock, Pill } from "lucide-react";
import toast from "react-hot-toast";
import { Medication } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { studentsDb } from "@/lib/firestore-api";
import {
  medicationDb,
  currentCareDate,
  ScheduledMedicationDose,
} from "@/lib/medication-api";

interface Props {
  studentId: string;
  date: string;
}

const GRACE_MINUTES = 60;

export default function MedicationAdministration({ studentId, date }: Props) {
  const { profile } = useAuth();
  const [doses, setDoses] = useState<ScheduledMedicationDose[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingDose, setSavingDose] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => new Date());
  const canRecord = profile?.role === "teacher" || profile?.role === "admin";
  const isToday = date === currentCareDate();

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const [student, medical] = await Promise.all([
        studentsDb.get(studentId),
        studentsDb.getMedical(studentId),
      ]);
      const medications = (medical.medications ?? []) as Medication[];
      setDoses(student ? await medicationDb.loadDay(student, medications, date) : []);
      setLoadError(null);
    } catch (err) {
      console.error("Failed to load medication administration records:", err);
      if (!silent) toast.error("Medication records could not be loaded.");
      setLoadError("Medication records could not be loaded. Refresh or contact an administrator.");
      setDoses([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [studentId, date]);

  // The loader updates state after its Firestore requests settle.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!isToday) return;
    const timer = setInterval(() => { void load(true); }, 60000);
    return () => clearInterval(timer);
  }, [isToday, load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const recordDose = async (
    dose: ScheduledMedicationDose,
    status: "administered" | "not_administered"
  ) => {
    if (!profile || !canRecord || !isToday) return;
    const note = notes[dose.id]?.trim() ?? "";
    if (status === "not_administered" && !note) {
      toast.error("Add a reason before recording a dose that was not given.");
      return;
    }

    setSavingDose(dose.id);
    try {
      const student = await studentsDb.get(studentId);
      if (!student) throw new Error("Student no longer exists.");
      await medicationDb.record(student, dose, {
        status,
        userId: profile.uid,
        userName: profile.name,
        notes: note,
      });
      toast.success(status === "administered" ? "Dose recorded." : "Dose exception recorded.");
      await load();
    } catch (err) {
      console.error("Failed to record medication administration:", err);
      toast.error(err instanceof Error ? err.message : "Could not save the medication record.");
    } finally {
      setSavingDose(null);
    }
  };

  return (
    <section className="glass-card" aria-labelledby="medication-administration-heading" style={{ padding: "24px", marginBottom: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
        <Pill size={20} style={{ color: "var(--primary-dark)" }} />
        <h3 id="medication-administration-heading" style={{ margin: 0, color: "var(--primary-dark)", fontSize: "1.05rem" }}>
          Medication Administration
        </h3>
      </div>
      <p style={{ margin: "0 0 16px", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
        Scheduled doses and administration records for this student. Missed-dose alerts are sent to the parent and center admins after a 60-minute grace period.
      </p>

      {loading ? (
        <p role="status" style={{ color: "var(--text-secondary)", margin: 0 }}>Loading medication schedule…</p>
      ) : loadError ? (
        <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>{loadError}</p>
      ) : doses.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>No medication doses are scheduled for this date.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {doses.map((dose) => {
            const dueAt = new Date(`${dose.date}T${dose.time}:00+05:00`);
            const overdue = now.getTime() >= dueAt.getTime() + GRACE_MINUTES * 60000;
            const statusLabel = dose.status === "pending" && overdue
              ? "Awaiting missed-dose check"
              : dose.status.replace("_", " ");
            const statusClass = dose.status === "administered"
              ? "chip-success"
              : dose.status === "missed" || dose.status === "not_administered"
                ? "chip-danger"
                : overdue ? "chip-warning" : "chip-info";

            return (
              <article key={dose.id} style={{ padding: "14px", borderRadius: "12px", background: "rgba(255,255,255,0.55)", border: "1px solid rgba(61,79,107,0.1)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div>
                    <strong style={{ color: "var(--text-primary)" }}>{dose.medication.name}</strong>
                    <div style={{ marginTop: "4px", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                      {dose.medication.dosage} · Scheduled {dose.time}
                    </div>
                  </div>
                  <span className={`chip ${statusClass}`} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                    {dose.status === "administered" ? <CheckCircle size={13} /> :
                      dose.status === "missed" || dose.status === "not_administered" ? <AlertTriangle size={13} /> : <Clock size={13} />}
                    {statusLabel}
                  </span>
                </div>
                {dose.administeredByName && (
                  <p style={{ margin: "8px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    {dose.status === "administered" ? "Recorded by" : "Exception recorded by"} {dose.administeredByName}
                    {dose.notes ? ` · ${dose.notes}` : ""}
                  </p>
                )}
                {canRecord && isToday && dose.status !== "administered" && dose.status !== "not_administered" && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                    <input
                      className="glass-input"
                      aria-label={`Reason dose was not given: ${dose.medication.name} at ${dose.time}`}
                      placeholder="Reason if dose was not given"
                      value={notes[dose.id] ?? ""}
                      onChange={(e) => setNotes((current) => ({ ...current, [dose.id]: e.target.value }))}
                      style={{ flex: "1 1 220px" }}
                    />
                    <button type="button" className="btn-ghost" disabled={savingDose === dose.id} onClick={() => void recordDose(dose, "not_administered")}>
                      Not given
                    </button>
                    <button type="button" className="btn-primary" disabled={savingDose === dose.id} onClick={() => void recordDose(dose, "administered")}>
                      {savingDose === dose.id ? "Saving…" : "Record given"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

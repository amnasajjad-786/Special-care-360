"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { studentsDb, scopeOf, type StudentDoc } from "@/lib/firestore-api";
import {
  homePlanDb,
  computeAdherence,
  todayKey,
  type HomePlanActivity,
  type HomePlanLog,
} from "@/lib/teletherapy-api";
import ActivityThread from "@/components/home-plan/ActivityThread";
import toast from "react-hot-toast";
import {
  Home,
  Plus,
  Target,
  MessageSquare,
  Check,
  Archive,
  AlertTriangle,
  X,
} from "lucide-react";

export default function HomePlanPage() {
  const { profile } = useAuth();
  const scope = useMemo(() => scopeOf(profile), [profile]);
  const isParent = profile?.role === "parent";
  const canAssign = profile?.role === "therapist" || profile?.role === "admin";

  const [students, setStudents] = useState<StudentDoc[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [activities, setActivities] = useState<HomePlanActivity[]>([]);
  const [logs, setLogs] = useState<HomePlanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [threadFor, setThreadFor] = useState<HomePlanActivity | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    studentId: "",
    title: "",
    instructions: "",
    targetPerWeek: "3",
    linkedGoalTitle: "",
  });

  useEffect(() => {
    if (!profile) return;
    studentsDb
      .list(scope)
      .then((list) => {
        setStudents(list);
        if (list.length > 0) setSelectedStudentId((cur) => cur || list[0].id);
      })
      .catch((err) => {
        console.error("Failed to load students:", err);
        setLoadError(true);
      });
  }, [profile, scope]);

  const refresh = useCallback(async () => {
    if (!profile || !selectedStudentId) return;
    setLoading(true);
    try {
      const [acts, lgs] = await Promise.all([
        homePlanDb.listActivities(scope, selectedStudentId),
        homePlanDb.listLogs(scope, selectedStudentId),
      ]);
      setActivities(acts);
      setLogs(lgs);
      setLoadError(false);
    } catch (err) {
      console.error("Failed to load home plan:", err);
      setActivities([]);
      setLogs([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [profile, scope, selectedStudentId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await homePlanDb.assign({
        studentId: form.studentId,
        title: form.title,
        instructions: form.instructions,
        targetPerWeek: parseInt(form.targetPerWeek, 10),
        linkedGoalTitle: form.linkedGoalTitle,
        assignedBy: profile?.uid ?? "",
        assignedByName: profile?.name ?? "Therapist",
      });
      toast.success("Activity assigned. The family has been notified.");
      setShowAssign(false);
      setForm({ studentId: "", title: "", instructions: "", targetPerWeek: "3", linkedGoalTitle: "" });
      if (form.studentId === selectedStudentId) refresh();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not assign the activity.");
    } finally {
      setSaving(false);
    }
  };

  const toggleToday = async (activity: HomePlanActivity, completed: boolean, note: string) => {
    if (!profile) return;
    try {
      await homePlanDb.logDay({
        activity,
        date: todayKey(),
        completed,
        note,
        parentId: profile.uid,
      });
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error("Could not save today's log.");
    }
  };

  const handleArchive = async (activity: HomePlanActivity) => {
    try {
      await homePlanDb.setActive(activity.id, !activity.active);
      toast.success(activity.active ? "Activity archived." : "Activity reactivated.");
      refresh();
    } catch (err) {
      console.error(err);
      toast.error("Could not update the activity.");
    }
  };

  const visible = activities.filter((a) => (isParent ? a.active : true));

  return (
    <div className="animate-fade-in" style={{ paddingBottom: "40px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
        <div style={{ flex: 1, minWidth: "240px" }}>
          <h1 style={{ fontSize: "2rem", color: "var(--primary-dark)", fontWeight: 800, margin: 0 }}>
            Home Plan Bridge
          </h1>
          <p style={{ color: "var(--text-secondary)", margin: "4px 0 0", fontSize: "0.9rem" }}>
            {isParent
              ? "Activities to carry out at home. Tick each day you complete one and ask the therapist anything."
              : "Assign home activities and see how families are getting on between sessions."}
          </p>
        </div>
        {canAssign && (
          <button
            className="btn-primary"
            onClick={() => { setForm((f) => ({ ...f, studentId: selectedStudentId })); setShowAssign(true); }}
            style={{ padding: "11px 22px", display: "inline-flex", alignItems: "center", gap: "8px" }}
          >
            <Plus size={16} /> Assign activity
          </button>
        )}
      </div>

      {students.length > 1 && (
        <div className="glass-card" style={{ padding: "14px 18px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
            Student
          </label>
          <select
            className="glass-input"
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            style={{ minWidth: "200px" }}
          >
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {loadError && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", background: "rgba(229,62,62,0.08)", border: "1px solid rgba(229,62,62,0.25)", color: "var(--danger)", fontSize: "0.85rem", display: "flex", gap: "10px", alignItems: "center", marginBottom: "20px" }}>
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>The home plan could not be loaded, so this list may be incomplete. Please reload.</span>
        </div>
      )}

      {loading ? (
        <div className="glass-card" style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
          Loading home plan…
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-card" style={{ padding: "48px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", color: "var(--text-secondary)", marginBottom: "14px" }}>
            <Home size={44} />
          </div>
          <h3 style={{ margin: 0, color: "var(--primary-dark)" }}>No home activities yet</h3>
          <p style={{ color: "var(--text-secondary)", marginTop: "6px", fontSize: "0.88rem" }}>
            {canAssign
              ? "Assign an activity to bridge this child's care plan into the home."
              : "The therapist has not assigned any home activities yet."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {visible.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              logs={logs}
              isParent={isParent}
              canAssign={canAssign}
              onToggleToday={toggleToday}
              onOpenThread={() => setThreadFor(activity)}
              onArchive={() => handleArchive(activity)}
            />
          ))}
        </div>
      )}

      {/* Assign modal */}
      {showAssign && (
        <div className="modal-overlay" onClick={() => setShowAssign(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, flex: 1, color: "var(--primary-dark)", fontWeight: 700 }}>Assign a home activity</h3>
              <button onClick={() => setShowAssign(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAssign} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                Student
                <select className="glass-input" required value={form.studentId}
                  onChange={(e) => setForm({ ...form, studentId: e.target.value })} style={{ marginTop: "4px" }}>
                  <option value="">Select student…</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                Activity title
                <input className="glass-input" required placeholder="Bilateral hand exercise" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ marginTop: "4px" }} />
              </label>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                Instructions for the family
                <textarea className="glass-input" rows={4} value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  placeholder="Sit facing the child, hands on the table…" style={{ marginTop: "4px" }} />
              </label>
              <div style={{ display: "flex", gap: "10px" }}>
                <label style={{ flex: 1, fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Times per week
                  <input type="number" min={1} max={7} className="glass-input" value={form.targetPerWeek}
                    onChange={(e) => setForm({ ...form, targetPerWeek: e.target.value })} style={{ marginTop: "4px" }} />
                </label>
                <label style={{ flex: 2, fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Linked IEP goal (optional)
                  <input className="glass-input" placeholder="Improve motor skills" value={form.linkedGoalTitle}
                    onChange={(e) => setForm({ ...form, linkedGoalTitle: e.target.value })} style={{ marginTop: "4px" }} />
                </label>
              </div>
              <button type="submit" className="btn-primary" disabled={saving} style={{ padding: "12px", marginTop: "4px" }}>
                {saving ? "Assigning…" : "Assign activity"}
              </button>
            </form>
          </div>
        </div>
      )}

      {threadFor && (
        <ActivityThread activity={threadFor} onClose={() => setThreadFor(null)} />
      )}
    </div>
  );
}

function ActivityCard({
  activity, logs, isParent, canAssign, onToggleToday, onOpenThread, onArchive,
}: {
  activity: HomePlanActivity;
  logs: HomePlanLog[];
  isParent: boolean;
  canAssign: boolean;
  onToggleToday: (a: HomePlanActivity, completed: boolean, note: string) => void;
  onOpenThread: () => void;
  onArchive: () => void;
}) {
  const adherence = useMemo(() => computeAdherence(activity, logs), [activity, logs]);
  const today = todayKey();
  const todayLog = logs.find((l) => l.activityId === activity.id && l.date === today);
  const [note, setNote] = useState(todayLog?.note ?? "");

  useEffect(() => { setNote(todayLog?.note ?? ""); }, [todayLog?.note]);

  const barColor =
    adherence.percent >= 80 ? "var(--success)" :
    adherence.percent >= 40 ? "var(--warning)" : "var(--danger)";

  return (
    <div className="glass-card" style={{ padding: "20px", opacity: activity.active ? 1 : 0.6 }}>
      <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ padding: "10px", borderRadius: "10px", background: "rgba(155,142,196,0.16)", color: "var(--accent-purple)" }}>
          <Target size={20} />
        </div>
        <div style={{ flex: 1, minWidth: "220px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.98rem" }}>{activity.title}</span>
            {!activity.active && <span className="chip chip-gray">Archived</span>}
            <span className="chip chip-info">{activity.targetPerWeek}× / week</span>
          </div>
          {activity.linkedGoalTitle ? (
            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "3px" }}>
              Goal: {activity.linkedGoalTitle}
            </div>
          ) : null}
          {activity.instructions ? (
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.55 }}>
              {activity.instructions}
            </p>
          ) : null}
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "6px" }}>
            Assigned by {activity.assignedByName}
            {!isParent && ` · ${activity.studentName}`}
          </div>
        </div>

        {/* Adherence */}
        <div style={{ minWidth: "170px" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "5px" }}>
            Last 7 days
          </div>
          <div style={{ display: "flex", gap: "4px", marginBottom: "6px" }}>
            {adherence.recent.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.completed ? "done" : "not logged"}`}
                style={{
                  width: "16px", height: "22px", borderRadius: "4px",
                  background: d.completed ? "var(--success)" : "rgba(0,0,0,0.08)",
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: "0.78rem", color: barColor, fontWeight: 700 }}>
            {adherence.completed}/{adherence.expected} · {adherence.percent}%
          </div>
          {adherence.streak > 1 && (
            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
              {adherence.streak}-day streak
            </div>
          )}
        </div>
      </div>

      {/* Today's log — guardians only */}
      {isParent && activity.active && (
        <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            className={todayLog?.completed ? "btn-primary" : "btn-ghost"}
            onClick={() => onToggleToday(activity, !todayLog?.completed, note)}
            style={{ padding: "9px 18px", display: "inline-flex", alignItems: "center", gap: "7px" }}
          >
            <Check size={15} /> {todayLog?.completed ? "Done today" : "Mark done today"}
          </button>
          <input
            className="glass-input"
            placeholder="Add a note about today (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if ((todayLog?.note ?? "") !== note) {
                onToggleToday(activity, todayLog?.completed ?? false, note);
              }
            }}
            style={{ flex: 1, minWidth: "200px" }}
          />
        </div>
      )}

      <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button className="btn-ghost" onClick={onOpenThread} style={{ padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.82rem" }}>
          <MessageSquare size={14} /> Discussion
        </button>
        {canAssign && (
          <button className="btn-ghost" onClick={onArchive} style={{ padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.82rem" }}>
            <Archive size={14} /> {activity.active ? "Archive" : "Reactivate"}
          </button>
        )}
      </div>
    </div>
  );
}

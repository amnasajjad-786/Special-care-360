"use client";
import { useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { dailyCareDb } from "@/lib/firestore-api";
import { DailyCareJournal, MealStatus, MoodType, ActivityLevel } from "@/types";
import toast from "react-hot-toast";
import { 
  Smile, 
  Meh, 
  Frown, 
  Angry, 
  Moon, 
  Coffee, 
  Utensils, 
  Apple, 
  Sparkles, 
  Activity, 
  AlertTriangle, 
  FileText, 
  Check 
} from "lucide-react";

const MOODS_LIST: { value: MoodType; icon: React.ComponentType<{ size?: number; className?: string }>; label: string; color: string }[] = [
  { value: "happy",    icon: Smile, label: "Happy",    color: "#38a169" },
  { value: "neutral",  icon: Meh, label: "Neutral",  color: "#718096" },
  { value: "sad",      icon: Frown, label: "Sad",      color: "#3182ce" },
  { value: "agitated", icon: Angry, label: "Agitated", color: "#e53e3e" },
  { value: "tired",    icon: Moon, label: "Tired",    color: "#805ad5" },
];
const MOOD_SLOTS = ["Morning", "Midday", "After Lunch", "End of Day"];
const ATE_OPTIONS: { value: MealStatus; label: string }[] = [
  { value: "fully", label: "Fully" }, { value: "partially", label: "Partially" }, { value: "refused", label: "Refused" }
];
const ACTIVITY_OPTIONS: ActivityLevel[] = ["Active", "Moderate", "Low", "Bed Rest"];

const EMPTY_JOURNAL: Omit<DailyCareJournal, "studentId" | "date" | "submittedBy"> = {
  meals: {
    breakfast: { ate: "fully", notes: "" },
    lunch: { ate: "fully", notes: "" },
    snack: { ate: "fully", notes: "" },
  },
  hygiene: { teethBrushed: false, handsWashed: false, diaperAssisted: false, hairCombed: false },
  moodTimeline: MOOD_SLOTS.map(slot => ({ slot, mood: "neutral" as MoodType })),
  physicalActivity: "Moderate",
  activityNotes: "",
  incidents: "",
  teacherNotes: "",
};

interface Props { studentId: string; studentName: string; date: string; }

export default function JournalForm({ studentId, studentName, date }: Props) {
  const { profile } = useAuth();
  const [form, setForm] = useState(EMPTY_JOURNAL);
  const [saving, setSaving] = useState(false);

  const setMeal = (meal: "breakfast" | "lunch" | "snack", key: "ate" | "notes", value: string) =>
    setForm(f => ({ ...f, meals: { ...f.meals, [meal]: { ...f.meals[meal], [key]: value } } }));

  const setHygiene = (key: keyof typeof form.hygiene, val: boolean) =>
    setForm(f => ({ ...f, hygiene: { ...f.hygiene, [key]: val } }));

  const setMood = (slot: string, mood: MoodType) =>
    setForm(f => ({ ...f, moodTimeline: f.moodTimeline.map(m => m.slot === slot ? { ...m, mood } : m) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await dailyCareDb.submit(
        { studentId, date, ...form },
        profile?.uid ?? "unknown"
      );
      toast.success(`Journal submitted for ${studentName}!`, {
        icon: <Check size={18} style={{ color: "var(--success)" }} />
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit journal. Please try again.");
    }
    setSaving(false);
  };

  const MEAL_ICONS = { breakfast: Coffee, lunch: Utensils, snack: Apple };
  const ateColor = { fully: "var(--success)", partially: "var(--warning)", refused: "var(--danger)" };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* ── Meals ── */}
      <div className="glass-card" style={{ padding: "24px" }}>
        <h3 style={{ margin: "0 0 18px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><Utensils size={18} /> Meals</h3>
        {(["breakfast", "lunch", "snack"] as const).map(meal => (
          <div key={meal} style={{ marginBottom: "18px", paddingBottom: "18px", borderBottom: meal !== "snack" ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
              <span style={{ display: "inline-flex", color: "var(--text-secondary)" }}>
                {(() => {
                  const IconComp = MEAL_ICONS[meal];
                  return <IconComp size={18} />;
                })()}
              </span>
              <span style={{ fontWeight: 600, textTransform: "capitalize", color: "var(--text-primary)" }}>{meal}</span>
              <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
                {ATE_OPTIONS.map(opt => (
                  <button
                    key={opt.value} type="button"
                    onClick={() => setMeal(meal, "ate", opt.value)}
                    style={{
                      padding: "5px 14px", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 600,
                      border: "2px solid transparent", cursor: "pointer", transition: "all 0.2s",
                      background: form.meals[meal].ate === opt.value ? ateColor[opt.value] : "rgba(0,0,0,0.05)",
                      color: form.meals[meal].ate === opt.value ? "white" : "var(--text-secondary)",
                    }}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
            <input className="glass-input" placeholder={`${meal} notes…`}
              value={form.meals[meal].notes} onChange={e => setMeal(meal, "notes", e.target.value)} />
          </div>
        ))}
      </div>

      {/* ── Hygiene ── */}
      <div className="glass-card" style={{ padding: "24px" }}>
        <h3 style={{ margin: "0 0 16px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><Sparkles size={18} /> Hygiene</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {([
            { key: "teethBrushed", label: "Teeth Brushed" },
            { key: "handsWashed", label: "Hands Washed" },
            { key: "diaperAssisted", label: "Diaper/Bathroom Assisted" },
            { key: "hairCombed", label: "Hair Combed" },
          ] as { key: keyof typeof form.hygiene; label: string }[]).map(({ key, label }) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "12px", borderRadius: "10px", background: form.hygiene[key] ? "rgba(56,161,105,0.08)" : "rgba(255,255,255,0.5)", border: `1px solid ${form.hygiene[key] ? "rgba(56,161,105,0.25)" : "transparent"}`, transition: "all 0.2s" }}>
              <input type="checkbox" className="custom-checkbox" checked={form.hygiene[key]} onChange={e => setHygiene(key, e.target.checked)} />
              <span style={{ fontSize: "0.88rem", fontWeight: 500, color: form.hygiene[key] ? "var(--success)" : "var(--text-primary)" }}>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Mood Timeline ── */}
      <div className="glass-card" style={{ padding: "24px" }}>
        <h3 style={{ margin: "0 0 16px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><Smile size={18} /> Mood Timeline</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          {MOOD_SLOTS.map(slot => {
            const current = form.moodTimeline.find(m => m.slot === slot)?.mood || "neutral";
            return (
              <div key={slot} style={{ padding: "14px", background: "rgba(255,255,255,0.5)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.7)", textAlign: "center" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{slot}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {MOODS_LIST.map(m => (
                    <button key={m.value} type="button" onClick={() => setMood(slot, m.value)}
                      style={{ padding: "6px", borderRadius: "8px", border: "2px solid", cursor: "pointer", transition: "all 0.15s",
                        borderColor: current === m.value ? m.color : "transparent",
                        background: current === m.value ? `${m.color}15` : "transparent",
                        display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem",
                        color: current === m.value ? m.color : "var(--text-secondary)", fontWeight: current === m.value ? 700 : 400,
                      }}>
                      <m.icon size={16} />{m.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Physical Activity ── */}
      <div className="glass-card" style={{ padding: "24px" }}>
        <h3 style={{ margin: "0 0 14px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><Activity size={18} /> Physical Activity</h3>
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
          {ACTIVITY_OPTIONS.map(opt => {
            const actColor = { Active: "var(--success)", Moderate: "var(--accent-teal)", Low: "var(--warning)", "Bed Rest": "var(--danger)" }[opt];
            return (
              <button key={opt} type="button" onClick={() => setForm(f => ({ ...f, physicalActivity: opt }))}
                style={{
                  padding: "8px 18px", borderRadius: "999px", border: "2px solid", cursor: "pointer", fontWeight: 600, fontSize: "0.88rem", transition: "all 0.2s",
                  borderColor: form.physicalActivity === opt ? actColor! : "transparent",
                  background: form.physicalActivity === opt ? `${actColor}15` : "rgba(0,0,0,0.04)",
                  color: form.physicalActivity === opt ? actColor! : "var(--text-secondary)",
                }}>
                {opt}
              </button>
            );
          })}
        </div>
        <input className="glass-input" placeholder="Activity notes…" value={form.activityNotes} onChange={e => setForm(f => ({ ...f, activityNotes: e.target.value }))} />
      </div>

      {/* ── Incidents & Notes ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <div className="glass-card" style={{ padding: "24px" }}>
          <h3 style={{ margin: "0 0 12px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><AlertTriangle size={18} style={{ color: "var(--danger)" }} /> Incidents</h3>
          <textarea className="glass-input" rows={4} placeholder="Describe any incidents that occurred today…" style={{ resize: "vertical" }}
            value={form.incidents} onChange={e => setForm(f => ({ ...f, incidents: e.target.value }))} />
        </div>
        <div className="glass-card" style={{ padding: "24px" }}>
          <h3 style={{ margin: "0 0 12px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><FileText size={18} /> Teacher Notes</h3>
          <textarea className="glass-input" rows={4} placeholder="General observations and notes for the day…" style={{ resize: "vertical" }}
            value={form.teacherNotes} onChange={e => setForm(f => ({ ...f, teacherNotes: e.target.value }))} />
        </div>
      </div>

      <button id="journal-submit" type="submit" className="btn-primary" disabled={saving} style={{ padding: "15px", fontSize: "1rem", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
        {saving ? "Submitting…" : (
          <>
            <Check size={18} /> Submit Journal for {studentName} — {date}
          </>
        )}
      </button>
    </form>
  );
}

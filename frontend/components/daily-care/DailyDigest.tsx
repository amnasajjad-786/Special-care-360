"use client";
import { DailyCareJournal, MoodType } from "@/types";

const MOOD_EMOJIS: Record<MoodType, string> = { happy: "😊", neutral: "😐", sad: "😢", agitated: "😤", tired: "😴" };
const MOOD_COLORS: Record<MoodType, string> = { happy: "#38a169", neutral: "#718096", sad: "#3182ce", agitated: "#e53e3e", tired: "#805ad5" };
const ATE_LABELS: Record<string, string> = { fully: "✅ Fully", partially: "⚠️ Partially", refused: "❌ Refused" };
const MEAL_ICONS: Record<string, string> = { breakfast: "🍳", lunch: "🍱", snack: "🍎" };

interface Props { journal: DailyCareJournal; studentName: string; }

export default function DailyDigest({ journal, studentName }: Props) {
  // Generate warm summary sentence
  const morningMood = journal.moodTimeline.find(m => m.slot === "Morning")?.mood || "neutral";
  const endMood = journal.moodTimeline.find(m => m.slot === "End of Day")?.mood || "neutral";
  const lunchAte = journal.meals?.lunch?.ate || "partially";
  const activity = journal.physicalActivity;

  const summary = `${studentName} had a ${MOOD_EMOJIS[morningMood]} ${morningMood} morning, ${ATE_LABELS[lunchAte].toLowerCase()} their lunch, and had a ${activity.toLowerCase()} day. They ended the day feeling ${MOOD_EMOJIS[endMood]} ${endMood}.`;

  const hygieneDone = Object.values(journal.hygiene || {}).filter(Boolean).length;
  const hygieneTotal = Object.values(journal.hygiene || {}).length;

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Summary Banner */}
      <div className="glass-card" style={{ padding: "24px", background: "linear-gradient(135deg, rgba(123,196,196,0.12), rgba(184,168,212,0.1))", border: "1px solid rgba(123,196,196,0.25)" }}>
        <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
          <span style={{ fontSize: "2.5rem" }}>📋</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--primary-dark)", marginBottom: "8px" }}>
              Daily Digest — {new Date(journal.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </div>
            <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-primary)", lineHeight: 1.6 }}>{summary}</p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Meals */}
        <div className="glass-card" style={{ padding: "20px" }}>
          <h3 style={{ margin: "0 0 14px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem" }}>🍽️ Meals</h3>
          {(["breakfast", "lunch", "snack"] as const).map(meal => (
            <div key={meal} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", padding: "10px", background: "rgba(255,255,255,0.5)", borderRadius: "8px" }}>
              <span style={{ fontSize: "1.1rem" }}>{MEAL_ICONS[meal]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 600, textTransform: "capitalize", color: "var(--text-secondary)" }}>{meal}</div>
                {journal.meals?.[meal]?.notes && <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" }}>{journal.meals[meal].notes}</div>}
              </div>
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: journal.meals?.[meal]?.ate === "fully" ? "var(--success)" : journal.meals?.[meal]?.ate === "partially" ? "var(--warning)" : "var(--danger)" }}>
                {ATE_LABELS[journal.meals?.[meal]?.ate || "partially"]}
              </span>
            </div>
          ))}
        </div>

        {/* Mood Timeline */}
        <div className="glass-card" style={{ padding: "20px" }}>
          <h3 style={{ margin: "0 0 14px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem" }}>😊 Mood Timeline</h3>
          {(journal.moodTimeline || []).map(({ slot, mood }) => (
            <div key={slot} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <div style={{ width: "80px", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>{slot}</div>
              <div style={{ flex: 1, height: "28px", background: "rgba(0,0,0,0.04)", borderRadius: "6px", overflow: "hidden", display: "flex", alignItems: "center", paddingLeft: "10px", gap: "6px", border: `1px solid ${MOOD_COLORS[mood]}30` }}>
                <span>{MOOD_EMOJIS[mood]}</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: MOOD_COLORS[mood], textTransform: "capitalize" }}>{mood}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
        {/* Hygiene */}
        <div className="glass-card" style={{ padding: "18px" }}>
          <h3 style={{ margin: "0 0 12px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.9rem" }}>🧹 Hygiene</h3>
          <div style={{ fontWeight: 800, fontSize: "1.6rem", color: hygieneDone === hygieneTotal ? "var(--success)" : "var(--warning)" }}>{hygieneDone}/{hygieneTotal}</div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" }}>tasks completed</div>
          <div style={{ marginTop: "10px" }}>
            {[
              { key: "teethBrushed", label: "🦷 Teeth" }, { key: "handsWashed", label: "🧼 Hands" },
              { key: "diaperAssisted", label: "🚿 Bathroom" }, { key: "hairCombed", label: "💇 Hair" }
            ].map(({ key, label }) => (
              <div key={key} style={{ fontSize: "0.78rem", marginBottom: "3px", color: (journal.hygiene as Record<string, boolean>)?.[key] ? "var(--success)" : "var(--text-secondary)" }}>
                {(journal.hygiene as Record<string, boolean>)?.[key] ? "✅" : "⬜"} {label}
              </div>
            ))}
          </div>
        </div>

        {/* Activity */}
        <div className="glass-card" style={{ padding: "18px" }}>
          <h3 style={{ margin: "0 0 12px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.9rem" }}>🏃 Activity</h3>
          <span className={`chip ${journal.physicalActivity === "Active" ? "chip-success" : journal.physicalActivity === "Low" ? "chip-warning" : "chip-info"}`}>
            {journal.physicalActivity}
          </span>
          {journal.activityNotes && <p style={{ margin: "10px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{journal.activityNotes}</p>}
        </div>

        {/* Notes */}
        <div className="glass-card" style={{ padding: "18px" }}>
          <h3 style={{ margin: "0 0 8px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.9rem" }}>📝 Notes</h3>
          {journal.teacherNotes
            ? <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-primary)", lineHeight: 1.5 }}>{journal.teacherNotes}</p>
            : <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>No notes added</p>
          }
          {journal.incidents && (
            <div style={{ marginTop: "10px", padding: "8px", background: "rgba(229,62,62,0.06)", borderRadius: "8px", border: "1px solid rgba(229,62,62,0.15)" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--danger)", marginBottom: "3px" }}>⚠️ INCIDENT</div>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-primary)" }}>{journal.incidents}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

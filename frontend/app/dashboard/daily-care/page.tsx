"use client";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { dailyCareApi } from "@/lib/api";
import { DailyCareJournal } from "@/types";
import JournalForm from "@/components/daily-care/JournalForm";
import DailyDigest from "@/components/daily-care/DailyDigest";

const MOCK_STUDENTS = [
  { id: "s1", name: "Ali Hassan" },
  { id: "s2", name: "Sara Ahmed" },
  { id: "s3", name: "Omar Malik" },
  { id: "s4", name: "Zara Khan" },
];

const MOCK_JOURNAL: DailyCareJournal = {
  studentId: "s1", date: format(new Date(), "yyyy-MM-dd"),
  meals: { breakfast: { ate: "fully", notes: "Enjoyed oatmeal" }, lunch: { ate: "partially", notes: "Left some rice" }, snack: { ate: "fully", notes: "Loved the banana" } },
  hygiene: { teethBrushed: true, handsWashed: true, diaperAssisted: false, hairCombed: true },
  moodTimeline: [{ slot: "Morning", mood: "happy" }, { slot: "Midday", mood: "neutral" }, { slot: "After Lunch", mood: "happy" }, { slot: "End of Day", mood: "tired" }],
  physicalActivity: "Active", activityNotes: "Outdoor play & ball games", incidents: "", teacherNotes: "Ali had a great day! Very engaged during circle time.", submittedBy: "teacher-001", submittedAt: new Date().toISOString(),
};

export default function DailyCarePage() {
  const { profile } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState(MOCK_STUDENTS[0]);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [existingJournal, setExistingJournal] = useState<DailyCareJournal | null>(null);
  const [loading, setLoading] = useState(false);

  const isTeacher = profile?.role === "teacher" || profile?.role === "admin";

  useEffect(() => {
    const fetchJournal = async () => {
      setLoading(true);
      try {
        const res = await dailyCareApi.get(selectedStudent.id, date);
        setExistingJournal(res.data || null);
      } catch {
        setExistingJournal(MOCK_JOURNAL);
      }
      setLoading(false);
    };
    fetchJournal();
  }, [selectedStudent.id, date]);

  return (
    <div>
      {/* Header Controls */}
      <div className="glass-card" style={{ padding: "18px 24px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase" }}>Student</label>
            <select id="dc-student-select" className="glass-input" style={{ minWidth: "180px" }}
              value={selectedStudent.id} onChange={e => setSelectedStudent(MOCK_STUDENTS.find(s => s.id === e.target.value) || MOCK_STUDENTS[0])}>
              {MOCK_STUDENTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase" }}>Date</label>
            <input id="dc-date-select" type="date" className="glass-input" value={date} max={format(new Date(), "yyyy-MM-dd")} onChange={e => setDate(e.target.value)} style={{ minWidth: "160px" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <span className={`chip ${existingJournal ? "chip-success" : "chip-warning"}`}>
            {existingJournal ? "✅ Submitted" : "📝 Pending"}
          </span>
          {isTeacher && <span className="chip chip-info">Teacher View</span>}
          {profile?.role === "parent" && <span className="chip chip-purple">Parent View</span>}
        </div>
      </div>

      {/* Journal Title */}
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "var(--primary-dark)" }}>
          {profile?.role === "parent" ? "📋 Daily Digest" : "📓 Today's Care Journal"}
        </h2>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "0.88rem" }}>
          {selectedStudent.name} · {new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: "120px", borderRadius: "16px" }} />)}
        </div>
      ) : profile?.role === "parent" ? (
        <DailyDigest journal={existingJournal || MOCK_JOURNAL} studentName={selectedStudent.name} />
      ) : (
        <JournalForm studentId={selectedStudent.id} studentName={selectedStudent.name} date={date} />
      )}
    </div>
  );
}

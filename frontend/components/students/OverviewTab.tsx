"use client";
import { Student } from "@/types";

const IEP_COLORS: Record<string, string> = {
  Active: "chip-success",
  "Under Review": "chip-warning",
  Completed: "chip-gray",
};

export default function OverviewTab({ student }: { student: Student }) {
  const age = student.dob
    ? Math.floor((Date.now() - new Date(student.dob).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  const fields = [
    { label: "Date of Birth", value: student.dob ? new Date(student.dob).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—" },
    { label: "Age", value: age ? `${age} years` : "—" },
    { label: "Diagnosis", value: student.diagnosis },
    { label: "Enrollment Date", value: student.enrollmentDate ? new Date(student.enrollmentDate).toLocaleDateString() : "—" },
    { label: "Assigned Teacher ID", value: student.teacherId || "Not assigned" },
    { label: "Therapist(s)", value: student.therapistIds?.length ? student.therapistIds.join(", ") : "None assigned" },
    { label: "Center ID", value: student.centerId },
  ];

  return (
    <div className="animate-fade-in">
      {/* Header card */}
      <div className="glass-card" style={{ padding: "28px", marginBottom: "20px", display: "flex", gap: "24px", alignItems: "center" }}>
        <div style={{
          width: "100px", height: "100px", borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, var(--accent-teal), var(--accent-lavender))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "40px", fontWeight: 800, color: "white",
          boxShadow: "0 6px 20px rgba(123,196,196,0.35)",
          overflow: "hidden",
        }}>
          {student.photoUrl
            ? <img src={student.photoUrl} alt={student.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : student.name?.charAt(0)
          }
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "var(--primary-dark)" }}>{student.name}</h2>
          <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
            <span className="chip chip-info">{student.diagnosis}</span>
            <span className={`chip ${IEP_COLORS[student.iepStatus] || "chip-gray"}`}>
              IEP: {student.iepStatus}
            </span>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Enrolled since {student.enrollmentDate ? new Date(student.enrollmentDate).toLocaleDateString() : "—"}
          </p>
        </div>
      </div>

      {/* Info grid */}
      <div className="glass-card" style={{ padding: "24px" }}>
        <h3 style={{ margin: "0 0 18px", fontSize: "1rem", fontWeight: 700, color: "var(--primary-dark)" }}>
          Student Information
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" }}>
          {fields.map(({ label, value }) => (
            <div key={label} style={{
              padding: "14px 16px", borderRadius: "10px",
              background: "rgba(255,255,255,0.5)",
              border: "1px solid rgba(255,255,255,0.6)",
            }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                {label}
              </div>
              <div style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-primary)" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

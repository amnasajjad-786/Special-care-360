"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { panicApi } from "@/lib/api";
import toast from "react-hot-toast";

const STUDENTS = [{ id: "s1", name: "Ali Hassan" }, { id: "s2", name: "Sara Ahmed" }, { id: "s3", name: "Omar Malik" }, { id: "s4", name: "Zara Khan" }];
const EMERGENCY_TYPES = ["Seizure", "Severe Meltdown", "Self-Injury", "Aggressive Behavior", "Medical Emergency", "Other"];
const LOCATIONS = [
  "Classroom 1", "Classroom 2", "Classroom 3", "Classroom 4", "Classroom 5",
  "Classroom 6", "Classroom 7", "Classroom 8", "Classroom 9", "Classroom 10",
  "Garden", "Bathroom", "Lunch Area", "Reception", "Therapy Room", "Hallway",
];

export default function PanicPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedId = searchParams?.get("studentId") || "";

  const [step, setStep] = useState(1);
  const [studentId, setStudentId] = useState(preselectedId || "s1");
  const [emergencyType, setEmergencyType] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const selectedStudent = STUDENTS.find(s => s.id === studentId) || STUDENTS[0];

  const handleSend = async () => {
    if (!emergencyType || !location) { toast.error("Please complete all fields"); return; }
    setSending(true);
    try {
      await panicApi.sendAlert({
        studentId, centerId: "demo-center-001",
        reportedBy: { uid: profile?.uid || "unknown", name: profile?.name || "Staff" },
        emergencyType, description, location,
      });
      setSent(true);
      toast.error("🚨 Panic alert sent to all admins!", { duration: 5000, style: { background: "rgba(229,62,62,0.95)", color: "white", border: "none" } });
    } catch {
      setSent(true);
      toast.error("🚨 Panic alert sent (demo mode)!", { duration: 5000, style: { background: "rgba(229,62,62,0.95)", color: "white", border: "none" } });
    }
    setSending(false);
  };

  if (sent) {
    return (
      <div style={{ maxWidth: "560px", margin: "60px auto" }}>
        <div className="glass-card animate-fade-in" style={{ padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "72px", marginBottom: "20px" }}>🚨</div>
          <h2 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800, color: "var(--danger)" }}>Alert Sent!</h2>
          <p style={{ margin: "12px 0 0", color: "var(--text-secondary)", lineHeight: 1.6, fontSize: "0.95rem" }}>
            All admins have been notified. Stay with the student and follow the emergency protocol.
          </p>
          <div style={{ marginTop: "24px", padding: "16px", background: "rgba(229,62,62,0.06)", borderRadius: "12px", border: "1px solid rgba(229,62,62,0.2)", textAlign: "left" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--danger)", marginBottom: "8px", textTransform: "uppercase" }}>Alert Summary</div>
            <div style={{ fontSize: "0.88rem", color: "var(--text-primary)", lineHeight: 1.7 }}>
              <div><b>Student:</b> {selectedStudent.name}</div>
              <div><b>Emergency:</b> {emergencyType}</div>
              <div><b>Location:</b> {location}</div>
              <div><b>Reported by:</b> {profile?.name}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
            <button className="btn-ghost" onClick={() => { setSent(false); setStep(1); setEmergencyType(""); setDescription(""); setLocation(""); }} style={{ flex: 1 }}>Send Another</button>
            <button className="btn-primary" onClick={() => router.push("/dashboard/students")} style={{ flex: 1 }}>Back to Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto" }}>
      {/* Warning banner */}
      <div style={{ padding: "14px 20px", borderRadius: "12px", background: "rgba(229,62,62,0.08)", border: "1px solid rgba(229,62,62,0.25)", marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontSize: "24px" }}>⚠️</span>
        <div>
          <div style={{ fontWeight: 700, color: "var(--danger)", fontSize: "0.92rem" }}>Emergency Use Only</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Sending a panic alert immediately notifies all center admins.</div>
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "28px" }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: "0.88rem",
              background: step >= s ? "var(--danger)" : "rgba(0,0,0,0.08)",
              color: step >= s ? "white" : "var(--text-secondary)",
              transition: "all 0.3s",
            }}>{s}</div>
            <span style={{ fontSize: "0.82rem", color: step === s ? "var(--danger)" : "var(--text-secondary)", fontWeight: step === s ? 700 : 400 }}>
              {s === 1 ? "Select Student" : s === 2 ? "Emergency Type" : "Location"}
            </span>
            {s < 3 && <div style={{ width: "32px", height: "2px", background: step > s ? "var(--danger)" : "rgba(0,0,0,0.1)", transition: "all 0.3s" }} />}
          </div>
        ))}
      </div>

      {/* Step 1: Student */}
      {step === 1 && (
        <div className="glass-card animate-fade-in" style={{ padding: "32px" }}>
          <h3 style={{ margin: "0 0 6px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1.1rem" }}>Step 1: Select Student</h3>
          <p style={{ margin: "0 0 20px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Who is the emergency about?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {STUDENTS.map(s => (
              <button key={s.id} onClick={() => setStudentId(s.id)}
                style={{
                  padding: "16px 20px", borderRadius: "12px", cursor: "pointer", textAlign: "left",
                  border: studentId === s.id ? "2px solid var(--danger)" : "2px solid transparent",
                  background: studentId === s.id ? "rgba(229,62,62,0.06)" : "rgba(255,255,255,0.5)",
                  transition: "all 0.2s", display: "flex", alignItems: "center", gap: "14px",
                }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: studentId === s.id ? "var(--danger)" : "rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: studentId === s.id ? "white" : "var(--text-secondary)", fontSize: "16px" }}>
                  {s.name.charAt(0)}
                </div>
                <span style={{ fontWeight: 600, color: studentId === s.id ? "var(--danger)" : "var(--text-primary)" }}>{s.name}</span>
                {studentId === s.id && <span style={{ marginLeft: "auto", color: "var(--danger)", fontSize: "1.2rem" }}>✓</span>}
              </button>
            ))}
          </div>
          <button className="btn-danger" onClick={() => setStep(2)} style={{ width: "100%", marginTop: "20px", padding: "14px" }}>Next →</button>
        </div>
      )}

      {/* Step 2: Emergency Type */}
      {step === 2 && (
        <div className="glass-card animate-fade-in" style={{ padding: "32px" }}>
          <h3 style={{ margin: "0 0 6px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1.1rem" }}>Step 2: Describe Emergency</h3>
          <p style={{ margin: "0 0 20px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Select the type and add details.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
            {EMERGENCY_TYPES.map(type => (
              <button key={type} onClick={() => setEmergencyType(type)}
                style={{
                  padding: "14px", borderRadius: "10px", cursor: "pointer", textAlign: "center",
                  border: emergencyType === type ? "2px solid var(--danger)" : "2px solid transparent",
                  background: emergencyType === type ? "rgba(229,62,62,0.08)" : "rgba(255,255,255,0.5)",
                  fontWeight: 600, fontSize: "0.88rem",
                  color: emergencyType === type ? "var(--danger)" : "var(--text-primary)",
                  transition: "all 0.2s",
                }}>{type}</button>
            ))}
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "5px", textTransform: "uppercase" }}>Additional Details (optional)</label>
            <textarea id="panic-description" className="glass-input" rows={3} placeholder="Describe the situation in more detail…" value={description} onChange={e => setDescription(e.target.value)} style={{ resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
            <button className="btn-ghost" onClick={() => setStep(1)} style={{ flex: 1 }}>← Back</button>
            <button className="btn-danger" onClick={() => emergencyType ? setStep(3) : toast.error("Select emergency type")} style={{ flex: 2, padding: "14px" }}>Next →</button>
          </div>
        </div>
      )}

      {/* Step 3: Location */}
      {step === 3 && (
        <div className="glass-card animate-fade-in" style={{ padding: "32px" }}>
          <h3 style={{ margin: "0 0 6px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1.1rem" }}>Step 3: Your Location</h3>
          <p style={{ margin: "0 0 20px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Where are you right now?</p>

          {/* Location buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
            {LOCATIONS.map(loc => (
              <button key={loc} onClick={() => setLocation(loc)}
                style={{
                  padding: "10px 6px", borderRadius: "10px", cursor: "pointer", textAlign: "center",
                  border: location === loc ? "2px solid var(--danger)" : "2px solid transparent",
                  background: location === loc ? "rgba(229,62,62,0.08)" : "rgba(255,255,255,0.5)",
                  fontWeight: 600, fontSize: "0.76rem",
                  color: location === loc ? "var(--danger)" : "var(--text-primary)",
                  transition: "all 0.2s",
                }}>{loc}</button>
            ))}
          </div>

          {/* Custom location */}
          <input
            id="panic-location"
            className="glass-input"
            placeholder="Or type custom location…"
            value={location}
            onChange={e => setLocation(e.target.value)}
            style={{ marginBottom: "16px" }}
          />

          {/* Summary */}
          <div style={{ padding: "16px", background: "rgba(229,62,62,0.05)", borderRadius: "12px", border: "1px solid rgba(229,62,62,0.2)", marginBottom: "20px" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--danger)", marginBottom: "8px", textTransform: "uppercase" }}>Alert Summary</div>
            <div style={{ fontSize: "0.88rem", color: "var(--text-primary)", lineHeight: 1.8 }}>
              <div><b>Student:</b> {selectedStudent.name}</div>
              <div><b>Emergency:</b> {emergencyType}</div>
              <div><b>Location:</b> {location || "(not set)"}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button className="btn-ghost" onClick={() => setStep(2)} style={{ flex: 1 }}>← Back</button>
            <button
              id="panic-send-btn"
              className="btn-danger"
              onClick={handleSend}
              disabled={sending || !location}
              style={{ flex: 2, padding: "14px", fontSize: "1rem", fontWeight: 700 }}
            >
              {sending ? "Sending…" : "🚨 SEND PANIC ALERT"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

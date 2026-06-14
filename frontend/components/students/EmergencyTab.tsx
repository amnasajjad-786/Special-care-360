"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MedicalProfile } from "@/types";
import toast from "react-hot-toast";
import { AlertOctagon, Phone, Smartphone, Zap, Activity, ShieldAlert, FileText, Save, AlertTriangle } from "lucide-react";

interface Props { studentId: string; studentName: string; medical: MedicalProfile; canEdit: boolean; }

export default function EmergencyTab({ studentId, studentName, medical, canEdit }: Props) {
  const router = useRouter();
  const [protocol, setProtocol] = useState(medical?.seizureHistory?.protocol || "1. Keep student calm and safe\n2. Clear surrounding area\n3. Do not restrain\n4. Call designated nurse\n5. Contact emergency contacts immediately\n6. Document the incident");
  const [saving, setSaving] = useState(false);

  const saveProtocol = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    toast.success("Emergency protocol saved");
    setSaving(false);
  };

  const { name: contactName, relation, phone } = medical?.emergencyContact || {};

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Emergency Banner */}
      <div style={{
        padding: "16px 20px", borderRadius: "14px",
        background: "linear-gradient(135deg, rgba(229,62,62,0.08), rgba(229,62,62,0.04))",
        border: "1px solid rgba(229,62,62,0.25)",
        display: "flex", alignItems: "center", gap: "12px",
      }}>
        <span style={{ display: "inline-flex", color: "var(--danger)" }}><AlertOctagon size={28} /></span>
        <div>
          <div style={{ fontWeight: 700, color: "var(--danger)", fontSize: "0.95rem" }}>Emergency Information for {studentName}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "2px" }}>Keep this information accessible at all times</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Emergency Contacts */}
        <div className="glass-card" style={{ padding: "24px" }}>
          <h3 style={{ margin: "0 0 16px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><Phone size={18} /> Emergency Contacts</h3>
          {contactName ? (
            <div style={{ padding: "16px", background: "rgba(255,255,255,0.5)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.7)" }}>
              <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "1rem" }}>{contactName}</div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "4px" }}>{relation}</div>
              <a href={`tel:${phone}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "10px", color: "var(--accent-teal)", fontWeight: 600, fontSize: "0.9rem", textDecoration: "none" }}>
                <Smartphone size={16} /> {phone}
              </a>
            </div>
          ) : (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>No emergency contact on file</p>
          )}
          {medical?.seizureHistory?.hasHistory && (
            <div style={{ marginTop: "12px", padding: "12px", background: "rgba(229,62,62,0.06)", borderRadius: "10px", border: "1px solid rgba(229,62,62,0.15)" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--danger)", display: "flex", alignItems: "center", gap: "6px" }}><Zap size={14} /> SEIZURE ALERT</div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                Frequency: {medical.seizureHistory.frequency || "N/A"} · Last: {medical.seizureHistory.lastOccurrence || "N/A"}
              </div>
            </div>
          )}
          {(medical?.allergies || []).length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px", textTransform: "uppercase" }}>Known Allergies</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {medical.allergies.map((a, i) => (
                  <span key={i} style={{ padding: "3px 10px", background: "rgba(229,62,62,0.1)", borderRadius: "999px", fontSize: "0.8rem", color: "#c53030", fontWeight: 600 }}>{a}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Blood Type & Medical */}
        <div className="glass-card" style={{ padding: "24px" }}>
          <h3 style={{ margin: "0 0 16px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><Activity size={18} /> Critical Medical Info</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ padding: "14px", background: "rgba(255,255,255,0.5)", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>Blood Type</span>
              <span style={{ fontWeight: 800, fontSize: "1.2rem", color: "var(--danger)" }}>{medical?.bloodType || "Unknown"}</span>
            </div>
            {medical?.specialPhysicalNeeds && (
              <div style={{ padding: "14px", background: "rgba(255,255,255,0.5)", borderRadius: "10px" }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px", textTransform: "uppercase" }}>Special Physical Needs</div>
                <div style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>{medical.specialPhysicalNeeds}</div>
              </div>
            )}
            {(medical?.medications || []).length > 0 && (
              <div style={{ padding: "14px", background: "rgba(255,255,255,0.5)", borderRadius: "10px" }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px", textTransform: "uppercase" }}>Current Medications</div>
                {medical.medications.slice(0, 3).map((m, i) => (
                  <div key={i} style={{ fontSize: "0.85rem", color: "var(--text-primary)", marginBottom: "4px" }}>• {m.name} {m.dosage} — {m.frequency}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Emergency Protocol */}
      <div className="glass-card" style={{ padding: "24px" }}>
        <h3 style={{ margin: "0 0 14px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><FileText size={18} /> Emergency Protocol</h3>
        <textarea
          className="glass-input"
          rows={8}
          value={protocol}
          onChange={e => setProtocol(e.target.value)}
          disabled={!canEdit}
          style={{ resize: "vertical", fontFamily: "monospace", fontSize: "0.88rem", lineHeight: 1.7 }}
        />
        {canEdit && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
            <button className="btn-primary" onClick={saveProtocol} disabled={saving} style={{ padding: "10px 24px" }}>
              {saving ? "Saving…" : (
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Save size={16} /> Save Protocol
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Panic Alert Button */}
      <div className="glass-card" style={{ padding: "24px", textAlign: "center", background: "linear-gradient(135deg, rgba(229,62,62,0.04), rgba(229,62,62,0.02))", border: "1px solid rgba(229,62,62,0.2)" }}>
        <p style={{ margin: "0 0 16px", color: "var(--text-secondary)", fontSize: "0.88rem" }}>
          Is there an active emergency involving this student?
        </p>
        <button
          className="btn-danger"
          onClick={() => router.push(`/dashboard/panic?studentId=${studentId}`)}
          style={{ padding: "14px 36px", fontSize: "1rem" }}
        >
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <ShieldAlert size={18} /> Trigger Panic Alert for {studentName}
          </span>
        </button>
      </div>
    </div>
  );
}

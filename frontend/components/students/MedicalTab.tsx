"use client";
import { useState, useEffect } from "react";
import { MedicalProfile, Medication } from "@/types";
import toast from "react-hot-toast";
import { Sparkles, Zap, ShieldAlert, Pill, Phone, Activity, Save, AlertTriangle } from "lucide-react";
import { studentsDb } from "@/lib/firestore-api";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];

interface Props { studentId: string; profile: MedicalProfile; canEdit: boolean; onChange?: (data: MedicalProfile) => void; }

export default function MedicalTab({ studentId, profile: initial, canEdit, onChange }: Props) {
  const [data, setData] = useState<MedicalProfile>(initial);

  useEffect(() => {
    if (onChange) onChange(data);
  }, [data, onChange]);
  const [saving, setSaving] = useState(false);
  const [newAllergy, setNewAllergy] = useState("");
  const [showAddMed, setShowAddMed] = useState(false);
  const [newMed, setNewMed] = useState<Medication>({ name: "", dosage: "", frequency: "", time: "", administeredBy: "" });

  const save = async () => {
    setSaving(true);
    try {
      await studentsDb.updateMedical(studentId, data as unknown as Record<string, unknown>);
      toast.success("Medical profile updated");
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const addAllergy = () => {
    if (!newAllergy.trim()) return;
    setData(d => ({ ...d, allergies: [...(d.allergies || []), newAllergy.trim()] }));
    setNewAllergy("");
  };

  const removeAllergy = (idx: number) =>
    setData(d => ({ ...d, allergies: d.allergies.filter((_, i) => i !== idx) }));

  const addMedication = () => {
    if (!newMed.name) return;
    setData(d => ({ ...d, medications: [...(d.medications || []), newMed] }));
    setNewMed({ name: "", dosage: "", frequency: "", time: "", administeredBy: "" });
    setShowAddMed(false);
  };

  const removeMed = (idx: number) =>
    setData(d => ({ ...d, medications: d.medications.filter((_, i) => i !== idx) }));

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Allergies */}
      <div className="glass-card" style={{ padding: "24px" }}>
        <h3 style={{ margin: "0 0 16px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><Sparkles size={18} /> Allergies</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "14px" }}>
          {(data.allergies || []).length === 0 && <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>No allergies recorded</span>}
          {(data.allergies || []).map((a, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 12px", background: "rgba(229,62,62,0.1)", border: "1px solid rgba(229,62,62,0.25)", borderRadius: "999px", fontSize: "0.85rem", color: "#c53030", fontWeight: 500 }}>
              {a} {canEdit && <button onClick={() => removeAllergy(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c53030", fontSize: "1rem", lineHeight: 1 }}>×</button>}
            </span>
          ))}
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: "8px" }}>
            <input className="glass-input" placeholder="Add allergy…" value={newAllergy} onChange={e => setNewAllergy(e.target.value)} onKeyDown={e => e.key === "Enter" && addAllergy()} style={{ maxWidth: "240px" }} />
            <button className="btn-primary" onClick={addAllergy} style={{ padding: "8px 16px", fontSize: "0.85rem" }}>Add</button>
          </div>
        )}
      </div>

      {/* Seizure History */}
      <div className="glass-card" style={{ padding: "24px" }}>
        <h3 style={{ margin: "0 0 16px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><Zap size={18} /> Seizure History</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>
            <input type="checkbox" className="custom-checkbox" checked={data.seizureHistory?.hasHistory || false}
              onChange={e => setData(d => ({ ...d, seizureHistory: { ...d.seizureHistory, hasHistory: e.target.checked } }))}
              disabled={!canEdit} />
            Has seizure history
          </label>
          {data.seizureHistory?.hasHistory && (
            <span className="chip chip-danger" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <AlertTriangle size={13} /> Active Risk
            </span>
          )}
        </div>
        {data.seizureHistory?.hasHistory && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            {[
              { label: "Frequency", key: "frequency", placeholder: "e.g. Monthly" },
              { label: "Last Occurrence", key: "lastOccurrence", placeholder: "e.g. 2026-03-15" },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "5px" }}>{label}</label>
                <input className="glass-input" placeholder={placeholder} disabled={!canEdit}
                  value={(data.seizureHistory as unknown as Record<string, string>)[key] || ""}
                  onChange={e => setData(d => ({ ...d, seizureHistory: { ...d.seizureHistory, [key]: e.target.value } }))} />
              </div>
            ))}
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "5px" }}>Emergency Protocol</label>
              <textarea className="glass-input" rows={3} disabled={!canEdit}
                placeholder="Step-by-step protocol…"
                value={data.seizureHistory?.protocol || ""}
                onChange={e => setData(d => ({ ...d, seizureHistory: { ...d.seizureHistory, protocol: e.target.value } }))}
                style={{ resize: "vertical" }} />
            </div>
          </div>
        )}
      </div>

      {/* Medications */}
      <div className="glass-card" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h3 style={{ margin: 0, fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><Pill size={18} /> Medications</h3>
          {canEdit && <button className="btn-primary" onClick={() => setShowAddMed(true)} style={{ padding: "7px 14px", fontSize: "0.82rem" }}>+ Add</button>}
        </div>
        {(data.medications || []).length === 0
          ? <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>No medications recorded</p>
          : (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead><tr>{["Medication", "Dosage", "Frequency", "Time", "Administered By", canEdit ? "Action" : ""].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {(data.medications || []).map((med, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{med.name}</td>
                      <td>{med.dosage}</td>
                      <td>{med.frequency}</td>
                      <td>{med.time}</td>
                      <td>{med.administeredBy}</td>
                      {canEdit && <td><button onClick={() => removeMed(i)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontWeight: 700, fontSize: "1.1rem" }}>×</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        {showAddMed && (
          <div style={{ marginTop: "16px", padding: "16px", background: "rgba(255,255,255,0.5)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.7)" }}>
            <h4 style={{ margin: "0 0 12px", fontSize: "0.9rem", fontWeight: 700, color: "var(--primary-dark)" }}>Add Medication</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {[
                { label: "Name", key: "name" }, { label: "Dosage", key: "dosage" },
                { label: "Frequency", key: "frequency" }, { label: "Time", key: "time" },
                { label: "Administered By", key: "administeredBy" }
              ].map(({ label, key }) => (
                <div key={key}>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>{label}</label>
                  <input className="glass-input" value={(newMed as unknown as Record<string, string>)[key] || ""}
                    onChange={e => setNewMed(m => ({ ...m, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <button className="btn-ghost" onClick={() => setShowAddMed(false)} style={{ flex: 1 }}>Cancel</button>
              <button className="btn-primary" onClick={addMedication} style={{ flex: 1 }}>Add Medication</button>
            </div>
          </div>
        )}
      </div>

      {/* Emergency Contact & Other Info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <div className="glass-card" style={{ padding: "24px" }}>
          <h3 style={{ margin: "0 0 16px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><Phone size={18} /> Emergency Contact</h3>
          {[
            { label: "Contact Name", key: "name" }, { label: "Relation", key: "relation" }, { label: "Phone", key: "phone" }
          ].map(({ label, key }) => (
            <div key={key} style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>{label}</label>
              <input className="glass-input" disabled={!canEdit}
                value={(data.emergencyContact as Record<string, string>)?.[key] || ""}
                onChange={e => setData(d => ({ ...d, emergencyContact: { ...d.emergencyContact, [key]: e.target.value } }))} />
            </div>
          ))}
        </div>
        <div className="glass-card" style={{ padding: "24px" }}>
          <h3 style={{ margin: "0 0 16px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}><Activity size={18} /> Health Details</h3>
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>Blood Type</label>
            <select className="glass-input" disabled={!canEdit} value={data.bloodType || ""} onChange={e => setData(d => ({ ...d, bloodType: e.target.value }))}>
              <option value="">Select…</option>
              {BLOOD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>Special Physical Needs</label>
            <textarea className="glass-input" rows={4} disabled={!canEdit}
              placeholder="Describe any special physical requirements…"
              value={data.specialPhysicalNeeds || ""}
              onChange={e => setData(d => ({ ...d, specialPhysicalNeeds: e.target.value }))}
              style={{ resize: "vertical" }} />
          </div>
        </div>
      </div>

      {canEdit && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn-primary" onClick={save} disabled={saving} style={{ padding: "12px 28px" }}>
            {saving ? "Saving…" : (
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Save size={16} /> Save Medical Profile
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

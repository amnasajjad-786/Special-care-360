"use client";

import React, { useState, useEffect } from "react";
import { X, Calendar, AlertTriangle } from "lucide-react";

import { TherapySession, TherapyType, SessionType, TherapySessionStatus } from "@/types";
import { StudentDoc } from "@/lib/firestore-api";
import { detectTherapyConflict } from "@/lib/therapy-timeline-api";
import toast from "react-hot-toast";

export const THERAPY_TYPES: TherapyType[] = [
  "Speech Therapy",
  "Physiotherapy",
  "Occupational Therapy",
  "Behavioral Therapy",
  "Special Education",
  "Psychology Session",
  "Other",
];

export const SESSION_TYPES: SessionType[] = [
  "In-Person",
  "Tele-Therapy",
  "Home Session",
];

export const STATUS_OPTIONS: TherapySessionStatus[] = [
  "Scheduled",
  "Completed",
  "Cancelled",
  "Rescheduled",
  "No Show",
];

interface StaffOption {
  id: string;
  name: string;
  role: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<TherapySession>) => Promise<void>;
  editSession: TherapySession | null;
  students: StudentDoc[];
  staffList: StaffOption[];
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  centerId: string;
  defaultDate?: string;
}


export default function TherapySessionModal({
  isOpen,
  onClose,
  onSave,
  editSession,
  students,
  staffList,
  currentUserId,
  currentUserName,
  currentUserRole,
  centerId,
  defaultDate,
}: Props) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const [studentId, setStudentId] = useState("");
  const [therapistId, setTherapistId] = useState("");
  const [therapyType, setTherapyType] = useState<TherapyType>("Speech Therapy");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("Therapy Room 1");
  const [sessionType, setSessionType] = useState<SessionType>("In-Person");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<TherapySessionStatus>("Scheduled");
  const [repeatRule, setRepeatRule] = useState("none");
  const [saving, setSaving] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Initialize form state
  useEffect(() => {
    if (editSession) {
      setStudentId(editSession.studentId || "");
      setTherapistId(editSession.therapistId || "");
      setTherapyType((editSession.therapyType as TherapyType) || "Speech Therapy");
      setDate(editSession.date || (editSession.startDateTime ? editSession.startDateTime.substring(0, 10) : todayStr()));
      setStartTime(editSession.startTime || "09:00");
      setEndTime(editSession.endTime || "10:00");
      setLocation(editSession.location || "");
      setSessionType((editSession.sessionType as SessionType) || "In-Person");
      setNotes(editSession.notes || "");
      setStatus(editSession.status || "Scheduled");
      setRepeatRule(editSession.repeatRule || "none");
    } else {
      setStudentId(students[0]?.id || "");
      setTherapistId(currentUserRole === "therapist" ? currentUserId : (staffList[0]?.id || currentUserId));
      setTherapyType("Speech Therapy");
      setDate(defaultDate || todayStr());
      setStartTime("09:00");
      setEndTime("10:00");
      setLocation("Therapy Room 1");
      setSessionType("In-Person");
      setNotes("");
      setStatus("Scheduled");
      setRepeatRule("none");
    }
    setConflictWarning(null);
  }, [editSession, isOpen, students, staffList, currentUserId, currentUserRole, defaultDate]);

  // Live conflict detection on field changes
  useEffect(() => {
    if (!isOpen || !studentId || !therapistId || !date || !startTime || !endTime) {
      setConflictWarning(null);
      return;
    }

    if (endTime <= startTime) {
      setConflictWarning("End time must be after start time.");
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await detectTherapyConflict({
          centerId: centerId || "center-001",
          therapistId,
          studentId,
          date,
          startTime,
          endTime,
          excludeSessionId: editSession?.id,
        });

        if (result.hasConflict) {
          setConflictWarning(result.message || "Schedule Conflict: The therapist or student has an overlapping session.");
        } else {
          setConflictWarning(null);
        }
      } catch (err) {
        console.warn("Conflict detection check error:", err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [isOpen, studentId, therapistId, date, startTime, endTime, centerId, editSession]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!studentId) {
      toast.error("Student is required.");
      return;
    }
    if (!therapistId) {
      toast.error("Therapist is required.");
      return;
    }
    if (!date) {
      toast.error("Date is required.");
      return;
    }
    if (!startTime) {
      toast.error("Start time is required.");
      return;
    }
    if (!endTime) {
      toast.error("End time is required.");
      return;
    }
    if (endTime <= startTime) {
      toast.error("End time must be after start time.");
      return;
    }

    const selectedStudent = students.find((s) => s.id === studentId);
    const selectedTherapist = staffList.find((s) => s.id === therapistId);

    const studentName = selectedStudent ? selectedStudent.name : "Student";
    const therapistName = selectedTherapist
      ? selectedTherapist.name
      : (therapistId === currentUserId ? currentUserName : "Therapist");
    const parentId = selectedStudent?.parentId || null;

    setSaving(true);
    try {
      const payload = {
        studentId,
        studentName,
        therapistId,
        therapistName,
        therapyType,
        date,
        startTime,
        endTime,
        location: location.trim() || (sessionType === "Tele-Therapy" ? "Virtual Room" : sessionType === "Home Session" ? "Home Visit" : "Clinic Room"),
        sessionType,
        notes: notes.trim(),
        status,
        repeatRule: editSession ? "none" : repeatRule,
        parentId,
        centerId: centerId || "center-001",
      };

      await onSave(payload);
      toast.success(editSession ? "Therapy session updated." : "Therapy session scheduled successfully.");
      onClose();
    } catch (err: unknown) {
      console.error("Save session error:", err);
      const msg = err instanceof Error ? err.message : "Failed to schedule therapy session.";
      toast.error(msg);
      setConflictWarning(msg);
    } finally {
      setSaving(false);
    }

  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box animate-scale-up"
        style={{ maxWidth: "600px", width: "95%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", borderBottom: "1px solid rgba(61,79,107,0.1)", paddingBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "rgba(123,196,196,0.15)", color: "var(--accent-teal)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Calendar size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "var(--primary-dark)" }}>
                {editSession ? "Edit Therapy Session" : "Schedule Therapy Session"}
              </h2>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {editSession ? "Update session details and timing" : "Set up a new individual or tele-therapy appointment"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost"
            style={{ padding: "6px", display: "inline-flex", borderRadius: "8px" }}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Conflict Warning Banner */}
        {conflictWarning && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "10px",
              background: "rgba(229,62,62,0.1)",
              border: "1px solid rgba(229,62,62,0.3)",
              color: "var(--danger)",
              fontSize: "0.85rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "16px",
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>{conflictWarning}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Row 1: Student & Therapist */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--primary-dark)", marginBottom: "6px" }}>
                Student <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <select
                className="glass-input"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
                style={{ width: "100%" }}
              >
                <option value="">Select Student</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.diagnosis || "Active"})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--primary-dark)", marginBottom: "6px" }}>
                Therapist <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <select
                className="glass-input"
                value={therapistId}
                onChange={(e) => setTherapistId(e.target.value)}
                disabled={currentUserRole === "therapist"}
                required
                style={{ width: "100%" }}
              >
                <option value="">Select Therapist</option>
                {staffList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.role || "Therapist"})
                  </option>
                ))}
                {/* Ensure current therapist is present */}
                {currentUserRole === "therapist" && !staffList.some((s) => s.id === currentUserId) && (
                  <option value={currentUserId}>{currentUserName} (Therapist)</option>
                )}
              </select>
            </div>
          </div>

          {/* Row 2: Therapy Type & Session Type */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--primary-dark)", marginBottom: "6px" }}>
                Therapy Type <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <select
                className="glass-input"
                value={therapyType}
                onChange={(e) => setTherapyType(e.target.value as TherapyType)}
                required
                style={{ width: "100%" }}
              >
                {THERAPY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--primary-dark)", marginBottom: "6px" }}>
                Session Type <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <select
                className="glass-input"
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value as SessionType)}
                required
                style={{ width: "100%" }}
              >
                {SESSION_TYPES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 3: Date, Start Time & End Time */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--primary-dark)", marginBottom: "6px" }}>
                Date <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="date"
                className="glass-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--primary-dark)", marginBottom: "6px" }}>
                Start Time <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="time"
                className="glass-input"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--primary-dark)", marginBottom: "6px" }}>
                End Time <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="time"
                className="glass-input"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                style={{ width: "100%" }}
              />
            </div>
          </div>

          {/* Row 4: Location & Status */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--primary-dark)", marginBottom: "6px" }}>
                Location
              </label>
              <input
                type="text"
                className="glass-input"
                placeholder={sessionType === "Tele-Therapy" ? "Virtual Meeting Room" : "e.g. Speech Lab 201"}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--primary-dark)", marginBottom: "6px" }}>
                Status
              </label>
              <select
                className="glass-input"
                value={status}
                onChange={(e) => setStatus(e.target.value as TherapySessionStatus)}
                style={{ width: "100%" }}
              >
                {STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Repeat Session (Only on creation) */}
          {!editSession && (
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--primary-dark)", marginBottom: "6px" }}>
                Repeat Session
              </label>
              <select
                className="glass-input"
                value={repeatRule}
                onChange={(e) => setRepeatRule(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="none">Does not repeat (Single Session)</option>
                <option value="daily">Daily (for 5 consecutive days)</option>
                <option value="weekly">Weekly (for 4 weeks)</option>
                <option value="biweekly">Bi-Weekly (every 2 weeks, for 6 weeks)</option>
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--primary-dark)", marginBottom: "6px" }}>
              Clinical Notes / Objectives
            </label>
            <textarea
              className="glass-input"
              rows={3}
              placeholder="e.g. Focus on verbal vocalizations, fine motor skills, or sensory soothing..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>

          {/* Footer Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px", borderTop: "1px solid rgba(61,79,107,0.1)", paddingTop: "14px" }}>
            <button type="button" onClick={onClose} className="btn-ghost" disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || Boolean(conflictWarning && conflictWarning.includes("End time must"))}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              {saving ? "Saving..." : editSession ? "Update Session" : "Schedule Therapy"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

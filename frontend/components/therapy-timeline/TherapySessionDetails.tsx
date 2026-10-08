"use client";

import React from "react";
import {
  X,
  Clock,
  User,
  MapPin,
  Video,
  CheckCircle,
  XCircle,
  Edit2,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { TherapySession, TherapySessionStatus } from "@/types";
import Link from "next/link";


interface Props {
  session: TherapySession | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (session: TherapySession) => void;
  onDelete: (sessionId: string) => void;
  onStatusChange: (session: TherapySession, newStatus: TherapySessionStatus) => void;
  currentUserRole: string;
  currentUserId: string;
}

const STATUS_COLOR_MAP: Record<string, { bg: string; color: string; border: string }> = {
  Scheduled: { bg: "rgba(123, 196, 196, 0.15)", color: "#2c7a7b", border: "rgba(123, 196, 196, 0.4)" },
  scheduled: { bg: "rgba(123, 196, 196, 0.15)", color: "#2c7a7b", border: "rgba(123, 196, 196, 0.4)" },
  Completed: { bg: "rgba(104, 211, 145, 0.15)", color: "#276749", border: "rgba(104, 211, 145, 0.4)" },
  completed: { bg: "rgba(104, 211, 145, 0.15)", color: "#276749", border: "rgba(104, 211, 145, 0.4)" },
  Cancelled: { bg: "rgba(252, 129, 129, 0.15)", color: "#c53030", border: "rgba(252, 129, 129, 0.4)" },
  cancelled: { bg: "rgba(252, 129, 129, 0.15)", color: "#c53030", border: "rgba(252, 129, 129, 0.4)" },
  Rescheduled: { bg: "rgba(236, 201, 75, 0.15)", color: "#975a16", border: "rgba(236, 201, 75, 0.4)" },
  rescheduled: { bg: "rgba(236, 201, 75, 0.15)", color: "#975a16", border: "rgba(236, 201, 75, 0.4)" },
  "No Show": { bg: "rgba(229, 62, 62, 0.15)", color: "#9b2c2c", border: "rgba(229, 62, 62, 0.4)" },
  "no-show": { bg: "rgba(229, 62, 62, 0.15)", color: "#9b2c2c", border: "rgba(229, 62, 62, 0.4)" },
};

export default function TherapySessionDetails({
  session,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onStatusChange,
  currentUserRole,
  currentUserId,
}: Props) {
  if (!isOpen || !session) return null;

  const isAdmin = currentUserRole === "admin";
  const isTherapist = currentUserRole === "therapist";
  const isTeacher = currentUserRole === "teacher";


  // Permission checks
  const canEdit =
    isAdmin ||
    (isTherapist && (session.therapistId === currentUserId || session.createdBy === currentUserId)) ||
    (isTeacher && session.createdBy === currentUserId);

  const canDelete =
    isAdmin ||
    (isTherapist && (session.therapistId === currentUserId || session.createdBy === currentUserId));

  const canUpdateStatus = canEdit;

  const statusStyle =
    STATUS_COLOR_MAP[session.status] || STATUS_COLOR_MAP["Scheduled"];

  const isTeletherapy =
    String(session.sessionType).toLowerCase().includes("tele") ||
    session.sessionType === "Tele-Therapy";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box animate-scale-up"
        style={{ maxWidth: "540px", width: "95%" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: "999px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  background: statusStyle.bg,
                  color: statusStyle.color,
                  border: `1px solid ${statusStyle.border}`,
                }}
              >
                {session.status}
              </span>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: "999px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  background: "rgba(61,79,107,0.08)",
                  color: "var(--primary-dark)",
                }}
              >
                {session.sessionType}
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "var(--primary-dark)" }}>
              {session.therapyType}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost"
            style={{ padding: "6px", display: "inline-flex", borderRadius: "8px" }}
            aria-label="Close details"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "20px" }}>
          {/* Student & Therapist Info */}
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(61,79,107,0.1)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>
                Student
              </div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--primary-dark)", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
                <User size={15} style={{ color: "var(--accent-teal)" }} />
                {session.studentName}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>
                Therapist
              </div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--primary-dark)", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
                <User size={15} style={{ color: "#9b8ec4" }} />
                {session.therapistName}
              </div>
            </div>
          </div>

          {/* Time & Location */}
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(61,79,107,0.1)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>
                Date & Time
              </div>
              <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--primary-dark)", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
                <Clock size={15} style={{ color: "var(--accent-teal)" }} />
                <span>
                  {session.date || (session.startDateTime ? session.startDateTime.substring(0, 10) : "")} <br />
                  {session.startTime} - {session.endTime}
                </span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>
                Location
              </div>
              <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--primary-dark)", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
                {isTeletherapy ? <Video size={15} style={{ color: "#9b8ec4" }} /> : <MapPin size={15} style={{ color: "var(--accent-teal)" }} />}
                <span>{session.location || "On-site Clinic"}</span>
              </div>
            </div>
          </div>

          {/* Clinical Notes */}
          {session.notes && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(61,79,107,0.1)",
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>
                Notes & Objectives
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                {session.notes}
              </div>
            </div>
          )}

          {/* Tele-Therapy Integration CTA */}
          {isTeletherapy && (
            <div
              style={{
                padding: "14px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, rgba(184,168,212,0.2) 0%, rgba(123,196,196,0.2) 100%)",
                border: "1px solid rgba(184,168,212,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--primary-dark)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Video size={16} style={{ color: "#7a5ea7" }} /> Teletherapy Session Available
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                  Join the encrypted video consultation room for remote therapy.
                </div>
              </div>
              <Link
                href="/dashboard/teletherapy"
                className="btn-primary"
                style={{
                  padding: "8px 14px",
                  fontSize: "0.82rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  whiteSpace: "nowrap",
                  textDecoration: "none",
                }}
              >
                Join Session <ExternalLink size={14} />
              </Link>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div style={{ borderTop: "1px solid rgba(61,79,107,0.1)", paddingTop: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          {/* Status Quick Updates */}
          {canUpdateStatus && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {session.status !== "Completed" && (
                <button
                  onClick={() => onStatusChange(session, "Completed")}
                  className="btn-ghost"
                  style={{ padding: "6px 10px", fontSize: "0.78rem", color: "#276749", display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  <CheckCircle size={14} /> Mark Completed
                </button>
              )}
              {session.status !== "Cancelled" && (
                <button
                  onClick={() => onStatusChange(session, "Cancelled")}
                  className="btn-ghost"
                  style={{ padding: "6px 10px", fontSize: "0.78rem", color: "#c53030", display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  <XCircle size={14} /> Cancel Session
                </button>
              )}
            </div>
          )}

          {/* Edit / Delete / Close */}
          <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
            {canEdit && (
              <button
                onClick={() => {
                  onClose();
                  onEdit(session);
                }}
                className="btn-ghost"
                style={{ padding: "7px 12px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
              >
                <Edit2 size={14} /> Edit
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => {
                  if (confirm(`Are you sure you want to delete the ${session.therapyType} session for ${session.studentName}?`)) {
                    onDelete(session.id);
                    onClose();
                  }
                }}
                className="btn-ghost"
                style={{ padding: "7px 12px", fontSize: "0.82rem", color: "var(--danger)", display: "inline-flex", alignItems: "center", gap: "4px" }}
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
            <button onClick={onClose} className="btn-primary" style={{ padding: "7px 16px", fontSize: "0.82rem" }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useMemo } from "react";
import {
  Calendar,
  Clock,
  User,
  MapPin,
  Video,
  CheckCircle,
  ChevronRight,
} from "lucide-react";
import { TherapySession } from "@/types";
import Link from "next/link";


interface Props {
  sessions: TherapySession[];
  onSelectSession: (session: TherapySession) => void;
  showJoinButton?: boolean;
}

const THERAPY_TYPE_COLORS: Record<string, string> = {
  "Speech Therapy": "#7bc4c4",
  "Physiotherapy": "#9b8ec4",
  "Occupational Therapy": "#319795",
  "Behavioral Therapy": "#dd6b20",
  "Special Education": "#38a169",
  "Psychology Session": "#d69e2e",
  "Other": "#718096",
};

function format12h(time24: string): string {
  if (!time24) return "";
  const parts = time24.split(":");
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || "00";
  if (isNaN(hours)) return time24;
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr);
    return d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function TherapyTimelineView({
  sessions,
  onSelectSession,
  showJoinButton = true,
}: Props) {
  const now = new Date().toISOString().substring(0, 10);

  const { upcoming, past } = useMemo(() => {
    const up: TherapySession[] = [];
    const pa: TherapySession[] = [];

    sessions.forEach((s) => {
      const d = s.date || (s.startDateTime ? s.startDateTime.substring(0, 10) : "");
      if (d >= now && s.status !== "Completed" && s.status !== "completed") {
        up.push(s);
      } else {
        pa.push(s);
      }
    });

    up.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    pa.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    return { upcoming: up, past: pa };
  }, [sessions, now]);

  if (sessions.length === 0) {
    return (
      <div className="glass-card" style={{ padding: "48px 24px", textAlign: "center" }}>
        <Calendar size={48} style={{ color: "var(--text-secondary)", margin: "0 auto 16px", opacity: 0.5 }} />
        <h3 style={{ margin: 0, color: "var(--primary-dark)", fontSize: "1.1rem" }}>No Therapy Sessions Found</h3>
        <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          There are no scheduled therapy sessions matching the active filters.
        </p>
      </div>
    );
  }

  const renderSessionCard = (session: TherapySession) => {
    const color = THERAPY_TYPE_COLORS[session.therapyType as string] || "#7bc4c4";
    const isTele =
      String(session.sessionType).toLowerCase().includes("tele") ||
      session.sessionType === "Tele-Therapy";

    return (
      <div
        key={session.id}
        onClick={() => onSelectSession(session)}
        className="glass-card"
        style={{
          padding: "16px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderLeft: `4px solid ${color}`,
          cursor: "pointer",
          gap: "12px",
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "translateX(3px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "none";
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Top Line: Date, Time, Status */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--primary-dark)", display: "flex", alignItems: "center", gap: "4px" }}>
              <Clock size={13} style={{ color }} />
              {formatDate(session.date)} · {format12h(session.startTime)} - {format12h(session.endTime)}
            </span>
            <span
              style={{
                padding: "1px 8px",
                borderRadius: "999px",
                fontSize: "0.68rem",
                fontWeight: 700,
                background: "rgba(61,79,107,0.08)",
                color: "var(--primary-dark)",
              }}
            >
              {session.status}
            </span>
          </div>

          {/* Therapy Type */}
          <div style={{ fontSize: "0.98rem", fontWeight: 800, color: "var(--primary-dark)", marginBottom: "4px" }}>
            {session.therapyType}
          </div>

          {/* Student, Therapist & Location */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "0.8rem", color: "var(--text-secondary)", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, color: "var(--primary-dark)", display: "flex", alignItems: "center", gap: "4px" }}>
              <User size={13} style={{ color: "var(--accent-teal)" }} /> {session.studentName}
            </span>
            <span>Therapist: {session.therapistName}</span>
            <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
              {isTele ? <Video size={13} style={{ color: "#9b8ec4" }} /> : <MapPin size={13} style={{ color: "var(--accent-teal)" }} />}
              {session.location || (isTele ? "Virtual Room" : "Room 1")}
            </span>
          </div>
        </div>

        {/* Action button */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {showJoinButton && isTele && (
            <Link
              href="/dashboard/teletherapy"
              onClick={(e) => e.stopPropagation()}
              className="btn-primary"
              style={{ padding: "6px 12px", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px", textDecoration: "none" }}
            >
              <Video size={13} /> Join
            </Link>
          )}
          <ChevronRight size={18} style={{ color: "var(--text-secondary)" }} />
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* ── Upcoming Sessions ─────────────────────────────────────────────── */}
      {upcoming.length > 0 && (
        <div>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--primary-dark)", margin: "0 0 12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Calendar size={18} style={{ color: "var(--accent-teal)" }} /> Upcoming Sessions ({upcoming.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {upcoming.map(renderSessionCard)}
          </div>
        </div>
      )}

      {/* ── Past Sessions ─────────────────────────────────────────────────── */}
      {past.length > 0 && (
        <div>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--primary-dark)", margin: "0 0 12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <CheckCircle size={18} style={{ color: "#38a169" }} /> Previous Sessions ({past.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {past.map(renderSessionCard)}
          </div>
        </div>
      )}
    </div>
  );
}

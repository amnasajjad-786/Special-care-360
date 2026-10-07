"use client";

import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight, Clock, User, Plus, Video, Calendar as CalendarIcon } from "lucide-react";
import { TherapySession } from "@/types";


export type ViewMode = "month" | "week" | "day";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const THERAPY_TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "Speech Therapy": { bg: "rgba(123, 196, 196, 0.22)", border: "#7bc4c4", text: "#1a4949" },
  "Physiotherapy": { bg: "rgba(184, 168, 212, 0.22)", border: "#9b8ec4", text: "#3d2d61" },
  "Occupational Therapy": { bg: "rgba(79, 209, 197, 0.22)", border: "#319795", text: "#1d4044" },
  "Behavioral Therapy": { bg: "rgba(246, 173, 85, 0.22)", border: "#dd6b20", text: "#652b0d" },
  "Special Education": { bg: "rgba(104, 211, 145, 0.22)", border: "#38a169", text: "#1c452e" },
  "Psychology Session": { bg: "rgba(236, 201, 75, 0.22)", border: "#d69e2e", text: "#5f370e" },
  "Other": { bg: "rgba(160, 174, 192, 0.22)", border: "#718096", text: "#2d3748" },
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

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function startOfWeek(d: Date): Date {
  const res = new Date(d);
  res.setDate(res.getDate() - res.getDay());
  res.setHours(0, 0, 0, 0);
  return res;
}

interface Props {
  sessions: TherapySession[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  cursorDate: Date;
  onCursorChange: (d: Date) => void;
  onSelectSession: (s: TherapySession) => void;
  onOpenCreate: (dateStr?: string) => void;
  canCreate: boolean;
}

export default function TherapyCalendar({
  sessions,
  viewMode,
  onViewModeChange,
  cursorDate,
  onCursorChange,
  onSelectSession,
  onOpenCreate,
  canCreate,
}: Props) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const navigate = (dir: -1 | 1) => {
    const next = new Date(cursorDate);
    if (viewMode === "month") {
      next.setMonth(next.getMonth() + dir);
    } else if (viewMode === "week") {
      next.setDate(next.getDate() + dir * 7);
    } else {
      next.setDate(next.getDate() + dir);
    }
    onCursorChange(next);
  };

  const goToday = () => onCursorChange(new Date());

  const headerLabel = useMemo(() => {
    if (viewMode === "month") {
      return `${MONTHS[cursorDate.getMonth()]} ${cursorDate.getFullYear()}`;
    }
    if (viewMode === "week") {
      const sw = startOfWeek(cursorDate);
      const ew = new Date(sw);
      ew.setDate(ew.getDate() + 6);
      return `${sw.toLocaleDateString([], { month: "short", day: "numeric" })} – ${ew.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return cursorDate.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }, [cursorDate, viewMode]);

  // Generate Month Grid
  const monthDays = useMemo(() => {
    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: (Date | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) days.push(new Date(year, month, d));
    return days;
  }, [cursorDate]);

  // Generate Week Grid
  const weekDays = useMemo(() => {
    const sw = startOfWeek(cursorDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sw);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [cursorDate]);

  // Filter sessions by specific day
  const getSessionsForDay = (day: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const dStr = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;

    return sessions.filter((s) => {
      if (s.date) return s.date === dStr;
      if (s.startDateTime) return s.startDateTime.startsWith(dStr);
      if (s.scheduledAt) return s.scheduledAt.startsWith(dStr);
      return false;
    });
  };

  return (
    <div className="glass-card" style={{ padding: 0, overflow: "hidden", marginBottom: "20px" }}>
      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid rgba(61,79,107,0.1)",
          flexWrap: "wrap",
          gap: "12px",
          background: "rgba(255,255,255,0.4)",
        }}
      >
        {/* Navigation & Today */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={goToday}
            className="btn-ghost"
            style={{ padding: "6px 14px", fontSize: "0.82rem", fontWeight: 700 }}
          >
            Today
          </button>
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              onClick={() => navigate(-1)}
              className="btn-ghost"
              style={{ padding: "6px 10px" }}
              aria-label="Previous"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => navigate(1)}
              className="btn-ghost"
              style={{ padding: "6px 10px" }}
              aria-label="Next"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--primary-dark)", marginLeft: "8px" }}>
            {headerLabel}
          </span>
        </div>

        {/* View Mode Toggle */}
        <div style={{ display: "flex", border: "1px solid rgba(61,79,107,0.15)", borderRadius: "10px", overflow: "hidden", background: "rgba(255,255,255,0.5)" }}>
          {(["month", "week", "day"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              style={{
                padding: "8px 16px",
                border: "none",
                cursor: "pointer",
                fontSize: "0.82rem",
                fontWeight: 700,
                textTransform: "capitalize",
                background: viewMode === mode ? "var(--accent-teal)" : "transparent",
                color: viewMode === mode ? "white" : "var(--primary-dark)",
                transition: "all 0.15s ease",
              }}
            >
              {mode} View
            </button>
          ))}
        </div>
      </div>

      {/* ── 1. MONTH VIEW ─────────────────────────────────────────────────── */}
      {viewMode === "month" && (
        <div>
          {/* Weekday headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid rgba(61,79,107,0.08)", background: "rgba(61,79,107,0.02)" }}>
            {DAYS.map((d) => (
              <div key={d} style={{ padding: "10px 0", textAlign: "center", fontSize: "0.76rem", fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                {d}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {monthDays.map((day, idx) => {
              if (!day) {
                return (
                  <div
                    key={`empty-${idx}`}
                    style={{ minHeight: "120px", borderRight: "1px solid rgba(61,79,107,0.06)", borderBottom: "1px solid rgba(61,79,107,0.06)", background: "rgba(61,79,107,0.015)" }}
                  />
                );
              }

              const isCurrentDay = isSameDay(day, today);
              const daySessions = getSessionsForDay(day);
              const pad = (n: number) => String(n).padStart(2, "0");
              const dStr = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => {
                    if (canCreate) onOpenCreate(dStr);
                  }}
                  style={{
                    minHeight: "120px",
                    padding: "8px",
                    borderRight: "1px solid rgba(61,79,107,0.06)",
                    borderBottom: "1px solid rgba(61,79,107,0.06)",
                    background: isCurrentDay ? "rgba(123,196,196,0.07)" : "transparent",
                    cursor: canCreate ? "pointer" : "default",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (canCreate) (e.currentTarget as HTMLElement).style.background = isCurrentDay ? "rgba(123,196,196,0.12)" : "rgba(61,79,107,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = isCurrentDay ? "rgba(123,196,196,0.07)" : "transparent";
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: isCurrentDay ? "var(--accent-teal)" : "transparent",
                        color: isCurrentDay ? "white" : "var(--primary-dark)",
                        fontSize: "0.82rem",
                        fontWeight: isCurrentDay ? 800 : 600,
                      }}
                    >
                      {day.getDate()}
                    </span>
                    {daySessions.length > 0 && (
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                        {daySessions.length} {daySessions.length === 1 ? "session" : "sessions"}
                      </span>
                    )}
                  </div>

                  {/* Sessions list */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {daySessions.slice(0, 3).map((s) => {
                      const color = THERAPY_TYPE_COLORS[s.therapyType as string] || THERAPY_TYPE_COLORS["Other"];
                      return (
                        <div
                          key={s.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectSession(s);
                          }}
                          style={{
                            padding: "4px 6px",
                            borderRadius: "6px",
                            background: color.bg,
                            borderLeft: `3px solid ${color.border}`,
                            color: color.text,
                            fontSize: "0.72rem",
                            cursor: "pointer",
                            overflow: "hidden",
                            lineHeight: 1.3,
                          }}
                        >
                          <div style={{ fontWeight: 800 }}>{format12h(s.startTime)}</div>
                          <div style={{ fontWeight: 600, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {s.therapyType}
                          </div>
                          <div style={{ fontSize: "0.68rem", opacity: 0.85, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {s.studentName}
                          </div>
                        </div>
                      );
                    })}
                    {daySessions.length > 3 && (
                      <div style={{ fontSize: "0.7rem", color: "var(--accent-teal)", fontWeight: 700, paddingLeft: "4px" }}>
                        +{daySessions.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 2. WEEK VIEW (Default) ────────────────────────────────────────── */}
      {viewMode === "week" && (
        <div>
          {/* Weekday headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid rgba(61,79,107,0.08)", background: "rgba(61,79,107,0.02)" }}>
            {weekDays.map((day) => {
              const isCurrentDay = isSameDay(day, today);
              return (
                <div key={day.toISOString()} style={{ padding: "12px 8px", borderRight: "1px solid rgba(61,79,107,0.06)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)", fontWeight: 800, textTransform: "uppercase" }}>
                    {DAYS[day.getDay()]}
                  </div>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background: isCurrentDay ? "var(--accent-teal)" : "transparent",
                      color: isCurrentDay ? "white" : "var(--primary-dark)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "4px auto 0",
                      fontSize: "0.92rem",
                      fontWeight: 800,
                    }}
                  >
                    {day.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Week Columns */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", minHeight: "420px" }}>
            {weekDays.map((day) => {
              const isCurrentDay = isSameDay(day, today);
              const daySessions = getSessionsForDay(day);
              const pad = (n: number) => String(n).padStart(2, "0");
              const dStr = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => {
                    if (canCreate) onOpenCreate(dStr);
                  }}
                  style={{
                    borderRight: "1px solid rgba(61,79,107,0.06)",
                    padding: "10px 8px",
                    minHeight: "400px",
                    background: isCurrentDay ? "rgba(123,196,196,0.04)" : "transparent",
                    cursor: canCreate ? "pointer" : "default",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {daySessions.map((s) => {
                      const color = THERAPY_TYPE_COLORS[s.therapyType as string] || THERAPY_TYPE_COLORS["Other"];
                      return (
                        <div
                          key={s.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectSession(s);
                          }}
                          style={{
                            padding: "8px 10px",
                            borderRadius: "8px",
                            background: color.bg,
                            borderLeft: `4px solid ${color.border}`,
                            color: color.text,
                            cursor: "pointer",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                            transition: "transform 0.15s ease, box-shadow 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                            (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 10px rgba(0,0,0,0.08)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.transform = "none";
                            (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 6px rgba(0,0,0,0.04)";
                          }}
                        >
                          <div style={{ fontSize: "0.74rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "4px" }}>
                            <Clock size={12} />
                            {format12h(s.startTime)} - {format12h(s.endTime)}
                          </div>
                          <div style={{ fontWeight: 800, fontSize: "0.84rem", marginTop: "3px" }}>
                            {s.therapyType}
                          </div>
                          <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--primary-dark)", marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
                            <User size={12} /> {s.studentName}
                          </div>
                          <div style={{ fontSize: "0.72rem", opacity: 0.8, marginTop: "1px" }}>
                            Therapist: {s.therapistName}
                          </div>
                          {s.sessionType === "Tele-Therapy" && (
                            <div style={{ marginTop: "4px", display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "0.68rem", fontWeight: 700, color: "#6b46c1", background: "rgba(184,168,212,0.3)", padding: "1px 6px", borderRadius: "4px" }}>
                              <Video size={10} /> Tele-Therapy
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {daySessions.length === 0 && canCreate && (
                      <div
                        style={{
                          height: "100px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "8px",
                          border: "1px dashed rgba(61,79,107,0.15)",
                          color: "var(--text-secondary)",
                          fontSize: "0.75rem",
                        }}
                      >
                        + Slot
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. DAY VIEW ───────────────────────────────────────────────────── */}
      {viewMode === "day" && (
        <div style={{ padding: "20px" }}>
          {getSessionsForDay(cursorDate).length === 0 ? (
            <div style={{ padding: "50px 20px", textAlign: "center", color: "var(--text-secondary)" }}>
              <CalendarIcon size={44} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
              <h3 style={{ margin: 0, color: "var(--primary-dark)" }}>No therapy sessions on this day</h3>
              <p style={{ margin: "6px 0 16px", fontSize: "0.88rem" }}>
                {canCreate ? "Schedule a new therapy session using the button below." : "Check other dates or filters."}
              </p>
              {canCreate && (
                <button
                  onClick={() => {
                    const pad = (n: number) => String(n).padStart(2, "0");
                    onOpenCreate(`${cursorDate.getFullYear()}-${pad(cursorDate.getMonth() + 1)}-${pad(cursorDate.getDate())}`);
                  }}
                  className="btn-primary"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", margin: "0 auto" }}
                >
                  <Plus size={16} /> Schedule Session
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {getSessionsForDay(cursorDate).map((s) => {
                const color = THERAPY_TYPE_COLORS[s.therapyType as string] || THERAPY_TYPE_COLORS["Other"];
                return (
                  <div
                    key={s.id}
                    onClick={() => onSelectSession(s)}
                    className="glass-card"
                    style={{
                      padding: "16px 20px",
                      cursor: "pointer",
                      borderLeft: `5px solid ${color.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "14px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: "10px",
                          background: color.bg,
                          color: color.text,
                          fontWeight: 800,
                          fontSize: "0.85rem",
                          textAlign: "center",
                          minWidth: "90px",
                        }}
                      >
                        {format12h(s.startTime)}
                        <div style={{ fontSize: "0.72rem", opacity: 0.8 }}>to {format12h(s.endTime)}</div>
                      </div>

                      <div>
                        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--primary-dark)" }}>
                          {s.therapyType}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "4px", fontSize: "0.85rem", color: "var(--text-secondary)", flexWrap: "wrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 700, color: "var(--primary-dark)" }}>
                            <User size={14} style={{ color: "var(--accent-teal)" }} /> {s.studentName}
                          </span>
                          <span>Therapist: {s.therapistName}</span>
                          <span>Location: {s.location || "Clinic Room"}</span>
                        </div>
                        {s.notes && (
                          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "6px" }}>
                            {s.notes}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          padding: "4px 12px",
                          borderRadius: "999px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          background: "rgba(123, 196, 196, 0.15)",
                          color: "#2c7a7b",
                          border: "1px solid rgba(123, 196, 196, 0.3)",
                        }}
                      >
                        {s.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

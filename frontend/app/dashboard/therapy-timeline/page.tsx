"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { scopeOf, studentsDb, adminDb, type StudentDoc } from "@/lib/firestore-api";
import { therapyTimelineDb } from "@/lib/therapy-timeline-api";
import { TherapySession, TherapySessionStatus } from "@/types";
import TherapyCalendar, { ViewMode } from "@/components/therapy-timeline/TherapyCalendar";
import TherapyTimelineView from "@/components/therapy-timeline/TherapyTimelineView";
import TherapyFilters from "@/components/therapy-timeline/TherapyFilters";
import TherapySessionModal from "@/components/therapy-timeline/TherapySessionModal";
import TherapySessionDetails from "@/components/therapy-timeline/TherapySessionDetails";
import { Calendar, Plus, List, LayoutGrid, AlertCircle, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";

interface StaffOption {
  id: string;
  name: string;
  role: string;
}

export default function DynamicTherapyTimelinePage() {
  const { profile } = useAuth();
  const scope = useMemo(() => scopeOf(profile), [profile]);

  // Data states
  const [sessions, setSessions] = useState<TherapySession[]>([]);
  const [students, setStudents] = useState<StudentDoc[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Calendar View State: Default is Week View
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [cursorDate, setCursorDate] = useState<Date>(new Date());
  const [layoutStyle, setLayoutStyle] = useState<"calendar" | "timeline">("calendar");

  // Filter states
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedTherapist, setSelectedTherapist] = useState("");
  const [selectedTherapyType, setSelectedTherapyType] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<TherapySession | null>(null);
  const [selectedDetailSession, setSelectedDetailSession] = useState<TherapySession | null>(null);
  const [defaultModalDate, setDefaultModalDate] = useState<string | undefined>(undefined);

  const currentUserRole = profile?.role || "parent";
  const isParent = currentUserRole === "parent";
  const canCreate = currentUserRole === "admin" || currentUserRole === "therapist" || currentUserRole === "teacher";

  // ── 1. Live Firestore Subscription ──────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    setLoadError(false);

    const unsub = therapyTimelineDb.subscribe(
      scope,
      (data) => {
        setSessions(data);
        setLoading(false);
      },
      (err) => {
        console.error("Therapy timeline subscription error:", err);
        setLoadError(true);
        setLoading(false);
        toast.error("Failed to load therapy sessions.");
      }
    );

    return () => unsub();
  }, [profile, scope]);

  // ── 2. Load Students and Staff Directory ───────────────────────────────────
  useEffect(() => {
    if (!profile) return;

    // Load students
    studentsDb
      .list(scope)
      .then((res) => setStudents(res))
      .catch((err) => {
        console.warn("Could not load students for therapy timeline:", err);
      });

    // Load staff (therapists and teachers)
    if (!isParent && profile.centerId) {
      adminDb
        .listStaff(profile.centerId)
        .then((items) => {
          const formatted = (items as Array<{ id: string; name?: string; role?: string; subRole?: string }>).map((s) => ({
            id: String(s.id),
            name: String(s.name || "Therapist"),
            role: String(s.role || s.subRole || "Therapist"),
          }));
          setStaffList(formatted);
        })
        .catch((err) => {
          console.warn("Could not load staff list:", err);
        });
    }


  }, [profile, scope, isParent]);

  // ── 3. Filtered Sessions Calculation ──────────────────────────────────────
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesStudent = s.studentName?.toLowerCase().includes(q);
        const matchesTherapist = s.therapistName?.toLowerCase().includes(q);
        const matchesType = s.therapyType?.toLowerCase().includes(q);
        const matchesNotes = s.notes?.toLowerCase().includes(q);
        const matchesLocation = s.location?.toLowerCase().includes(q);
        if (!matchesStudent && !matchesTherapist && !matchesType && !matchesNotes && !matchesLocation) {
          return false;
        }
      }

      // Dropdown filters
      if (selectedStudent && s.studentId !== selectedStudent) return false;
      if (selectedTherapist && s.therapistId !== selectedTherapist) return false;
      if (selectedTherapyType && s.therapyType !== selectedTherapyType) return false;
      if (selectedStatus && s.status !== selectedStatus) return false;

      return true;
    });
  }, [sessions, search, selectedStudent, selectedTherapist, selectedTherapyType, selectedStatus]);

  // ── 4. Handlers ───────────────────────────────────────────────────────────
  const handleOpenCreate = (dateStr?: string) => {
    setEditingSession(null);
    setDefaultModalDate(dateStr);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (session: TherapySession) => {
    setEditingSession(session);
    setIsModalOpen(true);
  };

  const handleSaveSession = async (payload: Partial<TherapySession>) => {
    if (!profile) return;

    if (editingSession) {
      await therapyTimelineDb.update(editingSession.id, payload, {
        uid: profile.uid,
        name: profile.name,
      });
      // Update local detailed session if currently viewing it
      if (selectedDetailSession?.id === editingSession.id) {
        setSelectedDetailSession({
          ...selectedDetailSession,
          ...payload,
        });
      }
    } else {
      await therapyTimelineDb.create(payload as Omit<TherapySession, "id" | "createdAt" | "updatedAt">, {
        uid: profile.uid,
        name: profile.name,
        role: profile.role,
        centerId: profile.centerId,
      });
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await therapyTimelineDb.delete(sessionId);
      toast.success("Therapy session deleted successfully.");
      if (selectedDetailSession?.id === sessionId) {
        setSelectedDetailSession(null);
      }
    } catch (err: unknown) {
      console.error("Delete session error:", err);
      const msg = err instanceof Error ? err.message : "Failed to delete session.";
      toast.error(msg);
    }
  };

  const handleStatusChange = async (session: TherapySession, newStatus: TherapySessionStatus) => {
    try {
      await therapyTimelineDb.update(session.id, { status: newStatus });
      toast.success(`Session status updated to ${newStatus}.`);
      if (selectedDetailSession?.id === session.id) {
        setSelectedDetailSession({
          ...selectedDetailSession,
          status: newStatus,
        });
      }
    } catch (err: unknown) {
      console.error("Status update error:", err);
      const msg = err instanceof Error ? err.message : "Could not update session status.";
      toast.error(msg);
    }
  };


  const handleClearFilters = () => {
    setSearch("");
    setSelectedStudent("");
    setSelectedTherapist("");
    setSelectedTherapyType("");
    setSelectedStatus("");
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: "40px" }}>
      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.85rem",
              fontWeight: 800,
              color: "var(--primary-dark)",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <Calendar size={28} style={{ color: "var(--accent-teal)" }} />
            Dynamic Therapy Timeline
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            {isParent
              ? "Comprehensive timeline of your child's past, present, and upcoming therapy appointments."
              : "Manage center-wide therapy appointments, real-time conflict detection, and tele-therapy scheduling."}
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* View Style Switcher (Calendar vs Timeline List) */}
          <div
            style={{
              display: "flex",
              border: "1px solid rgba(61,79,107,0.15)",
              borderRadius: "10px",
              overflow: "hidden",
              background: "rgba(255,255,255,0.5)",
            }}
          >
            <button
              onClick={() => setLayoutStyle("calendar")}
              className="btn-ghost"
              style={{
                padding: "8px 12px",
                border: "none",
                borderRadius: 0,
                background: layoutStyle === "calendar" ? "var(--accent-teal)" : "transparent",
                color: layoutStyle === "calendar" ? "white" : "var(--primary-dark)",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "0.82rem",
                fontWeight: 700,
              }}
              aria-label="Calendar view"
            >
              <LayoutGrid size={15} /> Calendar
            </button>
            <button
              onClick={() => setLayoutStyle("timeline")}
              className="btn-ghost"
              style={{
                padding: "8px 12px",
                border: "none",
                borderRadius: 0,
                background: layoutStyle === "timeline" ? "var(--accent-teal)" : "transparent",
                color: layoutStyle === "timeline" ? "white" : "var(--primary-dark)",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "0.82rem",
                fontWeight: 700,
              }}
              aria-label="Timeline list view"
            >
              <List size={15} /> Timeline
            </button>
          </div>

          {/* Schedule Therapy CTA */}
          {canCreate && (
            <button
              onClick={() => handleOpenCreate()}
              className="btn-primary"
              style={{
                padding: "9px 18px",
                fontSize: "0.88rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Plus size={16} /> + Schedule Therapy
            </button>
          )}
        </div>
      </div>

      {/* ── Filters Bar ────────────────────────────────────────────────────── */}
      <TherapyFilters
        search={search}
        onSearchChange={setSearch}
        selectedStudent={selectedStudent}
        onStudentChange={setSelectedStudent}
        selectedTherapist={selectedTherapist}
        onTherapistChange={setSelectedTherapist}
        selectedTherapyType={selectedTherapyType}
        onTherapyTypeChange={setSelectedTherapyType}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        students={students}
        staffList={staffList}
        isParent={isParent}
        onClear={handleClearFilters}
      />

      {/* ── Error Banner ────────────────────────────────────────────────────── */}
      {loadError && (
        <div
          className="glass-card"
          style={{
            padding: "16px",
            marginBottom: "20px",
            background: "rgba(229,62,62,0.1)",
            border: "1px solid rgba(229,62,62,0.3)",
            color: "var(--danger)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertCircle size={20} />
            <span>Could not connect to therapy sessions database.</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="btn-ghost"
            style={{ padding: "6px 12px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {/* ── Main View (Calendar or Timeline) ────────────────────────────────── */}
      {loading ? (
        <div className="glass-card" style={{ padding: "60px", textAlign: "center", color: "var(--text-secondary)" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: "3px solid var(--accent-teal)",
              borderTopColor: "transparent",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p style={{ margin: 0, fontWeight: 600 }}>Loading Therapy Schedule...</p>
        </div>
      ) : layoutStyle === "calendar" ? (
        <TherapyCalendar
          sessions={filteredSessions}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          cursorDate={cursorDate}
          onCursorChange={setCursorDate}
          onSelectSession={(s) => setSelectedDetailSession(s)}
          onOpenCreate={handleOpenCreate}
          canCreate={canCreate}
        />
      ) : (
        <TherapyTimelineView
          sessions={filteredSessions}
          onSelectSession={(s) => setSelectedDetailSession(s)}
          showJoinButton={true}
        />
      )}

      {/* ── Create / Edit Session Modal ─────────────────────────────────────── */}
      <TherapySessionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveSession}
        editSession={editingSession}
        students={students}
        staffList={staffList}
        currentUserId={profile?.uid || ""}
        currentUserName={profile?.name || ""}
        currentUserRole={currentUserRole}
        centerId={profile?.centerId || "center-001"}
        defaultDate={defaultModalDate}
      />

      {/* ── Session Details Modal ───────────────────────────────────────────── */}
      <TherapySessionDetails
        session={selectedDetailSession}
        isOpen={Boolean(selectedDetailSession)}
        onClose={() => setSelectedDetailSession(null)}
        onEdit={(s) => {
          setSelectedDetailSession(null);
          handleOpenEdit(s);
        }}
        onDelete={handleDeleteSession}
        onStatusChange={handleStatusChange}
        currentUserRole={currentUserRole}
        currentUserId={profile?.uid || ""}
      />
    </div>
  );
}

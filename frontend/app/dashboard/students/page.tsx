"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { studentsDb } from "@/lib/firestore-api";
import { Student, MedicalProfile, CarePlan } from "@/types";
import StudentListSidebar from "@/components/students/StudentListSidebar";
import OverviewTab from "@/components/students/OverviewTab";
import MedicalTab from "@/components/students/MedicalTab";
import CarePlanTab from "@/components/students/CarePlanTab";
import EmergencyTab from "@/components/students/EmergencyTab";
import toast from "react-hot-toast";

const TABS = ["Overview", "Medical", "Care Plan", "Emergency"];


/* ── SHA-256 helper for parent password ──────────────────────────────────── */
const hashPassword = async (s: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export default function StudentsPage() {
  const { profile } = useAuth();

  const [students,      setStudents]      = useState<Student[]>([]);
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [search,        setSearch]        = useState("");
  const [activeTab,     setActiveTab]     = useState("Overview");
  const [listLoading,   setListLoading]   = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [medical,       setMedical]       = useState<MedicalProfile | null>(null);
  const [carePlan,      setCarePlan]      = useState<CarePlan | null>(null);

  // Parent password modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [enteredPassword,   setEnteredPassword]   = useState("");
  const [confirmPassword,   setConfirmPassword]   = useState("");
  const [showPassword,      setShowPassword]      = useState(false);
  const [pendingStudentId,  setPendingStudentId]  = useState<string | null>(null);
  const [hasPassword,       setHasPassword]       = useState(false);
  const [showResetModal,    setShowResetModal]    = useState(false);

  const filteredStudents = students.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );
  const selectedStudent = students.find((s) => s.id === selectedId) || null;
  const canEdit = profile?.role === "admin" || profile?.role === "therapist";

  /* ── Init hasPassword from localStorage (client-only) ─────────────────── */
  useEffect(() => {
    setHasPassword(!!localStorage.getItem("parentPassword"));
    const saved = localStorage.getItem("selectedStudentId");
    if (saved) setSelectedId(saved);
  }, []);

  /* ── Load student list ─────────────────────────────────────────────────── */
  useEffect(() => {
    const loadStudents = async () => {
      setListLoading(true);
      try {
        const allowed = await studentsDb.list(
          profile?.centerId ?? "center-001",
          profile?.role,
          profile?.uid
        );
        setStudents(allowed as unknown as Student[]);

        const storedId = localStorage.getItem("selectedStudentId");
        if (allowed.length > 0) {
          if (!storedId || !allowed.some((s) => s.id === storedId)) {
            setSelectedId(allowed[0].id);
          } else {
            setSelectedId(storedId);
          }
        } else {
          setSelectedId(null);
        }
      } catch (err) {
        console.error("Failed to load students:", err);
        toast.error("Failed to load students.");
        setStudents([]);
        setSelectedId(null);
      }
      setListLoading(false);
    };
    if (profile) {
      loadStudents();
    }
  }, [profile]);

  /* ── Persist selected student ──────────────────────────────────────────── */
  useEffect(() => {
    if (selectedId) localStorage.setItem("selectedStudentId", selectedId);
  }, [selectedId]);

  /* ── Load student detail (medical + care plan) ─────────────────────────── */
  useEffect(() => {
    if (!selectedId) return;
    setMedical(null);
    setCarePlan(null);
    setDetailLoading(true);

    const loadDetail = async () => {
      try {
        const [medData, cpData] = await Promise.all([
          studentsDb.getMedical(selectedId),
          studentsDb.getCarePlan(selectedId),
        ]);
        setMedical(medData as unknown as MedicalProfile);
        setCarePlan(cpData as unknown as CarePlan);
      } catch (err) {
        console.error("Failed to load student details:", err);
        toast.error("Failed to load student details");
        setMedical(null);
        setCarePlan(null);
      } finally {
        setDetailLoading(false);
      }
    };
    loadDetail();
  }, [selectedId]);

  /* ── Select student (with parent password gate) ─────────────────────────── */
  const handleSelect = (id: string) => {
    if (profile?.role === "parent") {
      setPendingStudentId(id);
      setEnteredPassword("");
      setConfirmPassword("");
      setShowPasswordModal(true);
      return;
    }
    setSelectedId(id);
    setActiveTab("Overview");
  };



  /* ── Parent password verify / create ─────────────────────────────────── */
  const verifyPassword = async () => {
    if (!pendingStudentId) { toast.error("No student selected"); return; }
    const saved = localStorage.getItem("parentPassword");
    const pw = enteredPassword.trim();
    if (!pw) { toast.error("Password cannot be empty"); return; }

    if (!saved) {
      if (pw.length < 4) { toast.error("Password must be at least 4 characters"); return; }
      if (pw !== confirmPassword.trim()) { toast.error("Passwords do not match"); return; }
      localStorage.setItem("parentPassword", await hashPassword(pw));
      setHasPassword(true);
      toast.success("Password created");
    } else {
      if ((await hashPassword(pw)) !== saved) { toast.error("Incorrect password"); return; }
      toast.success("Access granted");
    }

    setSelectedId(pendingStudentId);
    setActiveTab("Overview");
    closeModals();
  };

  /* ── Reset parent password ─────────────────────────────────────────────── */
  const handleResetPassword = () => {
    if (!localStorage.getItem("parentPassword")) { toast.error("No password set"); return; }
    localStorage.removeItem("parentPassword");
    setHasPassword(false);
    toast.success("Password reset — you'll be asked to create a new one");
    closeModals();
  };

  const closeModals = () => {
    setShowPasswordModal(false);
    setShowResetModal(false);
    setEnteredPassword("");
    setConfirmPassword("");
    setPendingStudentId(null);
    setShowPassword(false);
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <>
      <div style={{ display: "flex", gap: "24px", minHeight: "calc(100vh - 120px)" }}>

        {/* LEFT — Student list */}
        <StudentListSidebar
          students={filteredStudents}
          selectedId={selectedId}
          search={search}
          onSearch={setSearch}
          onSelect={handleSelect}
          loading={listLoading}
        />

        {/* RIGHT — Profile detail */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedStudent ? (
            <div className="glass-card animate-fade-in" style={{ padding: "60px", textAlign: "center" }}>
              <div style={{ fontSize: "52px", marginBottom: "16px" }}>👤</div>
              <h2 style={{ margin: 0, color: "var(--primary-dark)" }}>Select a Student</h2>
              <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
                Choose a student from the list to view their profile
              </p>
            </div>
          ) : (
            <>
              {/* Tab bar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                <div className="tab-bar">
                  {TABS.map((tab) => (
                    <button
                      key={tab}
                      className={`tab-item${activeTab === tab ? " active" : ""}`}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab === "Overview" ? "👤" : tab === "Medical" ? "💊" : tab === "Care Plan" ? "🎯" : "🚨"} {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              {detailLoading ? (
                <div className="glass-card" style={{ padding: "40px", textAlign: "center" }}>
                  <div className="skeleton" style={{ height: "200px", borderRadius: "12px" }} />
                </div>
              ) : (
                <>
                  {activeTab === "Overview" && <OverviewTab student={selectedStudent} />}
                  {activeTab === "Medical" && (
                    medical
                      ? <MedicalTab studentId={selectedStudent.id} profile={medical} canEdit={canEdit} onChange={setMedical} />
                      : <div className="glass-card" style={{ padding: "40px", textAlign: "center" }}>
                          <div className="skeleton" style={{ height: "200px", borderRadius: "12px" }} />
                        </div>
                  )}
                  {activeTab === "Care Plan" && (
                    carePlan
                      ? <CarePlanTab studentId={selectedStudent.id} carePlan={carePlan} canEdit={canEdit} onChange={setCarePlan} />
                      : <div className="glass-card" style={{ padding: "40px", textAlign: "center" }}>
                          <div className="skeleton" style={{ height: "200px", borderRadius: "12px" }} />
                        </div>
                  )}
                  {activeTab === "Emergency" && medical && (
                    <EmergencyTab
                      studentId={selectedStudent.id}
                      studentName={selectedStudent.name}
                      medical={medical}
                      canEdit={canEdit}
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Parent Password Modal ─────────────────────────────────────────── */}
      {showPasswordModal && (
        <div style={modalStyle}>
          <div className="glass-card animate-fade-in" style={{ padding: "28px", width: "340px" }}>
            <h3 style={{ margin: "0 0 16px", color: "var(--primary-dark)" }}>
              {hasPassword ? "🔒 Enter Password" : "🔑 Create Password"}
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 14px" }}>
              {hasPassword
                ? "Enter your parent access password to view this profile."
                : "Create a PIN to protect student profile access."}
            </p>

            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={enteredPassword}
                className="glass-input"
                onChange={(e) => setEnteredPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifyPassword()}
                style={{ paddingRight: "42px" }}
              />
              <span
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", fontSize: "1.1rem" }}
              >
                {showPassword ? "🙈" : "👁️"}
              </span>
            </div>

            {!hasPassword && (
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Confirm password"
                value={confirmPassword}
                className="glass-input"
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifyPassword()}
                style={{ marginTop: "10px" }}
              />
            )}

            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={verifyPassword}>
                {hasPassword ? "Verify" : "Create"}
              </button>
              <button className="btn-ghost" onClick={closeModals}>Cancel</button>
            </div>

            {hasPassword && (
              <div
                onClick={() => setShowResetModal(true)}
                style={{ marginTop: "12px", fontSize: "0.78rem", color: "var(--danger)", cursor: "pointer", textAlign: "center" }}
              >
                Forgot / Reset Password
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Reset Password Modal ──────────────────────────────────────────── */}
      {showResetModal && (
        <div style={modalStyle}>
          <div className="glass-card animate-fade-in" style={{ padding: "28px", width: "340px" }}>
            <h3 style={{ margin: "0 0 12px", color: "var(--primary-dark)" }}>Reset Password</h3>
            <p style={{ fontSize: "0.84rem", color: "var(--text-secondary)", margin: "0 0 20px" }}>
              This will clear the current password. You&apos;ll set a new one next time you open a profile.
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn-danger" style={{ flex: 1 }} onClick={handleResetPassword}>Reset</button>
              <button className="btn-ghost" onClick={closeModals}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const modalStyle: React.CSSProperties = {
  position: "fixed",
  top: 0, left: 0,
  width: "100%", height: "100%",
  background: "rgba(30,40,60,0.5)",
  backdropFilter: "blur(4px)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};

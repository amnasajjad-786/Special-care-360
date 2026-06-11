"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { studentsApi } from "@/lib/api";
import { Student, MedicalProfile, CarePlan } from "@/types";
import StudentListSidebar from "@/components/students/StudentListSidebar";
import OverviewTab from "@/components/students/OverviewTab";
import MedicalTab from "@/components/students/MedicalTab";
import CarePlanTab from "@/components/students/CarePlanTab";
import EmergencyTab from "@/components/students/EmergencyTab";
import toast from "react-hot-toast";

/* ── Mock data (fallback when API / Firebase not configured) ──────────────── */
const MOCK_STUDENTS: Student[] = [
  { id: "s1", name: "Ali Hassan",   dob: "2015-03-12", diagnosis: "ASD",           centerId: "demo-center-001", teacherId: "t1", therapistIds: ["th1"],        enrollmentDate: "2022-09-01", iepStatus: "Active", parentId: "parent-001" },
  { id: "s2", name: "Sara Ahmed",   dob: "2016-07-24", diagnosis: "ADHD",          centerId: "demo-center-001", teacherId: "t1", therapistIds: [],             enrollmentDate: "2023-01-15", iepStatus: "Active" },
  { id: "s3", name: "Omar Malik",   dob: "2014-11-05", diagnosis: "Down Syndrome", centerId: "demo-center-001", teacherId: "t2", therapistIds: ["th1","th2"],   enrollmentDate: "2021-06-01", iepStatus: "Under Review" },
  { id: "s4", name: "Zara Khan",    dob: "2017-04-19", diagnosis: "Cerebral Palsy",centerId: "demo-center-001", teacherId: "t1", therapistIds: ["th2"],         enrollmentDate: "2023-08-10", iepStatus: "Active" },
];

const MOCK_MEDICAL: MedicalProfile = {
  allergies: ["Peanuts", "Latex"],
  seizureHistory: {
    hasHistory: true,
    frequency: "Monthly",
    lastOccurrence: "2026-03-15",
    protocol: "1. Keep student calm\n2. Clear area\n3. Do not restrain\n4. Call nurse",
  },
  medications: [
    { name: "Ritalin", dosage: "10mg", frequency: "Daily", time: "8:00 AM", administeredBy: "Nurse" },
  ],
  emergencyContact: { name: "Ahmed Hassan", relation: "Father", phone: "+92-300-1234567" },
  bloodType: "A+",
  specialPhysicalNeeds: "Wheelchair accessible classroom required",
};

const MOCK_CAREPLAN: CarePlan = {
  goals: [
    { id: "g1", title: "Improve verbal communication",       status: "In Progress", progressPercent: 60  },
    { id: "g2", title: "Independent dressing",               status: "Mastered",    progressPercent: 100 },
    { id: "g3", title: "Social interaction with peers",      status: "In Progress", progressPercent: 35  },
    { id: "g4", title: "Following 2-step instructions",      status: "Regressed",   progressPercent: 20  },
  ],
};

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
        const res = await studentsApi.list();
        const allowed = profile?.role === "parent"
          ? res.data.filter((s: any) => s.parentId === profile.uid)
          : res.data;
        setStudents(allowed);
        
        const storedId = localStorage.getItem("selectedStudentId");
        if (allowed.length > 0) {
          if (!storedId || !allowed.some((s: any) => s.id === storedId)) {
            setSelectedId(allowed[0].id);
          } else {
            setSelectedId(storedId);
          }
        } else {
          setSelectedId(null);
        }
      } catch {
        const allowed = profile?.role === "parent"
          ? MOCK_STUDENTS.filter((s) => s.parentId === profile.uid)
          : MOCK_STUDENTS;
        setStudents(allowed);
        
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
        const [medRes, cpRes] = await Promise.all([
          studentsApi.getMedical(selectedId),
          studentsApi.getCarePlan(selectedId),
        ]);
        setMedical(medRes.data);
        setCarePlan(cpRes.data);
      } catch {
        setMedical(MOCK_MEDICAL);
        setCarePlan(MOCK_CAREPLAN);
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

  /* ── Save changes ─────────────────────────────────────────────────────── */
  const handleSave = async () => {
    if (!selectedStudent) return;
    try {
      if (activeTab === "Medical" && medical) {
        await (studentsApi as any).updateMedical(selectedStudent.id, medical);
      } else if (activeTab === "Care Plan" && carePlan) {
        await (studentsApi as any).updateCarePlan(selectedStudent.id, carePlan);
      } else {
        toast("Nothing to save on this tab");
        return;
      }
      toast.success("Saved successfully");
    } catch {
      if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" || typeof window !== "undefined") {
        toast.success("Saved successfully (demo mode)");
      } else {
        toast.error("Save failed");
      }
    }
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
                {canEdit && (
                  <button className="btn-primary" style={{ padding: "8px 18px", fontSize: "0.85rem" }} onClick={handleSave}>
                    💾 Save
                  </button>
                )}
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
                      ? <MedicalTab studentId={selectedStudent.id} profile={medical} canEdit={canEdit} />
                      : <div className="glass-card" style={{ padding: "40px", textAlign: "center" }}>
                          <div className="skeleton" style={{ height: "200px", borderRadius: "12px" }} />
                        </div>
                  )}
                  {activeTab === "Care Plan" && (
                    carePlan
                      ? <CarePlanTab studentId={selectedStudent.id} carePlan={carePlan} canEdit={canEdit} />
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

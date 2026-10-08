"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { studentsDb, scopeOf } from "@/lib/firestore-api";
import { Student, MedicalProfile, CarePlan } from "@/types";
import StudentListSidebar from "@/components/students/StudentListSidebar";
import OverviewTab from "@/components/students/OverviewTab";
import MedicalTab from "@/components/students/MedicalTab";
import CarePlanTab from "@/components/students/CarePlanTab";
import TeacherCarePlanTab from "@/components/students/TeacherCarePlanTab";
import EmergencyTab from "@/components/students/EmergencyTab";
import RegressionAlertsBanner from "@/components/students/RegressionAlertsBanner";
import toast from "react-hot-toast";
import { User, Heart, Target, AlertTriangle } from "lucide-react";

const TABS = ["Overview", "Medical", "Care Plan", "Emergency"];


export default function StudentsPage() {
  const { profile } = useAuth();

  const [students,      setStudents]      = useState<Student[]>([]);
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [search,        setSearch]        = useState("");
  const [activeTab,     setActiveTab]     = useState("Overview");
  const [listLoading,   setListLoading]   = useState(true);
  const [listError, setListError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [medical,       setMedical]       = useState<MedicalProfile | null>(null);
  const [carePlan,      setCarePlan]      = useState<CarePlan | null>(null);



  const filteredStudents = students.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );
  const selectedStudent = students.find((s) => s.id === selectedId) || null;
  const canEdit = profile?.role === "admin" || profile?.role === "therapist";
  // Only the therapist may create/edit/delete Care Plan goals.
  // Admin, teacher, and parent all get read-only view.
  const canEditCarePlan = profile?.role === "therapist";

  /* ── Init hasPassword from localStorage (client-only) ─────────────────── */
  useEffect(() => {
    const saved = localStorage.getItem("selectedStudentId");
    if (saved) setSelectedId(saved);
  }, []);

  /* ── Load student list ─────────────────────────────────────────────────── */
  useEffect(() => {
    const loadStudents = async () => {
      setListLoading(true);
      setListError("");
      try {
        const allowed = await studentsDb.list(scopeOf(profile));
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
        const code = (err as { code?: string }).code;
        setListError(code === "failed-precondition"
          ? "The student query needs a Firestore index. Ask your administrator to deploy the project's Firestore indexes."
          : code === "permission-denied"
            ? "Student access was denied. Check the account's centre, saved therapist assignments, and deployed Firestore rules."
            : "Students could not be loaded. Check your connection and retry.");
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
  }, [profile, reloadCount]);

  /* ── Persist selected student ──────────────────────────────────────────── */
  useEffect(() => {
    if (selectedId) localStorage.setItem("selectedStudentId", selectedId);
  }, [selectedId]);

  /* ── Load student detail (medical + care plan) ─────────────────────────── */
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setMedical(null);
    setCarePlan(null);
    setDetailLoading(true);

    const loadDetail = async () => {
      try {
        const [medData, cpData] = await Promise.all([
          studentsDb.getMedical(selectedId),
          studentsDb.getCarePlan(selectedId),
        ]);
        if (!active) return;
        setMedical(medData as unknown as MedicalProfile);
        setCarePlan(cpData as unknown as CarePlan);
      } catch (err) {
        if (!active) return;
        console.error("Failed to load student details:", err);
        toast.error("Failed to load student details");
        setMedical(null);
        setCarePlan(null);
      } finally {
        if (active) setDetailLoading(false);
      }
    };
    loadDetail();
    return () => { active = false; };
  }, [selectedId]);
  /* ── Select student ─────────────────────────── */
  const handleSelect = (id: string) => {
    setSelectedId(id);
    setActiveTab("Overview");
  };
  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <>
      {listError && <div role="alert" className="glass-card" style={{ padding: 16, marginBottom: 16 }}><p>{listError}</p><button className="btn-ghost" onClick={() => setReloadCount(value => value + 1)}>Retry loading students</button></div>}
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
              <div style={{ display: "flex", justifyContent: "center", color: "var(--text-secondary)", marginBottom: "16px" }}>
                <User size={52} />
              </div>
              <h2 style={{ margin: 0, color: "var(--primary-dark)" }}>Select a Student</h2>
              <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
                Choose a student from the list to view their profile
              </p>
            </div>
          ) : (
            <>
              {/* Early Regression Alerts (Therapist & Admin) */}
              {canEdit && profile?.centerId && (
                <RegressionAlertsBanner
                  centerId={profile.centerId}
                  studentId={selectedStudent.id}
                />
              )}

              {/* Tab bar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                <div className="tab-bar">
                  {TABS.map((tab) => (
                    <button
                      key={tab}
                      className={`tab-item${activeTab === tab ? " active" : ""}`}
                      onClick={() => setActiveTab(tab)}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        {tab === "Overview" && <User size={15} />}
                        {tab === "Medical" && <Heart size={15} />}
                        {tab === "Care Plan" && <Target size={15} />}
                        {tab === "Emergency" && <AlertTriangle size={15} />}
                        <span>{tab}</span>
                      </span>
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
                      ? (
                          profile?.role === "teacher"
                            ? <TeacherCarePlanTab
                                studentId={selectedStudent.id}
                                studentName={selectedStudent.name}
                                centerId={profile?.centerId || ""}
                                carePlan={carePlan}
                              />
                            : <CarePlanTab studentId={selectedStudent.id} carePlan={carePlan} canEdit={canEditCarePlan} onChange={setCarePlan} />
                        )
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

    </>
  );
}

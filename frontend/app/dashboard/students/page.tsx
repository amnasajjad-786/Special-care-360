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



  const filteredStudents = students.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );
  const selectedStudent = students.find((s) => s.id === selectedId) || null;
  const canEdit = profile?.role === "admin" || profile?.role === "therapist";
  const canEditCarePlan = canEdit || profile?.role === "teacher";

  /* ── Init hasPassword from localStorage (client-only) ─────────────────── */
  useEffect(() => {
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
  /* ── Select student ─────────────────────────── */
  const handleSelect = (id: string) => {
    setSelectedId(id);
    setActiveTab("Overview");
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
                      ? <CarePlanTab studentId={selectedStudent.id} carePlan={carePlan} canEdit={canEditCarePlan} onChange={setCarePlan} />
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

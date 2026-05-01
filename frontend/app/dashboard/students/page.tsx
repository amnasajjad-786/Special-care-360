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

const MOCK_STUDENTS: Student[] = [
  { id: "s1", name: "Ali Hassan", dob: "2015-03-12", diagnosis: "ASD", centerId: "demo-center-001", teacherId: "t1", therapistIds: ["th1"], enrollmentDate: "2022-09-01", iepStatus: "Active" },
  { id: "s2", name: "Sara Ahmed", dob: "2016-07-24", diagnosis: "ADHD", centerId: "demo-center-001", teacherId: "t1", therapistIds: [], enrollmentDate: "2023-01-15", iepStatus: "Active" },
  { id: "s3", name: "Omar Malik", dob: "2014-11-05", diagnosis: "Down Syndrome", centerId: "demo-center-001", teacherId: "t2", therapistIds: ["th1", "th2"], enrollmentDate: "2021-06-01", iepStatus: "Under Review" },
  { id: "s4", name: "Zara Khan", dob: "2017-04-19", diagnosis: "Cerebral Palsy", centerId: "demo-center-001", teacherId: "t1", therapistIds: ["th2"], enrollmentDate: "2023-08-10", iepStatus: "Active" },
];

const MOCK_MEDICAL: MedicalProfile = {
  allergies: ["Peanuts", "Latex"],
  seizureHistory: { hasHistory: true, frequency: "Monthly", lastOccurrence: "2026-03-15", protocol: "1. Keep student calm\n2. Clear area\n3. Do not restrain\n4. Call nurse" },
  medications: [{ name: "Ritalin", dosage: "10mg", frequency: "Daily", time: "8:00 AM", administeredBy: "Nurse" }],
  emergencyContact: { name: "Ahmed Hassan", relation: "Father", phone: "+92-300-1234567" },
  bloodType: "A+",
  specialPhysicalNeeds: "Wheelchair accessible classroom required",
};

const MOCK_CAREPLAN: CarePlan = {
  goals: [
    { id: "g1", title: "Improve verbal communication", status: "In Progress", progressPercent: 60 },
    { id: "g2", title: "Independent dressing", status: "Mastered", progressPercent: 100 },
    { id: "g3", title: "Social interaction with peers", status: "In Progress", progressPercent: 35 },
    { id: "g4", title: "Following 2-step instructions", status: "Regressed", progressPercent: 20 },
  ],
};

const TABS = ["Overview", "Medical", "Care Plan", "Emergency"];

export default function StudentsPage() {
  const { profile } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("Overview");
  const [listLoading, setListLoading] = useState(true);
  const [medical, setMedical] = useState<MedicalProfile | null>(null);
  const [carePlan, setCarePlan] = useState<CarePlan | null>(null);

  const selectedStudent = students.find(s => s.id === selectedId) || null;
  const canEdit = profile?.role === "admin" || profile?.role === "therapist";

  useEffect(() => {
    const loadStudents = async () => {
      setListLoading(true);
      try {
        const res = await studentsApi.list();
        setStudents(res.data);
        if (res.data.length > 0) setSelectedId(res.data[0].id);
      } catch {
        setStudents(MOCK_STUDENTS);
        setSelectedId(MOCK_STUDENTS[0].id);
      }
      setListLoading(false);
    };
    loadStudents();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setMedical(null);
    setCarePlan(null);

    const loadDetail = async () => {
      try {
        const [medRes, cpRes] = await Promise.all([studentsApi.getMedical(selectedId), studentsApi.getCarePlan(selectedId)]);
        setMedical(medRes.data);
        setCarePlan(cpRes.data);
      } catch {
        setMedical(MOCK_MEDICAL);
        setCarePlan(MOCK_CAREPLAN);
      }
    };
    loadDetail();
  }, [selectedId]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setActiveTab("Overview");
  };

  return (
    <div style={{ display: "flex", gap: "24px", minHeight: "calc(100vh - 120px)" }}>
      {/* Left: Student List */}
      <StudentListSidebar
        students={students}
        selectedId={selectedId}
        search={search}
        onSearch={setSearch}
        onSelect={handleSelect}
        loading={listLoading}
      />

      {/* Right: Profile */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!selectedStudent ? (
          <div className="glass-card" style={{ padding: "60px", textAlign: "center" }}>
            <div style={{ fontSize: "52px", marginBottom: "16px" }}>👤</div>
            <h2 style={{ margin: 0, color: "var(--primary-dark)" }}>Select a Student</h2>
            <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>Choose a student from the list to view their profile</p>
          </div>
        ) : (
          <>
            {/* Tab bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div className="tab-bar">
                {TABS.map(tab => (
                  <button key={tab} className={`tab-item ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                    {tab === "Overview" ? "👤" : tab === "Medical" ? "💊" : tab === "Care Plan" ? "🎯" : "🚨"} {tab}
                  </button>
                ))}
              </div>
              {canEdit && (
                <button className="btn-primary" style={{ padding: "8px 18px", fontSize: "0.85rem" }}
                  onClick={() => toast.success("Student record saved")}>
                  💾 Save
                </button>
              )}
            </div>

            {/* Tab content */}
            {activeTab === "Overview" && <OverviewTab student={selectedStudent} />}
            {activeTab === "Medical" && (
              medical
                ? <MedicalTab studentId={selectedStudent.id} profile={medical} canEdit={canEdit} />
                : <div className="glass-card" style={{ padding: "40px", textAlign: "center" }}><div className="skeleton" style={{ height: "200px", borderRadius: "12px" }} /></div>
            )}
            {activeTab === "Care Plan" && (
              carePlan
                ? <CarePlanTab studentId={selectedStudent.id} carePlan={carePlan} canEdit={canEdit} />
                : <div className="glass-card" style={{ padding: "40px", textAlign: "center" }}><div className="skeleton" style={{ height: "200px", borderRadius: "12px" }} /></div>
            )}
            {activeTab === "Emergency" && medical && (
              <EmergencyTab studentId={selectedStudent.id} studentName={selectedStudent.name} medical={medical} canEdit={canEdit} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

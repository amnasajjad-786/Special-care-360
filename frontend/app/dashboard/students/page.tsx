"use client";
<<<<<<< HEAD

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { studentsApi } from "@/lib/api";


=======
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { studentsApi } from "@/lib/api";
>>>>>>> 9ba631039d4105b4708d5fc7f92f0bebec531811
import { Student, MedicalProfile, CarePlan } from "@/types";
import StudentListSidebar from "@/components/students/StudentListSidebar";
import OverviewTab from "@/components/students/OverviewTab";
import MedicalTab from "@/components/students/MedicalTab";
import CarePlanTab from "@/components/students/CarePlanTab";
import EmergencyTab from "@/components/students/EmergencyTab";
import toast from "react-hot-toast";

<<<<<<< HEAD
/* MOCK DATA */
=======
>>>>>>> 9ba631039d4105b4708d5fc7f92f0bebec531811
const MOCK_STUDENTS: Student[] = [
  { id: "s1", name: "Ali Hassan", dob: "2015-03-12", diagnosis: "ASD", centerId: "demo-center-001", teacherId: "t1", therapistIds: ["th1"], enrollmentDate: "2022-09-01", iepStatus: "Active" },
  { id: "s2", name: "Sara Ahmed", dob: "2016-07-24", diagnosis: "ADHD", centerId: "demo-center-001", teacherId: "t1", therapistIds: [], enrollmentDate: "2023-01-15", iepStatus: "Active" },
  { id: "s3", name: "Omar Malik", dob: "2014-11-05", diagnosis: "Down Syndrome", centerId: "demo-center-001", teacherId: "t2", therapistIds: ["th1", "th2"], enrollmentDate: "2021-06-01", iepStatus: "Under Review" },
  { id: "s4", name: "Zara Khan", dob: "2017-04-19", diagnosis: "Cerebral Palsy", centerId: "demo-center-001", teacherId: "t1", therapistIds: ["th2"], enrollmentDate: "2023-08-10", iepStatus: "Active" },
];

const MOCK_MEDICAL: MedicalProfile = {
  allergies: ["Peanuts", "Latex"],
<<<<<<< HEAD
  seizureHistory: {
    hasHistory: true,
    frequency: "Monthly",
    lastOccurrence: "2026-03-15",
    protocol: "1. Keep student calm\n2. Clear area\n3. Do not restrain\n4. Call nurse",
  },
  medications: [
    { name: "Ritalin", dosage: "10mg", frequency: "Daily", time: "8:00 AM", administeredBy: "Nurse" },
  ],
=======
  seizureHistory: { hasHistory: true, frequency: "Monthly", lastOccurrence: "2026-03-15", protocol: "1. Keep student calm\n2. Clear area\n3. Do not restrain\n4. Call nurse" },
  medications: [{ name: "Ritalin", dosage: "10mg", frequency: "Daily", time: "8:00 AM", administeredBy: "Nurse" }],
>>>>>>> 9ba631039d4105b4708d5fc7f92f0bebec531811
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

<<<<<<< HEAD
const hashPassword = async (s: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export default function StudentsPage() {
  const { profile } = useAuth();

  const [students, setStudents] = useState<Student[]>([]);

  // FIX: SSR-safe localStorage init
  const [selectedId, setSelectedId] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("selectedStudentId") : null
  );

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("Overview");
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const [medical, setMedical] = useState<MedicalProfile | null>(null);
  const [carePlan, setCarePlan] = useState<CarePlan | null>(null);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [enteredPassword, setEnteredPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pendingStudentId, setPendingStudentId] = useState<string | null>(null);

  // FIX: SSR-safe localStorage init for hasPassword
  const [hasPassword, setHasPassword] = useState(false);

  const [showResetModal, setShowResetModal] = useState(false);

  // FIX: set hasPassword after mount
  useEffect(() => {
    setHasPassword(!!localStorage.getItem("parentPassword"));
  }, []);

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedStudent = students.find((s) => s.id === selectedId) || null;
  const canEdit = profile?.role === "admin" || profile?.role === "therapist";

  /* LOAD STUDENTS */
=======
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

>>>>>>> 9ba631039d4105b4708d5fc7f92f0bebec531811
  useEffect(() => {
    const loadStudents = async () => {
      setListLoading(true);
      try {
        const res = await studentsApi.list();
        setStudents(res.data);
<<<<<<< HEAD
        if (res.data.length > 0 && !localStorage.getItem("selectedStudentId")) {
          setSelectedId(res.data[0].id);
        }
      } catch {
        setStudents(MOCK_STUDENTS);
        if (!localStorage.getItem("selectedStudentId")) {
          setSelectedId(MOCK_STUDENTS[0].id);
        }
=======
        if (res.data.length > 0) setSelectedId(res.data[0].id);
      } catch {
        setStudents(MOCK_STUDENTS);
        setSelectedId(MOCK_STUDENTS[0].id);
>>>>>>> 9ba631039d4105b4708d5fc7f92f0bebec531811
      }
      setListLoading(false);
    };
    loadStudents();
  }, []);

<<<<<<< HEAD
  /* PERSIST selectedId */
  useEffect(() => {
    if (selectedId) localStorage.setItem("selectedStudentId", selectedId);
  }, [selectedId]);

  /* LOAD DETAILS */
=======
>>>>>>> 9ba631039d4105b4708d5fc7f92f0bebec531811
  useEffect(() => {
    if (!selectedId) return;
    setMedical(null);
    setCarePlan(null);
<<<<<<< HEAD
    setDetailLoading(true);

    const loadDetail = async () => {
      try {
        const [medRes, cpRes] = await Promise.all([
          studentsApi.getMedical(selectedId),
          studentsApi.getCarePlan(selectedId),
        ]);
=======

    const loadDetail = async () => {
      try {
        const [medRes, cpRes] = await Promise.all([studentsApi.getMedical(selectedId), studentsApi.getCarePlan(selectedId)]);
>>>>>>> 9ba631039d4105b4708d5fc7f92f0bebec531811
        setMedical(medRes.data);
        setCarePlan(cpRes.data);
      } catch {
        setMedical(MOCK_MEDICAL);
        setCarePlan(MOCK_CAREPLAN);
<<<<<<< HEAD
      } finally {
        setDetailLoading(false);
=======
>>>>>>> 9ba631039d4105b4708d5fc7f92f0bebec531811
      }
    };
    loadDetail();
  }, [selectedId]);

<<<<<<< HEAD
  /* SELECT STUDENT */
  const handleSelect = (id: string) => {
    if (profile?.role === "parent") {
      setPendingStudentId(id);
      setEnteredPassword("");
      setConfirmPassword("");
      setShowPasswordModal(true);
      return;
    }
=======
  const handleSelect = (id: string) => {
>>>>>>> 9ba631039d4105b4708d5fc7f92f0bebec531811
    setSelectedId(id);
    setActiveTab("Overview");
  };

<<<<<<< HEAD
  /* SAVE */
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
      toast.error("Save failed");
    }
  };

  /* PASSWORD VERIFY / CREATE */
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

  /* RESET PASSWORD */
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

  return (
    <>
      <div style={{ display: "flex", gap: "24px", minHeight: "calc(100vh - 120px)" }}>

        {/* LEFT */}
        <StudentListSidebar
          students={filteredStudents}
          selectedId={selectedId}
          search={search}
          onSearch={setSearch}
          onSelect={handleSelect}
          loading={listLoading}
        />

        {/* RIGHT */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedStudent ? (
            <div className="glass-card" style={{ padding: "60px", textAlign: "center" }}>
              <div style={{ fontSize: "52px" }}>👤</div>
              <h2>Select a Student</h2>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
                <div className="tab-bar">
                  {TABS.map(tab => (
                    <button
                      key={tab}
                      className={`tab-item ${activeTab === tab ? "active" : ""}`}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                {canEdit && (
                  <button className="btn-primary" onClick={handleSave}>
                    💾 Save
                  </button>
                )}
              </div>

              {detailLoading ? (
                <div className="glass-card" style={{ padding: "40px", textAlign: "center" }}>
                  Loading...
                </div>
              ) : (
                <>
                  {activeTab === "Overview" && <OverviewTab student={selectedStudent} />}
                  {activeTab === "Medical" && medical && (
                    <MedicalTab studentId={selectedStudent.id} profile={medical} canEdit={canEdit} />
                  )}
                  {activeTab === "Care Plan" && carePlan && (
                    <CarePlanTab studentId={selectedStudent.id} carePlan={carePlan} canEdit={canEdit} />
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

      {/* PASSWORD MODAL */}
      {showPasswordModal && (
        <div style={modalStyle}>
          <div className="glass-card" style={{ padding: "24px", width: "320px" }}>
            <h3>{hasPassword ? "Enter Password" : "Create Password"}</h3>

            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={enteredPassword}
                onChange={(e) => setEnteredPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifyPassword()}
                style={{ width: "100%", padding: "10px", marginTop: "10px" }}
              />
              <span
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: "absolute", right: "10px", top: "20px", cursor: "pointer" }}
              >
                {showPassword ? "🙈" : "👁️"}
              </span>
            </div>

            {!hasPassword && (
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifyPassword()}
                style={{ width: "100%", padding: "10px", marginTop: "10px" }}
              />
            )}

            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <button className="btn-primary" onClick={verifyPassword}>
                {hasPassword ? "Verify" : "Create"}
              </button>
              <button onClick={closeModals}>Cancel</button>
            </div>

            {hasPassword && (
              <div
                onClick={() => setShowResetModal(true)}
                style={{ marginTop: "10px", fontSize: "12px", color: "red", cursor: "pointer" }}
              >
                Forgot / Reset Password
              </div>
            )}
          </div>
        </div>
      )}

      {/* RESET MODAL */}
      {showResetModal && (
        <div style={modalStyle}>
          <div className="glass-card" style={{ padding: "24px", width: "320px" }}>
            <h3>Reset Password</h3>
            <p style={{ fontSize: "13px" }}>
              This will clear the current password. You'll set a new one next time you open a profile.
            </p>
            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <button className="btn-primary" onClick={handleResetPassword}>Reset</button>
              <button onClick={closeModals}>Cancel</button>
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
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};
=======
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
>>>>>>> 9ba631039d4105b4708d5fc7f92f0bebec531811

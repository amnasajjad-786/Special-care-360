"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import toast from "react-hot-toast";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  LayoutDashboard,
  Users,
  Receipt,
  Contact,
  BarChart3,
  Search,
  Plus,
  Trash2,
  Printer,
  Check,
  Settings,
  X,
  Bell,
  Clock,
  AlertTriangle,
  FileSpreadsheet,
  UserPlus,
  CheckCircle,
  HelpCircle
} from "lucide-react";

// --- Mock initial data matching HTML mockup ---
interface AdminStudent {
  id: number;
  name: string;
  age: number;
  diagnosis: string;
  therapist: string;
  feeStatus: "paid" | "pending" | "overdue";
  status: "Active" | "Inactive";
}

interface AdminInvoice {
  id: string;
  studentName: string;
  amount: number;
  month: string;
  issued: string;
  status: "paid" | "pending" | "overdue";
}

interface AdminPayment {
  id: string;
  studentName: string;
  amount: number;
  method: string;
  date: string;
  recordedBy: string;
}

interface AdminStaff {
  id: number;
  name: string;
  subRole: string;
  role: "Teacher" | "Therapist" | "Admin";
  email: string;
  studentsAssigned: number;
  status: "Active" | "Inactive";
}

const INITIAL_STUDENTS: AdminStudent[] = [
  { id: 1, name: "Ahmed Raza", age: 8, diagnosis: "Autism", therapist: "Sara Raza", feeStatus: "paid", status: "Active" },
  { id: 2, name: "Zara Khan", age: 10, diagnosis: "Down Syndrome", therapist: "M. Kamran", feeStatus: "pending", status: "Active" },
  { id: 3, name: "Ali Hassan", age: 6, diagnosis: "ADHD", therapist: "Aisha Noor", feeStatus: "overdue", status: "Active" },
  { id: 4, name: "Fatima Noor", age: 12, diagnosis: "Cerebral Palsy", therapist: "Sara Raza", feeStatus: "paid", status: "Active" },
  { id: 5, name: "Bilal Ahmed", age: 9, diagnosis: "Autism", therapist: "M. Kamran", feeStatus: "pending", status: "Active" },
  { id: 6, name: "Hina Malik", age: 7, diagnosis: "Down Syndrome", therapist: "Aisha Noor", feeStatus: "paid", status: "Inactive" },
];

const INITIAL_INVOICES: AdminInvoice[] = [
  { id: "INV-1024", studentName: "Ali Hassan", amount: 12000, month: "June 2025", issued: "01 Jun", status: "overdue" },
  { id: "INV-1023", studentName: "Zara Khan", amount: 15000, month: "June 2025", issued: "01 Jun", status: "pending" },
  { id: "INV-1022", studentName: "Ahmed Raza", amount: 15000, month: "June 2025", issued: "01 Jun", status: "paid" },
  { id: "INV-1021", studentName: "Fatima Noor", amount: 18000, month: "June 2025", issued: "01 Jun", status: "paid" },
  { id: "INV-1020", studentName: "Bilal Ahmed", amount: 15000, month: "May 2025", issued: "01 May", status: "pending" },
];

const INITIAL_PAYMENTS: AdminPayment[] = [
  { id: "RCP-045", studentName: "Ahmed Raza", amount: 15000, method: "Bank Transfer", date: "03 Jun 2025", recordedBy: "Admin" },
  { id: "RCP-044", studentName: "Fatima Noor", amount: 18000, method: "Cash", date: "02 Jun 2025", recordedBy: "Admin" },
  { id: "RCP-043", studentName: "Hina Malik", amount: 12000, method: "EasyPaisa", date: "01 Jun 2025", recordedBy: "Admin" },
];

const INITIAL_STAFF: AdminStaff[] = [
  { id: 1, name: "Sara Raza", subRole: "Speech Therapist", role: "Therapist", email: "sara@sc360.pk", studentsAssigned: 12, status: "Active" },
  { id: 2, name: "M. Kamran", subRole: "Special Educator", role: "Teacher", email: "kamran@sc360.pk", studentsAssigned: 15, status: "Active" },
  { id: 3, name: "Aisha Noor", subRole: "Physiotherapist", role: "Therapist", email: "aisha@sc360.pk", studentsAssigned: 9, status: "Active" },
];

const DIAGNOSES_OPTIONS = ["Autism", "Down Syndrome", "ADHD", "Cerebral Palsy", "Other"];

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<"dashboard" | "students" | "fees" | "staff" | "reports">("dashboard");

  // --- Core States ---
  const [students, setStudents] = useState<AdminStudent[]>(INITIAL_STUDENTS);
  const [invoices, setInvoices] = useState<AdminInvoice[]>(INITIAL_INVOICES);
  const [payments, setPayments] = useState<AdminPayment[]>(INITIAL_PAYMENTS);
  const [staff, setStaff] = useState<AdminStaff[]>(INITIAL_STAFF);

  // --- Search & Filters ---
  const [studentSearch, setStudentSearch] = useState("");
  const [diagnosisFilter, setDiagnosisFilter] = useState("All Diagnoses");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [feeTab, setFeeTab] = useState<"invoices" | "payments">("invoices");

  // --- Modals State ---
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [isAddInvoiceOpen, setIsAddInvoiceOpen] = useState(false);
  const [isConfigureFeeOpen, setIsConfigureFeeOpen] = useState(false);

  // --- Forms State ---
  const [studentForm, setStudentForm] = useState({
    firstName: "",
    lastName: "",
    age: "",
    gender: "Male",
    diagnosis: "Autism",
    guardianName: "",
    contactNo: "",
    therapist: "Sara Raza",
    notes: ""
  });

  const [staffForm, setStaffForm] = useState<{
    name: string;
    subRole: string;
    role: "Teacher" | "Therapist" | "Admin";
    email: string;
    studentsAssigned: number;
    status: "Active" | "Inactive";
  }>({
    name: "",
    subRole: "",
    role: "Teacher",
    email: "",
    studentsAssigned: 0,
    status: "Active"
  });

  const [invoiceForm, setInvoiceForm] = useState({
    studentName: "",
    month: "June 2025",
    amount: "",
    dueDate: "",
    notes: ""
  });

  const [feeConfig, setFeeConfig] = useState({
    program: "Full-Day Special Education",
    monthlyFee: 15000,
    admissionFee: 5000,
    therapySurcharge: 3000,
    lateFeePercent: 5,
    dueDay: 10
  });

  // --- Calculations ---
  const totalStudents = students.length;
  const staffCount = staff.length;

  // --- Dynamic active alert count from Firestore (with demo fallback) --------
  const [activeAlertsCount, setActiveAlertsCount] = useState(2);

  useEffect(() => {
    if (!profile) return;
    try {
      const q = query(
        collection(db, "panicAlerts"),
        where("status", "==", "active"),
        where("centerId", "==", profile.centerId || "demo-center-001")
      );
      const unsub = onSnapshot(
        q,
        (snap) => setActiveAlertsCount(snap.size),
        () => setActiveAlertsCount(2) // Firebase not configured — keep mock
      );
      return unsub;
    } catch {
      // Firebase not configured
      setActiveAlertsCount(2);
    }
  }, [profile]);

  const feeStats = useMemo(() => {
    let collected = 0;
    let pending = 0;
    let overdue = 0;

    payments.forEach(p => { collected += p.amount; });
    invoices.forEach(i => {
      if (i.status === "pending") pending += i.amount;
      if (i.status === "overdue") overdue += i.amount;
    });

    const total = collected + pending + overdue;
    const collectedPct = total > 0 ? Math.round((collected / total) * 100) : 0;
    const pendingPct = total > 0 ? Math.round((pending / total) * 100) : 0;
    const overduePct = total > 0 ? Math.round((overdue / total) * 100) : 0;

    return { collected, pending, overdue, collectedPct, pendingPct, overduePct, total };
  }, [invoices, payments]);

  // --- Handlers ---
  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentForm.firstName || !studentForm.lastName) {
      toast.error("Please fill in the student's name");
      return;
    }

    const fullName = `${studentForm.firstName} ${studentForm.lastName}`.trim();
    const ageNum = parseInt(studentForm.age) || 6;

    const newStudent: AdminStudent = {
      id: Date.now(),
      name: fullName,
      age: ageNum,
      diagnosis: studentForm.diagnosis,
      therapist: studentForm.therapist,
      feeStatus: "pending",
      status: "Active"
    };

    setStudents([newStudent, ...students]);
    setIsAddStudentOpen(false);
    setStudentForm({
      firstName: "",
      lastName: "",
      age: "",
      gender: "Male",
      diagnosis: "Autism",
      guardianName: "",
      contactNo: "",
      therapist: "Sara Raza",
      notes: ""
    });
    toast.success(`${fullName} has been added successfully!`);
  };

  const handleDeleteStudent = (id: number, name: string) => {
    if (confirm(`Are you sure you want to remove ${name}?`)) {
      setStudents(students.filter(s => s.id !== id));
      toast.success("Student removed");
    }
  };

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffForm.name || !staffForm.email) {
      toast.error("Please fill in the name and email fields");
      return;
    }

    const newMember: AdminStaff = {
      id: Date.now(),
      name: staffForm.name,
      subRole: staffForm.subRole || "Specialist",
      role: staffForm.role,
      email: staffForm.email,
      studentsAssigned: staffForm.studentsAssigned,
      status: staffForm.status
    };

    setStaff([...staff, newMember]);
    setIsAddStaffOpen(false);
    setStaffForm({
      name: "",
      subRole: "",
      role: "Teacher",
      email: "",
      studentsAssigned: 0,
      status: "Active"
    });
    toast.success(`${newMember.name} has been added as a staff member!`);
  };

  const handleDeleteStaff = (id: number, name: string) => {
    if (confirm(`Are you sure you want to delete staff member ${name}?`)) {
      setStaff(staff.filter(st => st.id !== id));
      toast.success("Staff member removed");
    }
  };

  const handleAddInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceForm.studentName || !invoiceForm.amount) {
      toast.error("Please select a student and enter an amount");
      return;
    }

    const newInvoice: AdminInvoice = {
      id: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
      studentName: invoiceForm.studentName,
      amount: parseFloat(invoiceForm.amount),
      month: invoiceForm.month,
      issued: new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short" }),
      status: "pending"
    };

    setInvoices([newInvoice, ...invoices]);
    setIsAddInvoiceOpen(false);
    setInvoiceForm({
      studentName: "",
      month: "June 2025",
      amount: "",
      dueDate: "",
      notes: ""
    });
    toast.success("Invoice generated successfully!");
  };

  const handleMarkPaid = (invoiceId: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;

    // Update invoice status
    setInvoices(invoices.map(i => i.id === invoiceId ? { ...i, status: "paid" } : i));

    // Add payment entry
    const newPayment: AdminPayment = {
      id: `RCP-${Math.floor(100 + Math.random() * 900)}`,
      studentName: inv.studentName,
      amount: inv.amount,
      method: "Bank Transfer",
      date: new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }),
      recordedBy: profile?.name || "Admin"
    };
    setPayments([newPayment, ...payments]);

    // Also update student feeStatus
    setStudents(students.map(s => s.name === inv.studentName ? { ...s, feeStatus: "paid" } : s));

    toast.success(`Payment recorded for ${inv.studentName}!`);
  };

  const handleSaveFeeConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setIsConfigureFeeOpen(false);
    toast.success("Fee structure configuration saved successfully!");
  };

  const generateReport = (type: string) => {
    const reportToast = toast.loading(`Generating ${type}...`);
    setTimeout(() => {
      toast.dismiss(reportToast);
      toast.success(`${type} generated & downloaded successfully!`, {
        icon: "📄"
      });
    }, 1500);
  };

  // --- Filtered Lists ---
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchQuery = s.name.toLowerCase().includes(studentSearch.toLowerCase()) || 
                         s.diagnosis.toLowerCase().includes(studentSearch.toLowerCase());
      const matchDiagnosis = diagnosisFilter === "All Diagnoses" || s.diagnosis.toLowerCase() === diagnosisFilter.toLowerCase();
      const matchStatus = statusFilter === "All Status" || s.status.toLowerCase() === statusFilter.toLowerCase();
      return matchQuery && matchDiagnosis && matchStatus;
    });
  }, [students, studentSearch, diagnosisFilter, statusFilter]);

  // Color mappings
  const diagnosisColors: Record<string, string> = {
    autism: "chip-info",
    asd: "chip-info",
    "down syndrome": "chip-purple",
    adhd: "chip-warning",
    "cerebral palsy": "chip-success",
    cp: "chip-success"
  };

  const feeStatusLabels = {
    paid: <span className="chip chip-success">Paid</span>,
    pending: <span className="chip chip-warning">Pending</span>,
    overdue: <span className="chip chip-danger">Overdue</span>
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: "40px" }}>
      {/* Page Title & Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "2rem", color: "var(--primary-dark)", fontWeight: 800, margin: 0 }}>
            Admin Panel
          </h1>
          <p style={{ color: "var(--text-secondary)", margin: "4px 0 0 0", fontSize: "0.9rem" }}>
            Manage enrollments, finances, schedules, and operations.
          </p>
        </div>
        
        {/* Quick actions depending on tab */}
        {activeTab === "students" && (
          <button className="btn-primary" onClick={() => setIsAddStudentOpen(true)}>
            <UserPlus size={16} /> Add Student
          </button>
        )}
        {activeTab === "fees" && (
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="btn-ghost" onClick={() => setIsConfigureFeeOpen(true)}>
              <Settings size={16} /> Configure Fees
            </button>
            <button className="btn-primary" onClick={() => setIsAddInvoiceOpen(true)}>
              <Plus size={16} /> New Invoice
            </button>
          </div>
        )}
        {activeTab === "staff" && (
          <button className="btn-primary" onClick={() => setIsAddStaffOpen(true)}>
            <Plus size={16} /> Add Staff Member
          </button>
        )}
      </div>

      {/* Primary Sub-Navigation Tabs */}
      <div className="tab-bar animate-slide-down" style={{ marginBottom: "24px" }}>
        <button className={`tab-item ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => setActiveTab("dashboard")}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <LayoutDashboard size={16} /> Dashboard
          </div>
        </button>
        <button className={`tab-item ${activeTab === "students" ? "active" : ""}`} onClick={() => setActiveTab("students")}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Users size={16} /> Students
          </div>
        </button>
        <button className={`tab-item ${activeTab === "fees" ? "active" : ""}`} onClick={() => setActiveTab("fees")}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Receipt size={16} /> Fee Management
          </div>
        </button>
        <button className={`tab-item ${activeTab === "staff" ? "active" : ""}`} onClick={() => setActiveTab("staff")}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Contact size={16} /> Staff
          </div>
        </button>
        <button className={`tab-item ${activeTab === "reports" ? "active" : ""}`} onClick={() => setActiveTab("reports")}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <BarChart3 size={16} /> Reports
          </div>
        </button>
      </div>

      {/* --- CONTENT AREA --- */}
      
      {/* 1. DASHBOARD TAB */}
      {activeTab === "dashboard" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Stats Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
            <div className="glass-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Total Students</span>
                <span style={{ fontSize: "1.2rem", background: "rgba(123, 196, 196, 0.2)", padding: "4px 8px", borderRadius: "8px" }}>👥</span>
              </div>
              <h2 style={{ fontSize: "2rem", fontWeight: 800, margin: "10px 0 5px 0", color: "var(--primary-dark)" }}>
                {totalStudents}
              </h2>
              <span style={{ fontSize: "0.78rem", color: "var(--success)" }}>🟢 Active enrollments</span>
            </div>

            <div className="glass-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Staff Members</span>
                <span style={{ fontSize: "1.2rem", background: "rgba(155, 142, 196, 0.2)", padding: "4px 8px", borderRadius: "8px" }}>💼</span>
              </div>
              <h2 style={{ fontSize: "2rem", fontWeight: 800, margin: "10px 0 5px 0", color: "var(--primary-dark)" }}>
                {staffCount}
              </h2>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Teachers &amp; Therapists</span>
            </div>

            <div className="glass-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Pending Fees</span>
                <span style={{ fontSize: "1.2rem", background: "rgba(214, 158, 46, 0.2)", padding: "4px 8px", borderRadius: "8px" }}>₨</span>
              </div>
              <h2 style={{ fontSize: "2rem", fontWeight: 800, margin: "10px 0 5px 0", color: "var(--warning)" }}>
                ₨ {Math.round(feeStats.pending / 1000)}K
              </h2>
              <span style={{ fontSize: "0.78rem", color: "var(--danger)" }}>
                {invoices.filter(i => i.status === "overdue").length} Overdue invoices
              </span>
            </div>

            <div className="glass-card animate-pulse-ring" style={{ padding: "20px", border: "1px solid rgba(229, 62, 62, 0.3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--danger)", textTransform: "uppercase" }}>Panic Alerts</span>
                <span style={{ fontSize: "1.2rem", background: "rgba(229, 62, 62, 0.2)", padding: "4px 8px", borderRadius: "8px" }}>🚨</span>
              </div>
              <h2 style={{ fontSize: "2rem", fontWeight: 800, margin: "10px 0 5px 0", color: "var(--danger)" }}>
                {activeAlertsCount}
              </h2>
              <span style={{ fontSize: "0.78rem", color: "var(--danger)", fontWeight: 600 }}>Active alerts require action</span>
            </div>
          </div>

          {/* Row 2: Recent Students & Recent Alerts */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "24px" }}>
            
            {/* Recent Students Widget */}
            <div className="glass-card" style={{ padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--primary-dark)" }}>Recent Students</h3>
                <button 
                  style={{ background: "none", border: "none", color: "var(--accent-teal)", fontSize: "0.85rem", cursor: "pointer", fontWeight: 600 }}
                  onClick={() => setActiveTab("students")}
                >
                  View all →
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {students.slice(0, 4).map((s, idx) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "12px", borderBottom: idx < 3 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{
                        width: "36px", height: "36px", borderRadius: "50%",
                        background: "var(--accent-teal)", color: "white",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700, fontSize: "0.85rem"
                      }}>
                        {s.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{s.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          {s.diagnosis} · Therapist: {s.therapist}
                        </div>
                      </div>
                    </div>
                    {feeStatusLabels[s.feeStatus]}
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Alerts Widget */}
            <div className="glass-card" style={{ padding: "24px" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "16px", color: "var(--primary-dark)" }}>Recent Incident Alerts</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", paddingBottom: "10px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                  <div style={{ padding: "8px", background: "rgba(229, 62, 62, 0.12)", color: "var(--danger)", borderRadius: "8px" }}>
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 600 }}>Panic Button triggered — Room 3</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Today, 10:42 AM · Ahmed Raza
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", paddingBottom: "10px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                  <div style={{ padding: "8px", background: "rgba(214, 158, 46, 0.12)", color: "var(--warning)", borderRadius: "8px" }}>
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 600 }}>Regression detected in motor skills</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Today, 09:15 AM · Zara Khan
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <div style={{ padding: "8px", background: "rgba(123, 196, 196, 0.15)", color: "var(--accent-teal)", borderRadius: "8px" }}>
                    <Clock size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 600 }}>Invoice #1024 marked overdue</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Yesterday · Ali Hassan
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>

          {/* Fee Collection Status */}
          <div className="glass-card" style={{ padding: "24px" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "16px", color: "var(--primary-dark)" }}>Fee Collection Status</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "24px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "8px" }}>
                  <span>Collected</span>
                  <span style={{ fontWeight: 700, color: "var(--success)" }}>{feeStats.collectedPct}%</span>
                </div>
                <div style={{ height: "8px", background: "rgba(0,0,0,0.05)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: `${feeStats.collectedPct}%`, height: "100%", background: "var(--success)" }} />
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "6px" }}>
                  ₨ {feeStats.collected.toLocaleString()} / ₨ {feeStats.total.toLocaleString()}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "8px" }}>
                  <span>Pending</span>
                  <span style={{ fontWeight: 700, color: "var(--warning)" }}>{feeStats.pendingPct}%</span>
                </div>
                <div style={{ height: "8px", background: "rgba(0,0,0,0.05)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: `${feeStats.pendingPct}%`, height: "100%", background: "var(--warning)" }} />
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "6px" }}>
                  ₨ {feeStats.pending.toLocaleString()}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "8px" }}>
                  <span>Overdue</span>
                  <span style={{ fontWeight: 700, color: "var(--danger)" }}>{feeStats.overduePct}%</span>
                </div>
                <div style={{ height: "8px", background: "rgba(0,0,0,0.05)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: `${feeStats.overduePct}%`, height: "100%", background: "var(--danger)" }} />
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "6px" }}>
                  ₨ {feeStats.overdue.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* 2. STUDENTS TAB */}
      {activeTab === "students" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Filters Bar */}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1, minWidth: "250px" }}>
              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }}>
                <Search size={16} />
              </span>
              <input
                type="text"
                className="glass-input"
                placeholder="Search students by name or diagnosis..."
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                style={{ paddingLeft: "36px" }}
              />
            </div>

            <select
              className="glass-input"
              value={diagnosisFilter}
              onChange={e => setDiagnosisFilter(e.target.value)}
              style={{ width: "auto", minWidth: "160px" }}
            >
              <option>All Diagnoses</option>
              <option>Autism</option>
              <option>Down Syndrome</option>
              <option>ADHD</option>
              <option>Cerebral Palsy</option>
            </select>

            <select
              className="glass-input"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ width: "auto", minWidth: "140px" }}
            >
              <option>All Status</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>

          {/* Students Data Table */}
          <div className="glass-card" style={{ overflow: "hidden" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Age</th>
                  <th>Diagnosis</th>
                  <th>Therapist</th>
                  <th>Fee Status</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length > 0 ? (
                  filteredStudents.map(s => {
                    const diagLower = s.diagnosis.toLowerCase();
                    const chipColor = diagnosisColors[diagLower] || "chip-gray";
                    return (
                      <tr key={s.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div style={{
                              width: "32px", height: "32px", borderRadius: "50%",
                              background: "rgba(61, 79, 107, 0.1)", color: "var(--primary-dark)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 700, fontSize: "0.8rem"
                            }}>
                              {s.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 600 }}>{s.name}</span>
                          </div>
                        </td>
                        <td>{s.age} yrs</td>
                        <td>
                          <span className={`chip ${chipColor}`}>{s.diagnosis}</span>
                        </td>
                        <td>{s.therapist}</td>
                        <td>{feeStatusLabels[s.feeStatus]}</td>
                        <td>
                          <span className={`chip ${s.status === "Active" ? "chip-success" : "chip-gray"}`}>
                            {s.status}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="btn-ghost"
                            onClick={() => handleDeleteStudent(s.id, s.name)}
                            style={{ padding: "4px 8px", background: "rgba(229, 62, 62, 0.1)", color: "var(--danger)", border: "none" }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
                      No students found matching filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. FEE MANAGEMENT TAB */}
      {activeTab === "fees" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* Fee stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px" }}>
            <div className="glass-card" style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>Collected (June)</div>
              <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--success)", margin: "4px 0" }}>₨ {feeStats.collected.toLocaleString()}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{payments.length} transactions</div>
            </div>
            <div className="glass-card" style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>Pending Invoices</div>
              <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--warning)", margin: "4px 0" }}>₨ {feeStats.pending.toLocaleString()}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{invoices.filter(i => i.status === "pending").length} bills issued</div>
            </div>
            <div className="glass-card" style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>Overdue Invoices</div>
              <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--danger)", margin: "4px 0" }}>₨ {feeStats.overdue.toLocaleString()}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{invoices.filter(i => i.status === "overdue").length} overdue</div>
            </div>
          </div>

          {/* Toggle Tab and Lists */}
          <div className="glass-card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "16px 20px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  style={{
                    padding: "8px 16px",
                    border: "none",
                    borderBottom: feeTab === "invoices" ? "2.5px solid var(--primary-dark)" : "2.5px solid transparent",
                    background: "none",
                    fontWeight: feeTab === "invoices" ? 700 : 500,
                    color: feeTab === "invoices" ? "var(--primary-dark)" : "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "0.9rem"
                  }}
                  onClick={() => setFeeTab("invoices")}
                >
                  Invoices
                </button>
                <button
                  style={{
                    padding: "8px 16px",
                    border: "none",
                    borderBottom: feeTab === "payments" ? "2.5px solid var(--primary-dark)" : "2.5px solid transparent",
                    background: "none",
                    fontWeight: feeTab === "payments" ? 700 : 500,
                    color: feeTab === "payments" ? "var(--primary-dark)" : "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "0.9rem"
                  }}
                  onClick={() => setFeeTab("payments")}
                >
                  Payment History
                </button>
              </div>
            </div>

            {/* List 1: Invoices */}
            {feeTab === "invoices" && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Student</th>
                    <th>Amount</th>
                    <th>Billing Month</th>
                    <th>Issued Date</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.85rem" }}>{inv.id}</td>
                      <td style={{ fontWeight: 600 }}>{inv.studentName}</td>
                      <td style={{ fontWeight: 700 }}>₨ {inv.amount.toLocaleString()}</td>
                      <td>{inv.month}</td>
                      <td style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>{inv.issued}</td>
                      <td>{feeStatusLabels[inv.status]}</td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <button
                            className="btn-ghost"
                            onClick={() => generateReport(`Receipt for Invoice ${inv.id}`)}
                            title="Print Invoice"
                            style={{ padding: "4px 8px" }}
                          >
                            <Printer size={14} />
                          </button>
                          {inv.status !== "paid" && (
                            <button
                              className="btn-primary"
                              onClick={() => handleMarkPaid(inv.id)}
                              title="Mark Paid"
                              style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                            >
                              <Check size={14} /> Paid
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* List 2: Payments History */}
            {feeTab === "payments" && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Receipt #</th>
                    <th>Student</th>
                    <th>Amount Paid</th>
                    <th>Payment Method</th>
                    <th>Transaction Date</th>
                    <th>Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(pay => (
                    <tr key={pay.id}>
                      <td style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.85rem" }}>{pay.id}</td>
                      <td style={{ fontWeight: 600 }}>{pay.studentName}</td>
                      <td style={{ fontWeight: 700, color: "var(--success)" }}>₨ {pay.amount.toLocaleString()}</td>
                      <td>
                        <span className="chip chip-info">{pay.method}</span>
                      </td>
                      <td style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>{pay.date}</td>
                      <td style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>{pay.recordedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 4. STAFF TAB */}
      {activeTab === "staff" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="glass-card" style={{ overflow: "hidden" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Staff Name</th>
                  <th>Role</th>
                  <th>Email Address</th>
                  <th>Students Assigned</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(st => (
                  <tr key={st.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{
                          width: "32px", height: "32px", borderRadius: "50%",
                          background: st.role === "Therapist" ? "rgba(155, 142, 196, 0.15)" : "rgba(123, 196, 196, 0.2)",
                          color: "var(--primary-dark)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 700, fontSize: "0.8rem"
                        }}>
                          {st.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{st.name}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{st.subRole}</div>
                        </div>
                      </div>
                    </td>
                    <td>{st.role}</td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{st.email}</td>
                    <td style={{ fontWeight: 600 }}>{st.studentsAssigned}</td>
                    <td>
                      <span className={`chip ${st.status === "Active" ? "chip-success" : "chip-gray"}`}>
                        {st.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn-ghost"
                        onClick={() => handleDeleteStaff(st.id, st.name)}
                        style={{ padding: "4px 8px", background: "rgba(229, 62, 62, 0.1)", color: "var(--danger)", border: "none" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. REPORTS TAB */}
      {activeTab === "reports" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          
          <div 
            className="glass-card" 
            style={{ padding: "24px", cursor: "pointer", display: "flex", gap: "16px", alignItems: "center", transition: "all 0.2s" }}
            onClick={() => generateReport("Student Progress Report")}
          >
            <div style={{ width: "48px", height: "48px", borderRadius: "10px", background: "rgba(123, 196, 196, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-teal)" }}>
              <Users size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Student Progress Report</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                Monthly milestones, achievements &amp; IEP goals
              </div>
            </div>
          </div>

          <div 
            className="glass-card" 
            style={{ padding: "24px", cursor: "pointer", display: "flex", gap: "16px", alignItems: "center", transition: "all 0.2s" }}
            onClick={() => generateReport("Fee Collection Report")}
          >
            <div style={{ width: "48px", height: "48px", borderRadius: "10px", background: "rgba(214, 158, 46, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--warning)" }}>
              <Receipt size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Fee Collection Report</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                Outstanding dues, receipts, &amp; monthly projections
              </div>
            </div>
          </div>

          <div 
            className="glass-card" 
            style={{ padding: "24px", cursor: "pointer", display: "flex", gap: "16px", alignItems: "center", transition: "all 0.2s" }}
            onClick={() => generateReport("Behavioral Incident Report")}
          >
            <div style={{ width: "48px", height: "48px", borderRadius: "10px", background: "rgba(229, 62, 62, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--danger)" }}>
              <AlertTriangle size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Behavioral Incident Report</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                Active trigger warnings, ABC history logs &amp; panic counts
              </div>
            </div>
          </div>

          <div 
            className="glass-card" 
            style={{ padding: "24px", cursor: "pointer", display: "flex", gap: "16px", alignItems: "center", transition: "all 0.2s" }}
            onClick={() => generateReport("Attendance & Scheduling Report")}
          >
            <div style={{ width: "48px", height: "48px", borderRadius: "10px", background: "rgba(155, 142, 196, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-lavender)" }}>
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Attendance &amp; Scheduling</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                Student daily session check-ins &amp; therapist hours
              </div>
            </div>
          </div>

        </div>
      )}

      {/* --- MODALS --- */}

      {/* A. ADD STUDENT MODAL */}
      {isAddStudentOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setIsAddStudentOpen(false)}>
          <div className="modal-box glass-card" style={{ width: "480px", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary-dark)", margin: 0 }}>Add New Student</h3>
              <button onClick={() => setIsAddStudentOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddStudent}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>First Name</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. Ahmed"
                    required
                    value={studentForm.firstName}
                    onChange={e => setStudentForm({ ...studentForm, firstName: e.target.value })}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Last Name</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. Hassan"
                    required
                    value={studentForm.lastName}
                    onChange={e => setStudentForm({ ...studentForm, lastName: e.target.value })}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Age</label>
                  <input
                    type="number"
                    className="glass-input"
                    placeholder="e.g. 8"
                    required
                    value={studentForm.age}
                    onChange={e => setStudentForm({ ...studentForm, age: e.target.value })}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Gender</label>
                  <select
                    className="glass-input"
                    value={studentForm.gender}
                    onChange={e => setStudentForm({ ...studentForm, gender: e.target.value })}
                  >
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Diagnosis</label>
                  <select
                    className="glass-input"
                    value={studentForm.diagnosis}
                    onChange={e => setStudentForm({ ...studentForm, diagnosis: e.target.value })}
                  >
                    {DIAGNOSES_OPTIONS.map(opt => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Contact No.</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="03XX-XXXXXXX"
                    value={studentForm.contactNo}
                    onChange={e => setStudentForm({ ...studentForm, contactNo: e.target.value })}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", gridColumn: "span 2" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Assign Therapist</label>
                  <select
                    className="glass-input"
                    value={studentForm.therapist}
                    onChange={e => setStudentForm({ ...studentForm, therapist: e.target.value })}
                  >
                    {staff.filter(st => st.role === "Therapist").map(ther => (
                      <option key={ther.id} value={ther.name}>{ther.name} – {ther.subRole}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", gridColumn: "span 2" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Guardian Name</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="Parent / Guardian Name"
                    value={studentForm.guardianName}
                    onChange={e => setStudentForm({ ...studentForm, guardianName: e.target.value })}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", gridColumn: "span 2" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Medical Notes</label>
                  <textarea
                    rows={2}
                    className="glass-input"
                    placeholder="Allergies, emergency protocol, physical details, etc."
                    value={studentForm.notes}
                    onChange={e => setStudentForm({ ...studentForm, notes: e.target.value })}
                  />
                </div>
              </div>
              
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button type="button" className="btn-ghost" onClick={() => setIsAddStudentOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  <CheckCircle size={16} /> Save Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* B. ADD STAFF MODAL */}
      {isAddStaffOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setIsAddStaffOpen(false)}>
          <div className="modal-box glass-card" style={{ width: "420px", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary-dark)", margin: 0 }}>Add New Staff Member</h3>
              <button onClick={() => setIsAddStaffOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddStaff}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Full Name</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. Sara Raza"
                    required
                    value={staffForm.name}
                    onChange={e => setStaffForm({ ...staffForm, name: e.target.value })}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Role Type</label>
                  <select
                    className="glass-input"
                    value={staffForm.role}
                    onChange={e => setStaffForm({ ...staffForm, role: e.target.value as "Teacher" | "Therapist" | "Admin" })}
                  >
                    <option value="Teacher">Teacher</option>
                    <option value="Therapist">Therapist</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Specialty / Job Title</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. Speech Therapist / Special Educator"
                    required
                    value={staffForm.subRole}
                    onChange={e => setStaffForm({ ...staffForm, subRole: e.target.value })}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Email Address</label>
                  <input
                    type="email"
                    className="glass-input"
                    placeholder="name@sc360.pk"
                    required
                    value={staffForm.email}
                    onChange={e => setStaffForm({ ...staffForm, email: e.target.value })}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Assigned Students</label>
                  <input
                    type="number"
                    className="glass-input"
                    placeholder="0"
                    value={staffForm.studentsAssigned}
                    onChange={e => setStaffForm({ ...staffForm, studentsAssigned: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Status</label>
                  <select
                    className="glass-input"
                    value={staffForm.status}
                    onChange={e => setStaffForm({ ...staffForm, status: e.target.value as "Active" | "Inactive" })}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button type="button" className="btn-ghost" onClick={() => setIsAddStaffOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  <CheckCircle size={16} /> Save Staff
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* C. NEW INVOICE MODAL */}
      {isAddInvoiceOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setIsAddInvoiceOpen(false)}>
          <div className="modal-box glass-card" style={{ width: "420px", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary-dark)", margin: 0 }}>Generate New Invoice</h3>
              <button onClick={() => setIsAddInvoiceOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddInvoice}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Select Student</label>
                  <select
                    className="glass-input"
                    required
                    value={invoiceForm.studentName}
                    onChange={e => setInvoiceForm({ ...invoiceForm, studentName: e.target.value })}
                  >
                    <option value="">Select student...</option>
                    {students.map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Billing Month</label>
                  <select
                    className="glass-input"
                    value={invoiceForm.month}
                    onChange={e => setInvoiceForm({ ...invoiceForm, month: e.target.value })}
                  >
                    <option>June 2025</option>
                    <option>May 2025</option>
                    <option>July 2025</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Amount (₨)</label>
                  <input
                    type="number"
                    className="glass-input"
                    placeholder="15000"
                    required
                    value={invoiceForm.amount}
                    onChange={e => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Due Date</label>
                  <input
                    type="date"
                    className="glass-input"
                    value={invoiceForm.dueDate}
                    onChange={e => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Additional Notes</label>
                  <textarea
                    rows={2}
                    className="glass-input"
                    placeholder="e.g. Includes therapy surcharges"
                    value={invoiceForm.notes}
                    onChange={e => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button type="button" className="btn-ghost" onClick={() => setIsAddInvoiceOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Generate Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* D. CONFIGURE FEES MODAL */}
      {isConfigureFeeOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setIsConfigureFeeOpen(false)}>
          <div className="modal-box glass-card" style={{ width: "420px", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary-dark)", margin: 0 }}>Configure Fee Structure</h3>
              <button onClick={() => setIsConfigureFeeOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveFeeConfig}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Program</label>
                  <select
                    className="glass-input"
                    value={feeConfig.program}
                    onChange={e => setFeeConfig({ ...feeConfig, program: e.target.value })}
                  >
                    <option>Full-Day Special Education</option>
                    <option>Half-Day Program</option>
                    <option>Therapy Only</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Monthly Tuition Fee (₨)</label>
                  <input
                    type="number"
                    className="glass-input"
                    value={feeConfig.monthlyFee}
                    onChange={e => setFeeConfig({ ...feeConfig, monthlyFee: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>One-time Admission Fee (₨)</label>
                  <input
                    type="number"
                    className="glass-input"
                    value={feeConfig.admissionFee}
                    onChange={e => setFeeConfig({ ...feeConfig, admissionFee: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Therapy Surcharge (₨)</label>
                  <input
                    type="number"
                    className="glass-input"
                    value={feeConfig.therapySurcharge}
                    onChange={e => setFeeConfig({ ...feeConfig, therapySurcharge: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Late Fee Penalty (%)</label>
                  <input
                    type="number"
                    className="glass-input"
                    value={feeConfig.lateFeePercent}
                    onChange={e => setFeeConfig({ ...feeConfig, lateFeePercent: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Due Day of the Month</label>
                  <input
                    type="number"
                    className="glass-input"
                    min={1}
                    max={28}
                    value={feeConfig.dueDay}
                    onChange={e => setFeeConfig({ ...feeConfig, dueDay: parseInt(e.target.value) || 10 })}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button type="button" className="btn-ghost" onClick={() => setIsConfigureFeeOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

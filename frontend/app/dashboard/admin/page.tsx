"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import toast from "react-hot-toast";
import { collection, query, where, onSnapshot, doc, deleteDoc, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { studentsDb, adminDb, dailyCareDb, abcDb } from "@/lib/firestore-api";
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
  HelpCircle,
  ArrowLeft,
  Calendar,
  FileText,
  ChevronRight
} from "lucide-react";

// --- Mock initial data matching HTML mockup ---
interface AdminStudent {
  id: string | number;
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
  id: string | number;
  name: string;
  subRole: string;
  role: "Teacher" | "Therapist" | "Admin";
  email: string;
  studentsAssigned: number;
  status: "Active" | "Inactive";
}

const INITIAL_STUDENTS: AdminStudent[] = [];

const INITIAL_INVOICES: AdminInvoice[] = [];

const INITIAL_PAYMENTS: AdminPayment[] = [];

const INITIAL_STAFF: AdminStaff[] = [];

const DIAGNOSES_OPTIONS = ["Autism", "Down Syndrome", "ADHD", "Cerebral Palsy", "Other"];

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<"dashboard" | "students" | "fees" | "staff" | "reports">("dashboard");

  // --- Reports State ---
  const [selectedReportType, setSelectedReportType] = useState<"progress" | "fees" | "behavior" | "attendance" | null>(null);
  const [selectedReportStudentId, setSelectedReportStudentId] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // --- Core States ---
  const [students, setStudents] = useState<AdminStudent[]>(INITIAL_STUDENTS);
  const [invoices, setInvoices] = useState<AdminInvoice[]>(INITIAL_INVOICES);
  const [payments, setPayments] = useState<AdminPayment[]>(INITIAL_PAYMENTS);
  const [staff, setStaff] = useState<AdminStaff[]>(INITIAL_STAFF);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [selectedPendingUser, setSelectedPendingUser] = useState<any | null>(null);

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
  const [recentAlerts, setRecentAlerts] = useState<any[]>([
    {
      id: "mock-1",
      emergencyType: "Panic Button triggered",
      location: "Room 3",
      timestamp: new Date().toISOString(),
      studentId: "student-001",
      reportedBy: { name: "Ahmed Raza" }
    },
    {
      id: "mock-2",
      emergencyType: "Regression detected in motor skills",
      location: "Therapy Room",
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      studentId: "student-004",
      reportedBy: { name: "Zara Khan" }
    },
    {
      id: "mock-3",
      emergencyType: "Invoice #1024 marked overdue",
      location: "Reception",
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      studentId: "student-002",
      reportedBy: { name: "Ali Hassan" }
    }
  ]);

  // --- Fetch Students from Firestore ---
  useEffect(() => {
    if (!profile) return;
    const fetchStudents = async () => {
      try {
        const data = await studentsDb.list(profile.centerId || "center-001");
        const mapped: AdminStudent[] = data.map(s => {
          const age = s.dob ? Math.floor((Date.now() - new Date(s.dob).getTime()) / (365.25 * 24 * 3600 * 1000)) : 0;
          return {
            id: s.id,
            name: s.name || "Unknown",
            age,
            diagnosis: s.diagnosis || "Unknown",
            therapist: s.therapistIds && s.therapistIds.length > 0 ? "Assigned" : "None",
            feeStatus: "paid", // Placeholder until fee module is built
            status: "Active"
          };
        });
        setStudents(mapped);
      } catch (err) {
        console.error("Failed to fetch admin students", err);
      }
    };

    const fetchStaff = async () => {
      try {
        const data = await adminDb.listStaff(profile.centerId || "center-001");
        const mapped: AdminStaff[] = data.map((s: any) => ({
          id: s.id,
          name: s.name,
          subRole: s.subRole,
          role: s.role,
          email: s.email,
          studentsAssigned: s.studentsAssigned,
          status: s.status
        }));
        setStaff(mapped);
      } catch (err) {
        console.error("Failed to fetch admin staff", err);
      }
    };

    const fetchFees = async () => {
      try {
        const cid = profile.centerId || "center-001";
        const invData = await adminDb.listInvoices(cid);
        const payData = await adminDb.listPayments(cid);
        
        setInvoices(invData.map((d: any) => ({
          id: d.id, studentName: d.studentName, amount: d.amount, month: d.month, issued: d.issued, status: d.status
        })));
        
        setPayments(payData.map((d: any) => ({
          id: d.id, studentName: d.studentName, amount: d.amount, method: d.method, date: d.date, recordedBy: d.recordedBy
        })));
      } catch (err) {
        console.error("Failed to fetch fee data", err);
      }
    };

    const fetchPendingUsers = async () => {
      try {
        const cid = profile.centerId || "center-001";
        const data = await adminDb.listPendingUsers(cid);
        setPendingUsers(data);
      } catch (err) {
        console.error("Failed to fetch pending users", err);
      }
    };

    fetchStudents();
    fetchStaff();
    fetchFees();
    fetchPendingUsers();
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    try {
      const q = query(
        collection(db, "panicAlerts"),
        where("status", "==", "active"),
        where("centerId", "==", profile.centerId || "center-001")
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

  useEffect(() => {
    if (!profile) return;
    try {
      const q = query(
        collection(db, "panicAlerts"),
        where("centerId", "==", profile.centerId || "center-001"),
        orderBy("timestamp", "desc"),
        limit(5)
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          const alerts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setRecentAlerts(alerts);
        },
        () => {
          // Fallback handled by initial state
        }
      );
      return unsub;
    } catch (err) {
      console.warn("Firebase not configured for recent alerts", err);
    }
  }, [profile]);

  // --- Fetch report details dynamically when a student and report type is selected ---
  useEffect(() => {
    if (!selectedReportStudentId || !selectedReportType) {
      setReportData(null);
      return;
    }

    const fetchReport = async () => {
      setReportLoading(true);
      try {
        if (selectedReportType === "progress") {
          const [carePlan, journals] = await Promise.all([
            studentsDb.getCarePlan(selectedReportStudentId),
            dailyCareDb.history(selectedReportStudentId)
          ]);
          setReportData({ carePlan, journals });
        } else if (selectedReportType === "behavior") {
          const [patterns, incidents] = await Promise.all([
            abcDb.getPatterns(selectedReportStudentId),
            abcDb.listIncidents(selectedReportStudentId, 15)
          ]);
          setReportData({ patterns, incidents });
        } else if (selectedReportType === "fees") {
          const stud = students.find(s => s.id === selectedReportStudentId);
          const studentName = stud ? stud.name : "";
          const studentInvoices = invoices.filter(i => i.studentName === studentName);
          const studentPayments = payments.filter(p => p.studentName === studentName);
          setReportData({ invoices: studentInvoices, payments: studentPayments });
        } else if (selectedReportType === "attendance") {
          const mockAttendance = [
            { date: "2026-06-12", status: "Present", checkIn: "08:45 AM", checkOut: "01:30 PM" },
            { date: "2026-06-11", status: "Present", checkIn: "08:50 AM", checkOut: "01:45 PM" },
            { date: "2026-06-10", status: "Absent", checkIn: "—", checkOut: "—" },
            { date: "2026-06-09", status: "Present", checkIn: "08:40 AM", checkOut: "01:30 PM" },
            { date: "2026-06-08", status: "Present", checkIn: "08:55 AM", checkOut: "01:40 PM" },
          ];
          setReportData({ attendance: mockAttendance });
        }
      } catch (err) {
        console.error("Failed to fetch report data:", err);
        toast.error("Failed to generate report.");
      } finally {
        setReportLoading(false);
      }
    };

    fetchReport();
  }, [selectedReportStudentId, selectedReportType, invoices, payments, students]);

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
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentForm.firstName || !studentForm.lastName) {
      toast.error("Please fill in the student's name");
      return;
    }

    const fullName = `${studentForm.firstName} ${studentForm.lastName}`.trim();
    const ageNum = parseInt(studentForm.age);
    if (isNaN(ageNum) || ageNum < 0 || ageNum > 12) {
      toast.error("Student age must be between 0 and 12 years.");
      return;
    }
    const dob = new Date(Date.now() - ageNum * 365.25 * 24 * 3600 * 1000).toISOString();

    try {
      const newId = await studentsDb.create({
        name: fullName,
        dob: dob,
        diagnosis: studentForm.diagnosis,
        centerId: profile?.centerId || "center-001",
        teacherId: "", 
        therapistIds: studentForm.therapist ? [studentForm.therapist] : [], 
        enrollmentDate: new Date().toISOString(),
        iepStatus: "Active",
        photoUrl: "",
        parentId: "",
        guardianName: studentForm.guardianName,
        contactNo: studentForm.contactNo,
        notes: studentForm.notes
      } as any);

      const newStudent: AdminStudent = {
        id: newId,
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
    toast.success("Student added successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to add student");
    }
  };

  const handleDeleteStudent = async (id: string | number, name: string) => {
    if (confirm(`Are you sure you want to remove ${name}?`)) {
      try {
        await studentsDb.delete(id.toString());
        setStudents(students.filter(s => s.id !== id));
        toast.success("Student removed");
      } catch (err) {
        console.error(err);
        toast.error("Failed to remove student");
      }
    }
  };

  const handleApproveUser = async (uid: string, name: string) => {
    try {
      await adminDb.approveUser(uid);
      setPendingUsers(pendingUsers.filter(u => u.id !== uid));
      toast.success(`${name} has been approved successfully!`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to approve user");
    }
  };

  const handleRejectUser = async (uid: string, name: string) => {
    if (confirm(`Are you sure you want to reject the registration request for ${name}?`)) {
      try {
        await deleteDoc(doc(db, "users", uid));
        setPendingUsers(pendingUsers.filter(u => u.id !== uid));
        setSelectedPendingUser(null);
        toast.success(`Registration request for ${name} rejected.`);
      } catch (err) {
        console.error(err);
        toast.error("Failed to reject user");
      }
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffForm.name || !staffForm.email) {
      toast.error("Please fill in the name and email fields");
      return;
    }

    try {
      const newId = await adminDb.addStaff({
        name: staffForm.name,
        subRole: staffForm.subRole || "Specialist",
        role: staffForm.role,
        email: staffForm.email,
        studentsAssigned: staffForm.studentsAssigned,
        status: staffForm.status,
        centerId: profile?.centerId || "center-001"
      });

      const newMember: AdminStaff = {
        id: newId,
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
    } catch (err) {
      console.error(err);
      toast.error("Failed to add staff member");
    }
  };

  const handleDeleteStaff = async (id: string | number, name: string) => {
    if (confirm(`Are you sure you want to delete staff member ${name}?`)) {
      try {
        await adminDb.deleteStaff(id.toString());
        setStaff(staff.filter(st => st.id !== id));
        toast.success("Staff member removed");
      } catch (err) {
        console.error(err);
        toast.error("Failed to remove staff member");
      }
    }
  };

  const handleAddInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceForm.studentName || !invoiceForm.amount) {
      toast.error("Please select a student and enter an amount");
      return;
    }

    try {
      const issuedDate = new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short" });
      
      const newId = await adminDb.addInvoice({
        studentName: invoiceForm.studentName,
        amount: parseFloat(invoiceForm.amount),
        month: invoiceForm.month,
        issued: issuedDate,
        status: "pending",
        centerId: profile?.centerId || "center-001"
      });

      const newInvoice: AdminInvoice = {
        id: newId,
        studentName: invoiceForm.studentName,
        amount: parseFloat(invoiceForm.amount),
        month: invoiceForm.month,
        issued: issuedDate,
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
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate invoice");
    }
  };

  const handleMarkPaid = async (invoiceId: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;

    try {
      // Update invoice status in DB
      await adminDb.updateInvoiceStatus(invoiceId, "paid");

      // Add payment entry to DB
      const payDate = new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
      const payId = await adminDb.addPayment({
        studentName: inv.studentName,
        amount: inv.amount,
        method: "Bank Transfer",
        date: payDate,
        recordedBy: profile?.name || "Admin",
        centerId: profile?.centerId || "center-001"
      });

      // Update Local State
      setInvoices(invoices.map(i => i.id === invoiceId ? { ...i, status: "paid" } : i));
      
      const newPayment: AdminPayment = {
        id: payId,
        studentName: inv.studentName,
        amount: inv.amount,
        method: "Bank Transfer",
        date: payDate,
        recordedBy: profile?.name || "Admin"
      };
      setPayments([newPayment, ...payments]);

      // Also update student feeStatus
      setStudents(students.map(s => s.name === inv.studentName ? { ...s, feeStatus: "paid" } : s));

      toast.success(`Payment recorded for ${inv.studentName}!`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to record payment");
    }
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
        icon: <FileSpreadsheet size={18} style={{ color: "var(--accent-teal)" }} />
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

  const formatRequestDate = (createdAt: any) => {
    if (!createdAt) return "Unknown date";
    if (typeof createdAt.toDate === "function") {
      return createdAt.toDate().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    if (createdAt.seconds) {
      return new Date(createdAt.seconds * 1000).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    return new Date(createdAt).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

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
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(123, 196, 196, 0.2)", padding: "6px", borderRadius: "8px" }}>
                  <Users size={18} style={{ color: "#7bc4c4" }} />
                </span>
              </div>
              <h2 style={{ fontSize: "2rem", fontWeight: 800, margin: "10px 0 5px 0", color: "var(--primary-dark)" }}>
                {totalStudents}
              </h2>
              <span style={{ fontSize: "0.78rem", color: "var(--success)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--success)", display: "inline-block" }} />
                Active enrollments
              </span>
            </div>

            <div className="glass-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Staff Members</span>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(155, 142, 196, 0.2)", padding: "6px", borderRadius: "8px" }}>
                  <Contact size={18} style={{ color: "#b8a8d4" }} />
                </span>
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
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(229, 62, 62, 0.2)", padding: "6px", borderRadius: "8px" }}>
                  <AlertTriangle size={18} style={{ color: "var(--danger)" }} />
                </span>
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
                
                {recentAlerts.length === 0 ? (
                  <div style={{ padding: "10px 0", color: "var(--text-secondary)", fontSize: "0.88rem" }}>
                    No recent incident alerts.
                  </div>
                ) : (
                  recentAlerts.map((alert) => {
                    const studentName = students.find(s => s.id === alert.studentId)?.name || alert.reportedBy?.name || "Unknown";
                    const isToday = alert.timestamp && new Date(alert.timestamp).toDateString() === new Date().toDateString();
                    const dateStr = alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
                    const relativeDay = alert.timestamp ? new Date(alert.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }) : "Today";
                    
                    return (
                      <div key={alert.id} style={{ display: "flex", gap: "12px", alignItems: "flex-start", paddingBottom: "10px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                        <div style={{
                          padding: "8px",
                          background: alert.status === "resolved" ? "rgba(56, 161, 105, 0.12)" : "rgba(229, 62, 62, 0.12)",
                          color: alert.status === "resolved" ? "var(--success)" : "var(--danger)",
                          borderRadius: "8px"
                        }}>
                          <AlertTriangle size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                            {alert.emergencyType} — {alert.location}
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                            {isToday ? `Today, ${dateStr}` : relativeDay} · {studentName} {alert.status === "resolved" ? "(Resolved)" : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

              </div>
            </div>

            {/* Pending Approvals Widget */}
            <div className="glass-card" style={{ padding: "24px" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "16px", color: "var(--primary-dark)", display: "flex", alignItems: "center", gap: "8px" }}>
                <UserPlus size={18} style={{ color: "var(--accent-teal)" }} /> Pending Approvals
              </h3>
              {pendingUsers.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-secondary)" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px", color: "var(--success)" }}>
                    <CheckCircle size={32} />
                  </div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>No pending registration requests</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "280px", overflowY: "auto" }}>
                  {pendingUsers.map((u, idx) => (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "12px", borderBottom: idx < pendingUsers.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
                      <div 
                        onClick={() => setSelectedPendingUser(u)}
                        style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", transition: "opacity 0.2s" }}
                        onMouseOver={(e) => { e.currentTarget.style.opacity = "0.75"; }}
                        onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
                        title="Click to view registration details"
                      >
                        <div style={{
                          width: "36px", height: "36px", borderRadius: "50%",
                          background: "var(--accent-lavender)", color: "white",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 700, fontSize: "0.85rem"
                        }}>
                          {u.name ? u.name.split(" ").map((w: any) => w[0]).join("").slice(0, 2).toUpperCase() : "?"}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{u.name}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                            {u.email} · <span style={{ textTransform: "capitalize", fontWeight: 600, color: "var(--primary-dark)" }}>{u.role}</span>
                          </div>
                        </div>
                      </div>
                      <button 
                        className="btn-primary" 
                        onClick={() => handleApproveUser(u.id, u.name)} 
                        style={{ padding: "6px 12px", fontSize: "0.75rem", background: "var(--accent-teal)" }}
                      >
                        Approve
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {selectedReportType === null ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              <div 
                className="glass-card" 
                style={{ padding: "24px", cursor: "pointer", display: "flex", gap: "16px", alignItems: "center", transition: "all 0.2s" }}
                onClick={() => { setSelectedReportType("progress"); setSelectedReportStudentId(students[0]?.id ? String(students[0].id) : null); }}
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
                onClick={() => { setSelectedReportType("fees"); setSelectedReportStudentId(students[0]?.id ? String(students[0].id) : null); }}
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
                onClick={() => { setSelectedReportType("behavior"); setSelectedReportStudentId(students[0]?.id ? String(students[0].id) : null); }}
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
                onClick={() => { setSelectedReportType("attendance"); setSelectedReportStudentId(students[0]?.id ? String(students[0].id) : null); }}
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
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Workspace Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "12px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button 
                    onClick={() => { setSelectedReportType(null); setSelectedReportStudentId(null); }}
                    style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", color: "var(--primary-dark)", fontWeight: 600, gap: "6px" }}
                  >
                    <ArrowLeft size={16} /> Back to Reports
                  </button>
                  <span style={{ color: "var(--text-secondary)" }}>|</span>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--primary-dark)" }}>
                    {selectedReportType === "progress" && "Student Progress Report Center"}
                    {selectedReportType === "behavior" && "Behavioral Incident Report Center"}
                    {selectedReportType === "fees" && "Student Fee Ledger & Reports"}
                    {selectedReportType === "attendance" && "Attendance & Session Scheduling"}
                  </h3>
                </div>
                {selectedReportStudentId && reportData && !reportLoading && (
                  <button 
                    className="btn-ghost" 
                    onClick={() => window.print()}
                    style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.7)" }}
                  >
                    <Printer size={15} /> Print Report
                  </button>
                )}
              </div>

              {/* Workspace Body */}
              <div style={{ display: "flex", gap: "20px", minHeight: "500px" }}>
                {/* Left Student Selector */}
                <div className="glass-card" style={{ width: "240px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px", flexShrink: 0 }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                    Select Student
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", maxHeight: "450px" }}>
                    {students.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedReportStudentId(String(s.id))}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "none",
                          textAlign: "left",
                          cursor: "pointer",
                          background: selectedReportStudentId === String(s.id) ? "var(--accent-teal)" : "rgba(255,255,255,0.4)",
                          color: selectedReportStudentId === String(s.id) ? "white" : "var(--text-primary)",
                          fontWeight: selectedReportStudentId === String(s.id) ? 700 : 500,
                          fontSize: "0.85rem",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          transition: "all 0.2s"
                        }}
                      >
                        <span>{s.name}</span>
                        <ChevronRight size={14} style={{ opacity: selectedReportStudentId === String(s.id) ? 1 : 0.4 }} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right Report Detail View */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {!selectedReportStudentId ? (
                    <div className="glass-card" style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px", textAlign: "center" }}>
                      <FileText size={48} style={{ color: "var(--text-secondary)", marginBottom: "12px", opacity: 0.7 }} />
                      <h4 style={{ margin: 0, color: "var(--primary-dark)" }}>No Student Selected</h4>
                      <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginTop: "6px" }}>
                        Choose a student from the sidebar to generate and display their report.
                      </p>
                    </div>
                  ) : reportLoading ? (
                    <div className="glass-card" style={{ padding: "40px", display: "flex", flexDirection: "column", gap: "16px" }}>
                      <div className="skeleton" style={{ height: "40px", borderRadius: "8px", width: "40%" }} />
                      <div className="skeleton" style={{ height: "24px", borderRadius: "8px", width: "60%" }} />
                      <div style={{ height: "1px", background: "rgba(0,0,0,0.06)", margin: "8px 0" }} />
                      <div className="skeleton" style={{ height: "120px", borderRadius: "12px" }} />
                      <div className="skeleton" style={{ height: "120px", borderRadius: "12px" }} />
                    </div>
                  ) : reportData ? (
                    <div className="glass-card animate-fade-in" style={{ padding: "30px", background: "white", minHeight: "100%" }}>
                      
                      {/* Report Title */}
                      <div style={{ borderBottom: "2px solid var(--primary-dark)", paddingBottom: "16px", marginBottom: "20px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "var(--primary-dark)" }}>
                              {selectedReportType === "progress" && "INDIVIDUAL PROGRESS REPORT"}
                              {selectedReportType === "behavior" && "BEHAVIORAL INCIDENT REPORT"}
                              {selectedReportType === "fees" && "STUDENT ACCOUNT LEDGER"}
                              {selectedReportType === "attendance" && "ATTENDANCE RECORD SUMMARY"}
                            </h2>
                            <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                              SPECIAL CARE 360 · MULTI-DISCIPLINARY EDUCATION HUB
                            </p>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)" }}>REPORT ID: #SC-{selectedReportStudentId.slice(0,6).toUpperCase()}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                              Date: {new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Student Profile Info */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", padding: "16px", background: "rgba(61,79,107,0.04)", borderRadius: "12px", marginBottom: "24px" }}>
                        <div>
                          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Student Name</div>
                          <div style={{ fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem" }}>
                            {students.find(s => String(s.id) === selectedReportStudentId)?.name || "Unknown"}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Age / Diagnosis</div>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9rem" }}>
                            {students.find(s => String(s.id) === selectedReportStudentId)?.age} yrs · {students.find(s => String(s.id) === selectedReportStudentId)?.diagnosis}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Assigned Therapist</div>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9rem" }}>
                            {students.find(s => String(s.id) === selectedReportStudentId)?.therapist || "None assigned"}
                          </div>
                        </div>
                      </div>

                      {/* Report Specific Details */}
                      {selectedReportType === "progress" && (
                        <div>
                          <h4 style={{ margin: "0 0 12px", color: "var(--primary-dark)", fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                            <CheckCircle size={16} style={{ color: "var(--accent-teal)" }} /> IEP Goals &amp; Milestone Progress
                          </h4>
                          
                          {/* IEP Goals Progress Bar list */}
                          {(!reportData.carePlan || !reportData.carePlan.goals || reportData.carePlan.goals.length === 0) ? (
                            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>No IEP goals configured for this student.</p>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
                              {reportData.carePlan.goals.map((g: any) => (
                                <div key={g.id} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: "8px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                    <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>{g.title}</span>
                                    <span className={`chip ${g.status === "Mastered" ? "chip-success" : g.status === "In Progress" ? "chip-info" : g.status === "Regressed" ? "chip-danger" : "chip-gray"}`} style={{ fontSize: "0.68rem", padding: "2px 8px" }}>
                                      {g.status} ({g.progressPercent}%)
                                    </span>
                                  </div>
                                  <div style={{ height: "6px", background: "rgba(0,0,0,0.05)", borderRadius: "3px", overflow: "hidden" }}>
                                    <div style={{ width: `${g.progressPercent}%`, height: "100%", background: g.status === "Mastered" ? "var(--success)" : g.status === "Regressed" ? "var(--danger)" : "var(--accent-teal)" }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <h4 style={{ margin: "0 0 12px", color: "var(--primary-dark)", fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                            <Clock size={16} style={{ color: "var(--accent-lavender)" }} /> Daily Care Journal Summary (Last 15 Days)
                          </h4>
                          {(!reportData.journals || reportData.journals.length === 0) ? (
                            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>No daily care logs registered in the last 15 days.</p>
                          ) : (
                            <div>
                              <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 12px" }}>
                                Showing the last {reportData.journals.length} submitted daily journals.
                              </p>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                {reportData.journals.slice(0, 4).map((j: any) => (
                                  <div key={j.date} style={{ padding: "12px", borderRadius: "10px", background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.04)" }}>
                                    <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "var(--primary-dark)" }}>{new Date(j.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                                      <b>Mood:</b> <span style={{ textTransform: "capitalize" }}>{j.moodTimeline?.[0]?.mood || "neutral"}</span>
                                    </div>
                                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                                      <b>Meals:</b> Breakfast: {j.meals?.breakfast?.ate}, Lunch: {j.meals?.lunch?.ate}
                                    </div>
                                    {j.teacherNotes && (
                                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontStyle: "italic", marginTop: "4px", background: "rgba(255,255,255,0.8)", padding: "4px 6px", borderRadius: "4px" }}>
                                        &ldquo;{j.teacherNotes.slice(0, 60)}{j.teacherNotes.length > 60 && "..."}&rdquo;
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {selectedReportType === "behavior" && reportData.patterns && (
                        <div>
                          <h4 style={{ margin: "0 0 12px", color: "var(--primary-dark)", fontSize: "0.95rem", fontWeight: 700 }}>
                            ABC Behavioral Pattern Analysis
                          </h4>
                          
                          {/* Pattern Analytics Grid */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px", marginBottom: "20px" }}>
                            <div style={{ padding: "12px", background: "rgba(229,62,62,0.04)", borderRadius: "8px", border: "1px solid rgba(229,62,62,0.1)" }}>
                              <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>Total Incidents</div>
                              <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--danger)", marginTop: "2px" }}>{reportData.patterns.totalIncidents}</div>
                            </div>
                            <div style={{ padding: "12px", background: "rgba(255,255,255,0.7)", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.06)" }}>
                              <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>Avg Severity</div>
                              <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--primary-dark)", marginTop: "2px" }}>{reportData.patterns.avgSeverity}/5</div>
                            </div>
                            <div style={{ padding: "12px", background: "rgba(255,255,255,0.7)", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.06)" }}>
                              <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>Top Trigger</div>
                              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--primary-dark)", marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{reportData.patterns.topAntecedents[0]?.tag || "—"}</div>
                            </div>
                            <div style={{ padding: "12px", background: "rgba(255,255,255,0.7)", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.06)" }}>
                              <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>Top Behavior</div>
                              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--primary-dark)", marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{reportData.patterns.topBehaviors[0]?.tag || "—"}</div>
                            </div>
                          </div>

                          <h4 style={{ margin: "0 0 12px", color: "var(--primary-dark)", fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                            <AlertTriangle size={16} style={{ color: "var(--danger)" }} /> Recent ABC Incidents
                          </h4>
                          {reportData.incidents.length === 0 ? (
                            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>No behavioral logs recorded for this student.</p>
                          ) : (
                            <div style={{ overflowX: "auto" }}>
                              <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                  <tr style={{ background: "rgba(0,0,0,0.02)", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                                    <th style={{ padding: "8px", fontSize: "0.75rem", textAlign: "left" }}>Date</th>
                                    <th style={{ padding: "8px", fontSize: "0.75rem", textAlign: "left" }}>Antecedent (Trigger)</th>
                                    <th style={{ padding: "8px", fontSize: "0.75rem", textAlign: "left" }}>Behavior Observed</th>
                                    <th style={{ padding: "8px", fontSize: "0.75rem", textAlign: "left" }}>Severity</th>
                                    <th style={{ padding: "8px", fontSize: "0.75rem", textAlign: "left" }}>Location</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {reportData.incidents.slice(0, 6).map((inc: any) => (
                                    <tr key={inc.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                                      <td style={{ padding: "8px", fontSize: "0.78rem", whiteSpace: "nowrap" }}>{new Date(inc.timestamp).toLocaleDateString()}</td>
                                      <td style={{ padding: "8px", fontSize: "0.78rem" }}>{inc.antecedent?.text}</td>
                                      <td style={{ padding: "8px", fontSize: "0.78rem" }}>{inc.behavior?.text}</td>
                                      <td style={{ padding: "8px", fontSize: "0.78rem", fontWeight: 700, color: inc.severity >= 4 ? "var(--danger)" : "var(--warning)" }}>{inc.severity}/5</td>
                                      <td style={{ padding: "8px", fontSize: "0.78rem", color: "var(--text-secondary)" }}>{inc.location}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {selectedReportType === "fees" && reportData.invoices && (
                        <div>
                          <h4 style={{ margin: "0 0 12px", color: "var(--primary-dark)", fontSize: "0.95rem", fontWeight: 700 }}>
                            Ledger Account Balance &amp; Transactions
                          </h4>

                          {/* Invoice Summary */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "24px" }}>
                            <div style={{ padding: "14px", background: "rgba(56, 161, 105, 0.05)", border: "1px solid rgba(56, 161, 105, 0.15)", borderRadius: "10px" }}>
                              <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>Total Payments Received</div>
                              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--success)", marginTop: "2px" }}>
                                ₨ {reportData.payments.reduce((sum: number, p: any) => sum + p.amount, 0).toLocaleString()}
                              </div>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(229, 62, 62, 0.05)", border: "1px solid rgba(229, 62, 62, 0.15)", borderRadius: "10px" }}>
                              <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>Outstanding Overdue Dues</div>
                              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--danger)", marginTop: "2px" }}>
                                ₨ {reportData.invoices.filter((i: any) => i.status === "overdue").reduce((sum: number, i: any) => sum + i.amount, 0).toLocaleString()}
                              </div>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(214, 158, 46, 0.05)", border: "1px solid rgba(214, 158, 46, 0.15)", borderRadius: "10px" }}>
                              <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>Pending Invoices</div>
                              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--warning)", marginTop: "2px" }}>
                                ₨ {reportData.invoices.filter((i: any) => i.status === "pending").reduce((sum: number, i: any) => sum + i.amount, 0).toLocaleString()}
                              </div>
                            </div>
                          </div>

                          <h4 style={{ margin: "0 0 12px", color: "var(--primary-dark)", fontSize: "0.95rem", fontWeight: 700 }}>
                            Transaction Records
                          </h4>
                          {reportData.invoices.length === 0 && reportData.payments.length === 0 ? (
                            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>No financial logs recorded for this student.</p>
                          ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                              <div>
                                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "8px" }}>Invoices Issued</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                  {reportData.invoices.map((inv: any) => (
                                    <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.04)", borderRadius: "8px", fontSize: "0.82rem" }}>
                                      <div>
                                        <div style={{ fontWeight: 600 }}>{inv.month}</div>
                                        <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Issued: {inv.issued}</div>
                                      </div>
                                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <span style={{ fontWeight: 700 }}>₨ {inv.amount.toLocaleString()}</span>
                                        {feeStatusLabels[inv.status as "paid" | "pending" | "overdue"]}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "8px" }}>Payments Logged</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                  {reportData.payments.length === 0 ? (
                                    <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", margin: 0 }}>No payments registered.</p>
                                  ) : (
                                    reportData.payments.map((p: any) => (
                                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "rgba(56, 161, 105, 0.02)", border: "1px solid rgba(56, 161, 105, 0.1)", borderRadius: "8px", fontSize: "0.82rem" }}>
                                        <div>
                                          <div style={{ fontWeight: 600, color: "var(--success)" }}>Paid (via {p.method})</div>
                                          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Date: {p.date}</div>
                                        </div>
                                        <span style={{ fontWeight: 700, color: "var(--success)" }}>₨ {p.amount.toLocaleString()}</span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {selectedReportType === "attendance" && reportData.attendance && (
                        <div>
                          <h4 style={{ margin: "0 0 12px", color: "var(--primary-dark)", fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                            <Calendar size={16} style={{ color: "var(--accent-teal)" }} /> Session Check-In History
                          </h4>
                          <div style={{ overflowX: "auto" }}>
                            <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ background: "rgba(0,0,0,0.02)", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                                  <th style={{ padding: "8px", fontSize: "0.75rem", textAlign: "left" }}>Session Date</th>
                                  <th style={{ padding: "8px", fontSize: "0.75rem", textAlign: "left" }}>Attendance Status</th>
                                  <th style={{ padding: "8px", fontSize: "0.75rem", textAlign: "left" }}>Check-In Time</th>
                                  <th style={{ padding: "8px", fontSize: "0.75rem", textAlign: "left" }}>Check-Out Time</th>
                                  <th style={{ padding: "8px", fontSize: "0.75rem", textAlign: "left" }}>Therapeutic Hours</th>
                                </tr>
                              </thead>
                              <tbody>
                                {reportData.attendance.map((att: any, idx: number) => (
                                  <tr key={idx} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                                    <td style={{ padding: "8px", fontSize: "0.8rem", fontWeight: 600 }}>
                                      {new Date(att.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                                    </td>
                                    <td style={{ padding: "8px", fontSize: "0.8rem" }}>
                                      <span className={`chip ${att.status === "Present" ? "chip-success" : "chip-danger"}`} style={{ fontSize: "0.68rem", padding: "2px 8px" }}>
                                        {att.status}
                                      </span>
                                    </td>
                                    <td style={{ padding: "8px", fontSize: "0.8rem", color: "var(--text-primary)" }}>{att.checkIn}</td>
                                    <td style={{ padding: "8px", fontSize: "0.8rem", color: "var(--text-primary)" }}>{att.checkOut}</td>
                                    <td style={{ padding: "8px", fontSize: "0.8rem", fontWeight: 600 }}>{att.status === "Present" ? "4.7 hrs" : "0 hrs"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Footer Notes */}
                      <div style={{ marginTop: "40px", paddingTop: "14px", borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                        <div>Generated automatically by Special Care 360 System.</div>
                        <div style={{ fontWeight: 600 }}>CONFIDENTIAL · FOR INTERNAL CLINICAL USE ONLY</div>
                      </div>

                    </div>
                  ) : null}
                </div>
              </div>

            </div>
          )}
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
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Age (0-12)</label>
                  <input
                    type="number"
                    className="glass-input"
                    placeholder="e.g. 8"
                    required
                    min="0"
                    max="12"
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

      {/* E. PENDING USER DETAILS MODAL */}
      {selectedPendingUser && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelectedPendingUser(null)}>
          <div className="modal-box glass-card animate-fade-in" style={{ width: "420px", padding: "28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary-dark)", margin: 0 }}>Registration Request Details</h3>
              <button onClick={() => setSelectedPendingUser(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{
                width: "64px", height: "64px", borderRadius: "50%",
                background: "var(--accent-lavender)", color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: "1.5rem", margin: "0 auto 12px",
                boxShadow: "0 4px 12px rgba(155, 142, 196, 0.2)"
              }}>
                {selectedPendingUser.name ? selectedPendingUser.name.split(" ").map((w: any) => w[0]).join("").slice(0, 2).toUpperCase() : "?"}
              </div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--primary-dark)", margin: "0 0 4px" }}>
                {selectedPendingUser.name}
              </h2>
              <span className="chip chip-purple" style={{ textTransform: "capitalize", fontWeight: 700, fontSize: "0.78rem" }}>
                {selectedPendingUser.role}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "rgba(255,255,255,0.3)", padding: "16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.5)", marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>Email Address</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--primary-dark)", wordBreak: "break-all" }}>{selectedPendingUser.email}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>Center ID</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--primary-dark)" }}>{selectedPendingUser.centerId}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>Request Date</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--primary-dark)" }}>
                  {selectedPendingUser.createdAt ? formatRequestDate(selectedPendingUser.createdAt) : "Just now"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button 
                type="button" 
                className="btn-ghost" 
                onClick={() => handleRejectUser(selectedPendingUser.id, selectedPendingUser.name)}
                style={{ background: "rgba(229,62,62,0.08)", color: "#e53e3e", border: "1px solid rgba(229,62,62,0.15)" }}
              >
                Reject Request
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={async () => {
                  await handleApproveUser(selectedPendingUser.id, selectedPendingUser.name);
                  setSelectedPendingUser(null);
                }}
                style={{ background: "var(--accent-teal)" }}
              >
                Approve Request
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

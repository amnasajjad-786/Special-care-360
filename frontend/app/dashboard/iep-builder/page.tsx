"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { studentsDb, iepDb, abcDb, StudentDoc, scopeOf } from "@/lib/firestore-api";
import { IEPGoal, MedicalProfile, CarePlan, ABCIncident } from "@/types";
import toast from "react-hot-toast";
import {
  BrainCircuit,
  Sparkles,
  Plus,
  Trash2,
  Save,
  CheckCircle,
  AlertTriangle,
  FileText,
  Clock,
  Target,
  Activity,
  ShieldAlert,
  Trophy,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export default function IEPBuilderPage() {
  const { profile, user, loading } = useAuth();
  const [students, setStudents] = useState<StudentDoc[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<StudentDoc | null>(null);

  // Student Context State
  const [medicalProfile, setMedicalProfile] = useState<MedicalProfile | null>(null);
  const [abcIncidents, setAbcIncidents] = useState<ABCIncident[]>([]);
  const [loadingStudentData, setLoadingStudentData] = useState(false);

  // IEP Editor State
  const [goals, setGoals] = useState<IEPGoal[]>([]);
  const [achievedGoals, setAchievedGoals] = useState<IEPGoal[]>([]);
  const [pendingAiGoal, setPendingAiGoal] = useState<IEPGoal | null>(null);
  const [isGeneratingNextGoal, setIsGeneratingNextGoal] = useState(false);
  const [showAchievedHistory, setShowAchievedHistory] = useState(false);
  const [iepSummary, setIepSummary] = useState<string>("");
  const [disclaimer, setDisclaimer] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [insufficientDataMsg, setInsufficientDataMsg] = useState<string>("");
  const [showManualAdd, setShowManualAdd] = useState<boolean>(false);
  const [newGoal, setNewGoal] = useState<Partial<IEPGoal>>({
    goalArea: "Communication & Speech",
    title: "",
    targetTimeframe: "3 Months",
    measurementMethod: "Daily therapist observation logs",
    rationale: "",
    milestones: [],
  });

  // Access control:
  // All 4 roles can view the student's IEP, but ONLY Therapist can generate, edit, add, delete, and finalize.
  const isAuthorized =
    profile?.role === "therapist" ||
    profile?.role === "teacher" ||
    profile?.role === "admin" ||
    profile?.role === "parent";

  const isTherapist = profile?.role === "therapist";
  const canEdit = isTherapist;

  // Load Students
  useEffect(() => {
    async function loadStudents() {
      if (!isAuthorized) return;
      try {
        const list = await studentsDb.list(scopeOf(profile));
        setStudents(list);
        if (list.length > 0) {
          setSelectedStudentId(list[0].id);
        }
      } catch (err) {
        console.error("Failed to load students", err);
        toast.error("Could not load students list.");
      }
    }
    loadStudents();
  }, [profile, isAuthorized]);

  // Load Context Data when student changes
  useEffect(() => {
    if (!selectedStudentId) return;
    const current = students.find((s) => s.id === selectedStudentId) || null;
    setSelectedStudent(current);
    setInsufficientDataMsg("");
    setGoals([]);
    setIepSummary("");

    async function fetchStudentContext() {
      setLoadingStudentData(true);

      // Fetch each independently so one failure doesn't block the others
      let medData: MedicalProfile | Record<string, unknown> = {};
      let careData: CarePlan | Record<string, unknown> = {};
      let abcData: ABCIncident[] = [];

      try {
        medData = (await studentsDb.getMedical(selectedStudentId)) as MedicalProfile;
      } catch (e) {
        console.warn("getMedical failed:", e);
      }
      try {
        careData = (await studentsDb.getCarePlan(selectedStudentId)) as CarePlan;
      } catch (e) {
        console.warn("getCarePlan failed:", e);
      }
      try {
        abcData = (await abcDb.listIncidents(selectedStudentId, scopeOf(profile), 10)) as ABCIncident[];
      } catch (e) {
        console.warn("listIncidents failed:", e);
      }

      setMedicalProfile(medData as MedicalProfile);
      setAbcIncidents(abcData || []);

      // Pre-populate with IEP goals based on role:
      // - Therapist: only restore if a real IEP was previously saved (Active or draft).
      //   Seeded care-plan tracking goals are intentionally ignored so therapist
      //   starts with 0 goals and must click "Generate IEP with AI".
      // - All other roles (admin, teacher, parent): always show whatever goals exist.
      const currentCare = careData as CarePlan;
      const rawCare = careData as unknown as Record<string, unknown>;
      const hasRealIep =
        currentCare.iepStatus === "Active" ||
        rawCare.draftIep != null ||
        (Array.isArray(currentCare.achievedGoals) && (currentCare.achievedGoals?.length ?? 0) > 0);

      if (
        currentCare &&
        Array.isArray(currentCare.goals) &&
        currentCare.goals.length > 0 &&
        (profile?.role !== "therapist" || hasRealIep)
      ) {
        setGoals(currentCare.goals);
        if (currentCare.iepSummary) setIepSummary(currentCare.iepSummary);
        if (currentCare.iepStatus === "Active") {
          setDisclaimer("This is the active finalized IEP plan for this student.");
        }
      }

      // Always load achieved goals history and pending AI suggestion (therapist workflow)
      if (Array.isArray(currentCare.achievedGoals)) {
        setAchievedGoals(currentCare.achievedGoals);
      }
      if (currentCare.pendingAiGoal) {
        setPendingAiGoal(currentCare.pendingAiGoal as IEPGoal);
      } else {
        setPendingAiGoal(null);
      }

      setLoadingStudentData(false);
    }

    fetchStudentContext();
  }, [selectedStudentId, students, profile]);

  // Trigger AI Generation
  const handleGenerateIEP = async () => {
    if (!selectedStudentId) {
      toast.error("Please select a student first.");
      return;
    }

    setIsGenerating(true);
    setInsufficientDataMsg("");

    try {
      // Call backend AI endpoint
      const response = await fetch(`http://127.0.0.1:8000/ai-insights/iep/${selectedStudentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server responded with status ${response.status}`);
      }

      const data = await response.json();

      if (!data.sufficientData) {
        setInsufficientDataMsg(data.summary);
        toast.error("Insufficient background data for AI generation.");
        return;
      }

      setGoals(data.goals || []);
      setIepSummary(data.summary || "");
      setDisclaimer(
        data.disclaimer ||
          "DRAFT RECOMMENDATION: Must be reviewed and approved by a certified therapist or educator."
      );
      toast.success("AI Draft IEP generated successfully!");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to generate AI IEP. Ensure Backend is configured.";
      console.warn("AI generation failed, fallback / error notice:", err);
      toast.error(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Goal Manipulation Helpers
  const handleUpdateGoalField = (
    index: number,
    field: keyof IEPGoal,
    value: IEPGoal[keyof IEPGoal]
  ) => {
    setGoals((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleDeleteGoal = (index: number) => {
    setGoals((prev) => prev.filter((_, i) => i !== index));
    toast.success("Goal removed.");
  };

  const handleAddMilestone = (goalIndex: number) => {
    setGoals((prev) => {
      const updated = [...prev];
      const goal = updated[goalIndex];
      const newMilestone = {
        id: `m_${Date.now()}`,
        description: "New progress milestone",
        completed: false,
        targetDate: "Month 1",
      };
      goal.milestones = [...(goal.milestones || []), newMilestone];
      return updated;
    });
  };

  const handleUpdateMilestone = (
    goalIndex: number,
    milestoneIndex: number,
    field: "description" | "completed" | "targetDate",
    value: string | boolean
  ) => {
    setGoals((prev) => {
      const updated = [...prev];
      const goal = updated[goalIndex];
      if (goal.milestones && goal.milestones[milestoneIndex]) {
        goal.milestones[milestoneIndex] = {
          ...goal.milestones[milestoneIndex],
          [field]: value,
        };
      }
      return updated;
    });
  };

  const handleDeleteMilestone = (goalIndex: number, milestoneIndex: number) => {
    setGoals((prev) => {
      const updated = [...prev];
      const goal = updated[goalIndex];
      if (goal.milestones) {
        goal.milestones = goal.milestones.filter((_, mi) => mi !== milestoneIndex);
      }
      return updated;
    });
  };

  const handleAddManualGoal = () => {
    if (!newGoal.title?.trim()) {
      toast.error("Please enter a goal title.");
      return;
    }

    const created: IEPGoal = {
      id: `manual_${Date.now()}`,
      title: newGoal.title,
      goalArea: newGoal.goalArea || "General",
      status: "In Progress",
      progressPercent: 0,
      targetTimeframe: newGoal.targetTimeframe || "3 Months",
      measurementMethod: newGoal.measurementMethod || "Direct Observation",
      rationale: newGoal.rationale || "Manual clinical entry",
      milestones: [
        {
          id: `m_${Date.now()}_1`,
          description: "Initial baseline step",
          completed: false,
          targetDate: "Month 1",
        },
      ],
    };

    setGoals((prev) => [...prev, created]);
    setNewGoal({
      goalArea: "Communication & Speech",
      title: "",
      targetTimeframe: "3 Months",
      measurementMethod: "Daily observation logs",
      rationale: "",
    });
    setShowManualAdd(false);
    toast.success("New goal added.");
  };

  // Mark a goal as Achieved → moves it to history, triggers "Generate Next Goal" option
  const handleMarkAchieved = async (goalId: string) => {
    if (!selectedStudentId) return;
    try {
      await iepDb.markGoalAchieved(selectedStudentId, goalId);
      const achieved = goals.find((g) => g.id === goalId);
      if (achieved) {
        const achievedGoal: IEPGoal = { ...achieved, status: "Achieved", achievedAt: new Date().toISOString() };
        setAchievedGoals((prev) => [...prev, achievedGoal]);
        setGoals((prev) => prev.filter((g) => g.id !== goalId));
      }
      toast.success("Goal marked as Achieved! You can now generate the next progressive goal.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to mark goal as achieved.");
    }
  };

  // Generate next progressive SMART goal based on the most recently achieved goal
  const handleGenerateNextGoal = async () => {
    if (!selectedStudentId || achievedGoals.length === 0) return;
    setIsGeneratingNextGoal(true);
    try {
      const lastAchieved = achievedGoals[achievedGoals.length - 1];
      const response = await fetch(
        `http://127.0.0.1:8000/ai-insights/iep/${selectedStudentId}/next-goal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ achieved_goal: lastAchieved }),
        }
      );
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server error ${response.status}`);
      }
      const data = await response.json();
      const suggested: IEPGoal = { ...data.goal, status: "In Progress", progressPercent: 0 };
      // Save as pending in Firestore so it persists across sessions
      await iepDb.savePendingAiGoal(selectedStudentId, suggested as unknown as Record<string, unknown>);
      setPendingAiGoal(suggested);
      toast.success("AI next goal generated! Review and accept to add it to the active plan.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate next goal.";
      toast.error(msg);
    } finally {
      setIsGeneratingNextGoal(false);
    }
  };

  // Accept the pending AI goal → move it into active goals[]
  const handleAcceptPendingGoal = async () => {
    if (!selectedStudentId || !pendingAiGoal) return;
    try {
      await iepDb.acceptPendingAiGoal(selectedStudentId, pendingAiGoal as unknown as Record<string, unknown>);
      setGoals((prev) => [...prev, pendingAiGoal]);
      setPendingAiGoal(null);
      toast.success("Goal added to active IEP plan!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to accept goal.");
    }
  };

  // Dismiss the pending AI suggestion
  const handleDismissPendingGoal = async () => {
    if (!selectedStudentId) return;
    try {
      await iepDb.dismissPendingAiGoal(selectedStudentId);
      setPendingAiGoal(null);
      toast("AI suggestion dismissed.");
    } catch (err) {
      console.error(err);
    }
  };

  // Save as Draft
  const handleSaveDraft = async () => {
    if (!selectedStudentId) return;
    setIsSaving(true);
    try {
      await iepDb.saveDraft(
        selectedStudentId,
        {
          goals,
          summary: iepSummary,
          centerId: profile?.centerId || "demo-center-001",
          generatedByAi: Boolean(iepSummary),
        },
        user?.uid,
        profile?.name
      );
      toast.success("Draft IEP saved to Firestore.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save draft.");
    } finally {
      setIsSaving(false);
    }
  };

  // Finalize IEP
  const handleFinalizeIEP = async () => {
    if (!selectedStudentId) return;
    if (goals.length === 0) {
      toast.error("Cannot finalize an IEP with zero goals.");
      return;
    }

    setIsSaving(true);
    try {
      await iepDb.finalize(
        selectedStudentId,
        {
          goals,
          summary: iepSummary,
          centerId: profile?.centerId || "demo-center-001",
          generatedByAi: Boolean(iepSummary),
        },
        user?.uid,
        profile?.name
      );
      toast.success("IEP Finalized & synchronized with student's active Care Plan! 🎯");
    } catch (err) {
      console.error(err);
      toast.error("Failed to finalize IEP.");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Loading IEP Builder profile...</p>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div style={{ padding: "30px", textAlign: "center" }}>
        <ShieldAlert size={48} style={{ color: "var(--danger)", margin: "0 auto 16px" }} />
        <h2 style={{ fontWeight: 800, color: "var(--primary-dark)" }}>Access Restricted</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          Only Therapists, Teachers, and Administrators have permission to access the AI-Assisted IEP Builder.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ padding: "8px 4px 40px", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Banner Header */}
      <div
        className="glass-card"
        style={{
          padding: "24px",
          background: "linear-gradient(135deg, rgba(230, 243, 243, 0.95), rgba(243, 237, 247, 0.95))",
          border: "1px solid rgba(123, 196, 196, 0.3)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "var(--primary)",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BrainCircuit size={24} />
            </div>
            <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "var(--primary-dark)" }}>
              AI-Assisted IEP Builder
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary)" }}>
            Synthesize student clinical profiles, ABC behavioral data, and milestones into actionable SMART IEP goals.
          </p>
        </div>

        {/* Student Dropdown Selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--primary-dark)" }}>
            Select Student:
          </label>
          <select
            className="glass-input"
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            style={{
              padding: "10px 16px",
              fontWeight: 600,
              minWidth: "220px",
              background: "white",
              borderColor: "var(--accent-teal)",
            }}
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.diagnosis || "Special Care"})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Grid: Student Context Summary vs. IEP Editor */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px" }}>
        {/* Left Column: Student Clinical & Behavioral Context */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="glass-card" style={{ padding: "20px" }}>
            <h3
              style={{
                margin: "0 0 16px",
                fontSize: "1.05rem",
                fontWeight: 700,
                color: "var(--primary-dark)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <FileText size={18} style={{ color: "var(--accent-teal)" }} /> Student Background
            </h3>

            {loadingStudentData ? (
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Loading student profile...</p>
            ) : selectedStudent ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.85rem" }}>
                <div>
                  <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Diagnosis: </span>
                  <span style={{ fontWeight: 700, color: "var(--primary-dark)" }}>
                    {selectedStudent.diagnosis || "Not specified"}
                  </span>
                </div>
                <div>
                  <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Date of Birth: </span>
                  <span>{selectedStudent.dob || "N/A"}</span>
                </div>
                <div>
                  <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>IEP Status: </span>
                  <span className="chip chip-info" style={{ marginLeft: "6px" }}>
                    {selectedStudent.iepStatus || "Under Review"}
                  </span>
                </div>
                <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: "10px" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Physical/Sensory Needs: </span>
                  <p style={{ margin: "4px 0 0", color: "var(--text-primary)" }}>
                    {medicalProfile?.specialPhysicalNeeds || "None recorded"}
                  </p>
                </div>
                <div>
                  <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Allergies: </span>
                  <span>{medicalProfile?.allergies?.length ? medicalProfile.allergies.join(", ") : "None reported"}</span>
                </div>
                <div>
                  <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Seizure Protocol: </span>
                  <span>{medicalProfile?.seizureHistory?.hasHistory ? "⚠️ Active Seizure Protocol" : "No history"}</span>
                </div>
              </div>
            ) : (
              <p style={{ color: "var(--text-secondary)" }}>No student selected.</p>
            )}
          </div>

          {/* Behavioral Signals Card */}
          <div className="glass-card" style={{ padding: "20px" }}>
            <h3
              style={{
                margin: "0 0 14px",
                fontSize: "1.05rem",
                fontWeight: 700,
                color: "var(--primary-dark)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Activity size={18} style={{ color: "var(--accent-purple)" }} /> Behavioral Signals (ABC Tracker)
            </h3>
            {abcIncidents.length === 0 ? (
              <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: 0 }}>
                No recent ABC behavioral incidents logged for this student.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {abcIncidents.slice(0, 3).map((inc) => (
                  <div
                    key={inc.id}
                    style={{
                      background: "rgba(255,255,255,0.7)",
                      borderRadius: "8px",
                      padding: "10px",
                      border: "1px solid rgba(0,0,0,0.05)",
                      fontSize: "0.8rem",
                    }}
                  >
                    <div style={{ fontWeight: 700, color: "var(--danger)", marginBottom: "4px" }}>
                      Severity {inc.severity}/5 — {inc.location || "Classroom"}
                    </div>
                    <div><strong>Trigger:</strong> {inc.antecedent?.text || "N/A"}</div>
                    <div><strong>Behavior:</strong> {inc.behavior?.text || "N/A"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AI Generation Controls & Goals Editor */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Action Bar */}
          <div
            className="glass-card"
            style={{
              padding: "18px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontWeight: 800, color: "var(--primary-dark)", fontSize: "1.1rem" }}>
                IEP Goals & Milestones Plan
              </h3>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {goals.length} Goal{goals.length === 1 ? "" : "s"} in this IEP Draft
              </span>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {canEdit ? (
                <>
                  <button
                    className="btn-primary"
                    onClick={handleGenerateIEP}
                    disabled={isGenerating || loadingStudentData}
                    style={{
                      background: "linear-gradient(135deg, var(--accent-purple), var(--primary))",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 20px",
                      fontWeight: 700,
                    }}
                  >
                    <Sparkles size={16} />
                    {isGenerating ? "Synthesizing with AI..." : "Generate IEP with AI"}
                  </button>

                  <button
                    className="btn-ghost"
                    onClick={() => setShowManualAdd(true)}
                    style={{
                      border: "1px solid var(--accent-teal)",
                      color: "var(--primary-dark)",
                      padding: "10px 16px",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Plus size={16} /> Add Manual Goal
                  </button>
                </>
              ) : (
                <span className="chip chip-info" style={{ fontSize: "0.8rem", padding: "6px 14px", fontWeight: 600 }}>
                  👁️ View Only Mode ({profile?.role})
                </span>
              )}
            </div>
          </div>

          {/* Insufficient Data Warning Alert */}
          {insufficientDataMsg && (
            <div
              className="glass-card animate-slide-down"
              style={{
                padding: "16px",
                background: "rgba(254, 243, 199, 0.9)",
                border: "1px solid #f59e0b",
                color: "#92400e",
                display: "flex",
                gap: "12px",
                alignItems: "flex-start",
              }}
            >
              <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div style={{ fontSize: "0.88rem" }}>
                <strong>Insufficient Data Notice:</strong> {insufficientDataMsg}
                <div style={{ marginTop: "6px" }}>
                  You can still manually construct the IEP below using the <strong>Add Manual Goal</strong> button.
                </div>
              </div>
            </div>
          )}

          {/* AI Clinical Disclaimer Box */}
          {disclaimer && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(238, 242, 255, 0.8)",
                border: "1px solid #818cf8",
                borderRadius: "10px",
                fontSize: "0.78rem",
                color: "#3730a3",
                lineHeight: 1.5,
              }}
            >
              <strong>Clinical Advisory:</strong> {disclaimer}
            </div>
          )}

          {/* Manual Add Goal Form */}
          {showManualAdd && (
            <div
              className="glass-card animate-slide-down"
              style={{
                padding: "20px",
                border: "2px solid var(--accent-teal)",
                background: "white",
              }}
            >
              <h4 style={{ margin: "0 0 14px", fontWeight: 700, color: "var(--primary-dark)" }}>
                Add Custom IEP Goal
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                      Goal Area
                    </label>
                    <select
                      className="glass-input"
                      value={newGoal.goalArea}
                      onChange={(e) => setNewGoal({ ...newGoal, goalArea: e.target.value })}
                      style={{ width: "100%", marginTop: "4px" }}
                    >
                      <option>Communication & Speech</option>
                      <option>Fine & Gross Motor Skills</option>
                      <option>Emotional Regulation & Behavior</option>
                      <option>Social Interaction & Play</option>
                      <option>Cognitive & Academic</option>
                      <option>Daily Living & Independence</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                      Target Timeframe
                    </label>
                    <input
                      className="glass-input"
                      value={newGoal.targetTimeframe}
                      onChange={(e) => setNewGoal({ ...newGoal, targetTimeframe: e.target.value })}
                      placeholder="e.g. 3 Months, 6 Months"
                      style={{ width: "100%", marginTop: "4px" }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                    SMART Goal Statement
                  </label>
                  <textarea
                    className="glass-input"
                    rows={2}
                    value={newGoal.title}
                    onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                    placeholder="E.g., Student will use picture cards to request items in 4 out of 5 opportunities..."
                    style={{ width: "100%", marginTop: "4px" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                    Measurement Method
                  </label>
                  <input
                    className="glass-input"
                    value={newGoal.measurementMethod}
                    onChange={(e) => setNewGoal({ ...newGoal, measurementMethod: e.target.value })}
                    placeholder="e.g., Weekly checklist by classroom teacher"
                    style={{ width: "100%", marginTop: "4px" }}
                  />
                </div>

                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
                  <button className="btn-ghost" onClick={() => setShowManualAdd(false)}>
                    Cancel
                  </button>
                  <button className="btn-primary" onClick={handleAddManualGoal}>
                    Add to Plan
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Goals List */}
          {goals.length === 0 && !showManualAdd ? (
            <div className="glass-card" style={{ padding: "60px 20px", textAlign: "center" }}>
              <Target size={48} style={{ color: "var(--text-secondary)", margin: "0 auto 16px" }} />
              <h4 style={{ fontWeight: 700, color: "var(--primary-dark)", margin: "0 0 8px" }}>
                No IEP Goals Configured Yet
              </h4>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", maxWidth: "450px", margin: "0 auto 20px" }}>
                Click <strong>Generate IEP with AI</strong> to analyze the student&apos;s clinical context, or click <strong>Add Manual Goal</strong> to draft custom milestones.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {goals.map((goal, gIdx) => (
                <div
                  key={goal.id || gIdx}
                  className="glass-card"
                  style={{
                    padding: "20px",
                    borderLeft: "4px solid var(--accent-purple)",
                    background: "white",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "12px" }}>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <span className="chip chip-info" style={{ fontWeight: 700 }}>
                        {goal.goalArea || "General Area"}
                      </span>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                        <Clock size={14} /> {goal.targetTimeframe || "3 Months"}
                      </span>
                    </div>

                    {canEdit && (
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <button
                          onClick={() => handleMarkAchieved(goal.id)}
                          style={{
                            background: "none",
                            border: "1px solid var(--success)",
                            borderRadius: "6px",
                            color: "var(--success)",
                            cursor: "pointer",
                            padding: "4px 10px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                          title="Mark this goal as Achieved"
                        >
                          <Trophy size={13} /> Mark Achieved
                        </button>
                        <button
                          onClick={() => handleDeleteGoal(gIdx)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--danger)",
                            cursor: "pointer",
                            padding: "4px",
                          }}
                          title="Remove Goal"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Goal Statement Text (Editable for therapist, read-only for others) */}
                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                      SMART Goal Statement
                    </label>
                    <textarea
                      className="glass-input"
                      rows={2}
                      value={goal.title}
                      readOnly={!canEdit}
                      onChange={(e) => canEdit && handleUpdateGoalField(gIdx, "title", e.target.value)}
                      style={{
                        width: "100%",
                        marginTop: "4px",
                        fontWeight: 600,
                        color: "var(--primary-dark)",
                        fontSize: "0.95rem",
                        backgroundColor: canEdit ? "white" : "rgba(248, 250, 252, 0.6)",
                        cursor: canEdit ? "text" : "default",
                      }}
                    />
                  </div>

                  {/* Measurement & Rationale */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                    <div>
                      <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                        Measurement Method
                      </label>
                      <textarea
                        className="glass-input"
                        rows={2}
                        value={goal.measurementMethod || ""}
                        readOnly={!canEdit}
                        onChange={(e) => canEdit && handleUpdateGoalField(gIdx, "measurementMethod", e.target.value)}
                        placeholder="Observation / Checklist"
                        style={{
                          width: "100%",
                          marginTop: "4px",
                          fontSize: "0.85rem",
                          backgroundColor: canEdit ? "white" : "rgba(248, 250, 252, 0.6)",
                          cursor: canEdit ? "text" : "default",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                        Clinical Rationale
                      </label>
                      <textarea
                        className="glass-input"
                        rows={2}
                        value={goal.rationale || ""}
                        readOnly={!canEdit}
                        onChange={(e) => canEdit && handleUpdateGoalField(gIdx, "rationale", e.target.value)}
                        placeholder="Tied to behavior / needs"
                        style={{
                          width: "100%",
                          marginTop: "4px",
                          fontSize: "0.85rem",
                          backgroundColor: canEdit ? "white" : "rgba(248, 250, 252, 0.6)",
                          cursor: canEdit ? "text" : "default",
                        }}
                      />
                    </div>
                  </div>

                  {/* Progressive Milestones */}
                  <div style={{ background: "rgba(248, 250, 252, 0.8)", padding: "14px", borderRadius: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--primary-dark)" }}>
                        Progressive Milestones
                      </span>
                      {canEdit && (
                        <button
                          onClick={() => handleAddMilestone(gIdx)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--accent-teal)",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <Plus size={14} /> Add Milestone
                        </button>
                      )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {(goal.milestones || []).map((m, mIdx) => (
                        <div
                          key={m.id || mIdx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            background: "white",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: "1px solid rgba(0,0,0,0.06)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={m.completed}
                            disabled={!canEdit}
                            onChange={(e) =>
                              canEdit && handleUpdateMilestone(gIdx, mIdx, "completed", e.target.checked)
                            }
                            style={{ cursor: canEdit ? "pointer" : "default" }}
                          />
                          <input
                            className="glass-input"
                            value={m.description}
                            readOnly={!canEdit}
                            onChange={(e) =>
                              canEdit && handleUpdateMilestone(gIdx, mIdx, "description", e.target.value)
                            }
                            placeholder="Milestone description"
                            style={{ flex: 1, border: "none", background: "transparent", padding: "4px 8px", fontSize: "0.85rem" }}
                          />
                          <input
                            className="glass-input"
                            value={m.targetDate || ""}
                            readOnly={!canEdit}
                            onChange={(e) =>
                              canEdit && handleUpdateMilestone(gIdx, mIdx, "targetDate", e.target.value)
                            }
                            placeholder="Target (e.g. Month 1)"
                            style={{ width: "120px", border: "none", background: "rgba(0,0,0,0.04)", padding: "4px 8px", fontSize: "0.8rem" }}
                          />
                          {canEdit && (
                            <button
                              onClick={() => handleDeleteMilestone(gIdx, mIdx)}
                              style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Generate Next Goal Banner (Therapist only, when at least one goal achieved) ── */}
          {canEdit && achievedGoals.length > 0 && !pendingAiGoal && (
            <div
              className="glass-card"
              style={{
                padding: "20px 24px",
                background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(59,130,246,0.06))",
                border: "1px solid rgba(16,185,129,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontWeight: 800, color: "var(--primary-dark)", fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Trophy size={18} style={{ color: "#10b981" }} />
                  Goal Achieved! Ready for Next Step
                </div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                  The last achieved goal: <strong>&quot;{achievedGoals[achievedGoals.length - 1]?.title}&quot;</strong>
                  <br />Generate the next progressive SMART goal based on this achievement and current student data.
                </div>
              </div>
              <button
                className="btn-primary"
                onClick={handleGenerateNextGoal}
                disabled={isGeneratingNextGoal}
                style={{
                  background: "linear-gradient(135deg, #10b981, #3b82f6)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 20px",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                <Sparkles size={16} />
                {isGeneratingNextGoal ? "Generating..." : "Generate Next Goal with AI"}
              </button>
            </div>
          )}

          {/* ── Pending AI Goal — Awaiting Therapist Review ── */}
          {canEdit && pendingAiGoal && (
            <div
              className="glass-card"
              style={{
                padding: "20px",
                border: "2px dashed #f59e0b",
                background: "rgba(254,243,199,0.5)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 800, color: "#92400e", fontSize: "0.95rem" }}>
                  <Sparkles size={18} style={{ color: "#f59e0b" }} />
                  AI-Suggested Next Goal — Pending Your Review
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    className="btn-ghost"
                    onClick={handleDismissPendingGoal}
                    style={{ fontSize: "0.8rem", padding: "6px 14px", color: "#9ca3af" }}
                  >
                    Dismiss
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleAcceptPendingGoal}
                    style={{ fontSize: "0.85rem", padding: "8px 18px", fontWeight: 700, background: "#10b981", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <CheckCircle size={15} /> Accept & Add to Plan
                  </button>
                </div>
              </div>

              <div style={{ background: "white", borderRadius: "8px", padding: "16px", border: "1px solid rgba(245,158,11,0.2)" }}>
                <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                  <span className="chip chip-info" style={{ fontWeight: 700 }}>{pendingAiGoal.goalArea || "General"}</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={13} /> {pendingAiGoal.targetTimeframe || "3 Months"}
                  </span>
                </div>
                <div style={{ fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.95rem", marginBottom: "10px" }}>
                  {pendingAiGoal.title}
                </div>
                {pendingAiGoal.measurementMethod && (
                  <div style={{ marginBottom: "8px" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Measurement Method</span>
                    <pre style={{ margin: "4px 0 0", fontFamily: "inherit", fontSize: "0.82rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                      {pendingAiGoal.measurementMethod}
                    </pre>
                  </div>
                )}
                {pendingAiGoal.milestones && pendingAiGoal.milestones.length > 0 && (
                  <div>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Milestones</span>
                    <ul style={{ margin: "4px 0 0", paddingLeft: "16px", fontSize: "0.82rem" }}>
                      {pendingAiGoal.milestones.map((m) => (
                        <li key={m.id}>{m.description} — <em>{m.targetDate}</em></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Footer for Saving / Finalizing */}
          {goals.length > 0 && canEdit && (
            <div
              className="glass-card"
              style={{
                padding: "16px 24px",
                display: "flex",
                justifyContent: "flex-end",
                gap: "14px",
                alignItems: "center",
              }}
            >
              <button
                className="btn-ghost"
                onClick={handleSaveDraft}
                disabled={isSaving}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 20px",
                  fontWeight: 600,
                }}
              >
                <Save size={16} /> Save Draft
              </button>

              <button
                className="btn-primary"
                onClick={handleFinalizeIEP}
                disabled={isSaving}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "12px 28px",
                  fontWeight: 700,
                  background: "var(--success)",
                }}
              >
                <CheckCircle size={18} /> Finalize IEP Plan
              </button>
            </div>
          )}

          {/* ── Achieved Goals History ── */}
          {achievedGoals.length > 0 && (
            <div className="glass-card" style={{ padding: "16px 20px" }}>
              <button
                onClick={() => setShowAchievedHistory((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 800,
                  color: "var(--primary-dark)",
                  fontSize: "0.95rem",
                  width: "100%",
                  justifyContent: "space-between",
                  padding: 0,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Trophy size={18} style={{ color: "#10b981" }} />
                  Achieved Goals History ({achievedGoals.length})
                </span>
                {showAchievedHistory ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {showAchievedHistory && (
                <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {achievedGoals.map((ag) => (
                    <div
                      key={ag.id}
                      style={{
                        background: "rgba(16,185,129,0.06)",
                        border: "1px solid rgba(16,185,129,0.2)",
                        borderRadius: "8px",
                        padding: "12px 16px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "12px",
                      }}
                    >
                      <Trophy size={20} style={{ color: "#10b981", flexShrink: 0, marginTop: "2px" }} />
                      <div>
                        <div style={{ fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.9rem" }}>{ag.title}</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                          {ag.goalArea} &nbsp;·&nbsp; Achieved on {ag.achievedAt ? new Date(ag.achievedAt).toLocaleDateString() : "—"}
                        </div>
                      </div>
                      <span className="chip" style={{ marginLeft: "auto", background: "rgba(16,185,129,0.15)", color: "#065f46", fontWeight: 700, fontSize: "0.72rem", flexShrink: 0 }}>
                        ✅ Achieved
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
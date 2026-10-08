// ─── Shared TypeScript types for Special Care 360 ────────────────────────────

export type Role = "admin" | "teacher" | "therapist" | "parent";
export type Status = "active" | "resolved" | "pending" | "approved";

// ─── User ──────────────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: Role;
  centerId: string;
  status: "pending" | "approved" | "disabled";
  photoUrl?: string;
}

// ─── Student ───────────────────────────────────────────────────────────────

export interface Student {
  id: string;
  name: string;
  dob: string;
  diagnosis: string;
  centerId: string;
  teacherId?: string;
  therapistIds: string[];
  enrollmentDate: string;
  iepStatus: "Active" | "Under Review" | "Completed";
  photoUrl?: string;
  parentId?: string;
}

export interface MedicalProfile {
  allergies: string[];
  seizureHistory: {
    hasHistory: boolean;
    frequency?: string;
    lastOccurrence?: string;
    protocol?: string;
  };
  medications: Medication[];
  emergencyContact: {
    name: string;
    relation: string;
    phone: string;
  };
  bloodType: string;
  specialPhysicalNeeds: string;
}

export interface Medication {
  id?: string;
  name: string;
  dosage: string;
  frequency: string;
  time: string;
  times?: string[];
  administeredBy: string;
}

export interface IEPGoal {
  id: string;
  title: string;
  status: "In Progress" | "Mastered" | "Regressed" | "Achieved";
  progressPercent: number;
  goalArea?: string;
  targetTimeframe?: string;
  measurementMethod?: string;
  rationale?: string;
  achievedAt?: string;           // ISO timestamp set when therapist marks goal as Achieved
  milestones?: {
    id: string;
    description: string;
    completed: boolean;
    targetDate?: string;
  }[];
}

export interface IEPRecord {
  id: string;
  studentId: string;
  centerId: string;
  status: "draft" | "finalized";
  goals: IEPGoal[];
  generatedByAi: boolean;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
  authorUid?: string;
  authorName?: string;
  disclaimer?: string;
}

export interface CarePlan {
  version?: number;
  goals: IEPGoal[];
  achievedGoals?: IEPGoal[];     // History: goals that were marked Achieved
  pendingAiGoal?: IEPGoal | null; // AI-suggested next goal awaiting therapist review
  activeIepId?: string;
  iepSummary?: string;
  iepStatus?: string;
  lastAiReport?: {
    report: string;
    timestamp: string;
  };
}

// ─── Daily Care ────────────────────────────────────────────────────────────

export type MealStatus = "fully" | "partially" | "refused";
export type MoodType = "happy" | "neutral" | "sad" | "agitated" | "tired";
export type ActivityLevel = "Active" | "Moderate" | "Low" | "Bed Rest";

export interface MealEntry {
  ate: MealStatus;
  notes: string;
}

export interface MoodEntry {
  slot: string;
  mood: MoodType;
}

export interface DailyCareJournal {
  studentId: string;
  date: string;
  meals: {
    breakfast: MealEntry;
    lunch: MealEntry;
    snack: MealEntry;
  };
  hygiene: {
    teethBrushed: boolean;
    handsWashed: boolean;
    diaperAssisted: boolean;
    hairCombed: boolean;
  };
  moodTimeline: MoodEntry[];
  physicalActivity: ActivityLevel;
  activityNotes: string;
  incidents: string;
  teacherNotes: string;
  submittedBy: string;
  submittedAt?: string;
}

// ─── ABC Tracker ───────────────────────────────────────────────────────────

export interface ABCIncident {
  id: string;
  studentId: string;
  centerId: string;
  loggedBy: string;
  timestamp: string;
  antecedent: { text: string; tags: string[] };
  behavior: { text: string; tags: string[] };
  consequence: { text: string; tags: string[] };
  severity: number;
  durationMinutes: number;
  location: string;
}

export interface PatternAnalysis {
  topAntecedents: { tag: string; count: number }[];
  topBehaviors: { tag: string; count: number }[];
  topConsequences: { tag: string; count: number }[];
  peakHours: { hour: number; count: number }[];
  avgSeverity: number;
  totalIncidents: number;
  insights: string[];
}

export interface HeatmapCell {
  day: string;
  severity: number;
  count: number;
}

// ─── Panic Alert ───────────────────────────────────────────────────────────

export interface PanicAlert {
  id: string;
  studentId: string;
  centerId: string;
  reportedBy: { uid: string; name: string };
  emergencyType: string;
  description: string;
  location: string;
  timestamp: string;
  status: "active" | "resolved";
  resolvedAt: string | null;
  resolvedBy: string | null;
}

// ─── Dynamic Therapy Timeline ──────────────────────────────────────────────

export type TherapySessionStatus =
  | "Scheduled"
  | "Completed"
  | "Cancelled"
  | "Rescheduled"
  | "No Show"
  | "scheduled"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "no-show";

export type TherapyType =
  | "Speech Therapy"
  | "Physiotherapy"
  | "Occupational Therapy"
  | "Behavioral Therapy"
  | "Special Education"
  | "Psychology Session"
  | "Other";

export type SessionType =
  | "In-Person"
  | "Tele-Therapy"
  | "Home Session"
  | "in-person"
  | "tele-therapy"
  | "home-session"
  | "group";

export interface TherapySession {
  id: string;
  centerId: string;
  studentId: string;
  studentName: string;
  therapistId: string;
  therapistName: string;
  therapyType: TherapyType | string;
  date: string;              // YYYY-MM-DD
  startTime: string;         // HH:mm (24h)
  endTime: string;           // HH:mm (24h)
  startDateTime: string;     // ISO 8601
  endDateTime: string;       // ISO 8601
  location: string;
  sessionType: SessionType | string;
  notes?: string;
  status: TherapySessionStatus;
  parentId?: string | null;
  teletherapySessionId?: string | null;
  repeatRule?: string;       // e.g. "none" | "daily" | "weekly" | "biweekly"
  title?: string;
  durationMinutes?: number;
  scheduledAt?: string;      // Backwards compatibility alias for startDateTime
  goals?: string[];
  createdBy: string;
  createdAt?: string | unknown;
  updatedAt?: string | unknown;
}

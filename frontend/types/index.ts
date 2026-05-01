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
  status: "pending" | "approved";
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
  name: string;
  dosage: string;
  frequency: string;
  time: string;
  administeredBy: string;
}

export interface IEPGoal {
  id: string;
  title: string;
  status: "In Progress" | "Mastered" | "Regressed";
  progressPercent: number;
}

export interface CarePlan {
  goals: IEPGoal[];
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

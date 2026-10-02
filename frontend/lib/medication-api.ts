import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { Medication } from "@/types";
import { StudentDoc } from "./firestore-api";

export const CARE_TIME_ZONE = "Asia/Karachi";

export function currentCareDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CARE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export type MedicationDoseStatus =
  | "pending"
  | "administered"
  | "not_administered"
  | "missed";

export interface MedicationDose {
  id: string;
  studentId: string;
  studentName: string;
  centerId: string;
  parentId: string | null;
  medicationId: string;
  medicationName: string;
  dosage: string;
  date: string;
  scheduledTime: string;
  status: MedicationDoseStatus;
  administeredAt?: unknown;
  administeredBy?: string;
  administeredByName?: string;
  notes?: string;
  alertSent?: boolean;
}

export interface ScheduledMedicationDose {
  id: string;
  medicationId: string;
  medication: Medication;
  time: string;
  date: string;
  status: MedicationDoseStatus;
  administeredAt?: unknown;
  administeredByName?: string;
  notes?: string;
}

function parseTime(value: string): string | null {
  const normalized = value.trim();
  const twentyFourHour = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(normalized);
  if (twentyFourHour) return normalized;

  const twelveHour = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i.exec(normalized);
  if (!twelveHour) return null;
  let hour = Number(twelveHour[1]) % 12;
  if (twelveHour[3].toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${twelveHour[2]}`;
}

export function medicationTimes(medication: Medication): string[] {
  const legacyTime = typeof medication.time === "string" ? medication.time : "";
  const configured = medication.times?.length
    ? medication.times
    : legacyTime.split(",");
  return [...new Set(configured.map(parseTime).filter((time): time is string => time !== null))]
    .sort();
}

export function medicationDoseId(
  studentId: string,
  medicationId: string,
  date: string,
  time: string
): string {
  const safeMedicationId = medicationId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${studentId}__${safeMedicationId}__${date}__${time.replace(":", "")}`;
}

export function medicationSchedule(
  student: StudentDoc,
  medications: Medication[],
  date: string
): Array<Omit<ScheduledMedicationDose, "status">> {
  return medications.flatMap((medication, index) => {
    const medicationId = medication.id || `legacy-${index}`;
    return medicationTimes(medication).map((time) => ({
      id: medicationDoseId(student.id, medicationId, date, time),
      medicationId,
      medication,
      time,
      date,
    }));
  });
}

export const medicationDb = {
  loadDay: async (
    student: StudentDoc,
    medications: Medication[],
    date: string
  ): Promise<ScheduledMedicationDose[]> => {
    const schedule = medicationSchedule(student, medications, date);
    return Promise.all(schedule.map(async (dose) => {
      const snap = await getDoc(
        doc(db, "students", student.id, "medicationAdministrations", dose.id)
      );
      const saved = snap.exists() ? snap.data() as MedicationDose : null;
      return {
        ...dose,
        status: saved?.status ?? "pending",
        administeredAt: saved?.administeredAt,
        administeredByName: saved?.administeredByName,
        notes: saved?.notes,
      };
    }));
  },

  record: async (
    student: StudentDoc,
    dose: ScheduledMedicationDose,
    input: {
      status: "administered" | "not_administered";
      userId: string;
      userName: string;
      notes: string;
    }
  ): Promise<void> => {
    const ref = doc(db, "students", student.id, "medicationAdministrations", dose.id);
    const now = new Date();
    const update = {
      status: input.status,
      administeredAt: input.status === "administered" ? now : null,
      administeredBy: input.userId,
      administeredByName: input.userName,
      notes: input.notes.trim(),
      updatedAt: serverTimestamp(),
    };

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (snap.exists() && snap.data().status === "administered") {
        throw new Error("This dose has already been recorded as administered.");
      }
      const correction = snap.exists() && snap.data().status === "missed"
        ? { correctedFrom: "missed", correctedAt: now }
        : {};
      if (snap.exists()) {
        transaction.update(ref, { ...update, ...correction });
        return;
      }
      transaction.set(ref, {
        studentId: student.id,
        studentName: student.name,
        centerId: student.centerId,
        parentId: student.parentId || null,
        medicationId: dose.medicationId,
        medicationName: dose.medication.name,
        dosage: dose.medication.dosage,
        date: dose.date,
        scheduledTime: dose.time,
        ...update,
        createdAt: serverTimestamp(),
      });
    });
  },
};

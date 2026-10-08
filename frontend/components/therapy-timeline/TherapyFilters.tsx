"use client";

import React from "react";
import { Search, X, Filter } from "lucide-react";
import { TherapyType, TherapySessionStatus } from "@/types";
import { StudentDoc } from "@/lib/firestore-api";

export const THERAPY_TYPES: TherapyType[] = [
  "Speech Therapy",
  "Physiotherapy",
  "Occupational Therapy",
  "Behavioral Therapy",
  "Special Education",
  "Psychology Session",
  "Other",
];

export const STATUS_OPTIONS: TherapySessionStatus[] = [
  "Scheduled",
  "Completed",
  "Cancelled",
  "Rescheduled",
  "No Show",
];

interface StaffOption {
  id: string;
  name: string;
  role: string;
}

interface Props {
  search: string;
  onSearchChange: (val: string) => void;
  selectedStudent: string;
  onStudentChange: (val: string) => void;
  selectedTherapist: string;
  onTherapistChange: (val: string) => void;
  selectedTherapyType: string;
  onTherapyTypeChange: (val: string) => void;
  selectedStatus: string;
  onStatusChange: (val: string) => void;
  students: StudentDoc[];
  staffList: StaffOption[];
  isParent: boolean;
  onClear: () => void;
}

export default function TherapyFilters({
  search,
  onSearchChange,
  selectedStudent,
  onStudentChange,
  selectedTherapist,
  onTherapistChange,
  selectedTherapyType,
  onTherapyTypeChange,
  selectedStatus,
  onStatusChange,
  students,
  staffList,
  isParent,
  onClear,
}: Props) {
  const hasActiveFilters = Boolean(
    search || selectedStudent || selectedTherapist || selectedTherapyType || selectedStatus
  );

  return (
    <div
      className="glass-card animate-fade-in"
      style={{
        padding: "16px 20px",
        marginBottom: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "var(--primary-dark)", fontSize: "0.92rem" }}>
          <Filter size={18} style={{ color: "var(--accent-teal)" }} />
          Filter Therapy Schedule
        </div>
        {hasActiveFilters && (
          <button
            onClick={onClear}
            className="btn-ghost"
            style={{ padding: "4px 10px", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <X size={14} /> Clear Filters
          </button>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
          alignItems: "end",
        }}
      >
        {/* Search input */}
        <div>
          <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
            Search Keyword
          </label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search by student, therapist, notes..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="glass-input"
              style={{ width: "100%", paddingLeft: "32px", fontSize: "0.85rem" }}
            />
            <Search
              size={15}
              style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }}
            />
          </div>
        </div>

        {/* Student Filter (Non-parents) */}
        {!isParent && (
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
              Student
            </label>
            <select
              value={selectedStudent}
              onChange={(e) => onStudentChange(e.target.value)}
              className="glass-input"
              style={{ width: "100%", fontSize: "0.85rem" }}
            >
              <option value="">All Students</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Therapist Filter */}
        {!isParent && staffList.length > 0 && (
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
              Therapist
            </label>
            <select
              value={selectedTherapist}
              onChange={(e) => onTherapistChange(e.target.value)}
              className="glass-input"
              style={{ width: "100%", fontSize: "0.85rem" }}
            >
              <option value="">All Therapists</option>
              {staffList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Therapy Type Filter */}
        <div>
          <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
            Therapy Type
          </label>
          <select
            value={selectedTherapyType}
            onChange={(e) => onTherapyTypeChange(e.target.value)}
            className="glass-input"
            style={{ width: "100%", fontSize: "0.85rem" }}
          >
            <option value="">All Therapy Types</option>
            {THERAPY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
            Session Status
          </label>
          <select
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className="glass-input"
            style={{ width: "100%", fontSize: "0.85rem" }}
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

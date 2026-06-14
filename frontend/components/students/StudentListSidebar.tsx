"use client";
import { Student } from "@/types";
import { Search, User } from "lucide-react";

const DIAGNOSIS_COLORS: Record<string, string> = {
  ASD: "chip-info",
  ADHD: "chip-purple",
  "Down Syndrome": "chip-warning",
  "Cerebral Palsy": "chip-danger",
  Default: "chip-gray",
};

interface Props {
  students: Student[];
  selectedId: string | null;
  search: string;
  onSearch: (v: string) => void;
  onSelect: (id: string) => void;
  loading: boolean;
}

export default function StudentListSidebar({ students, selectedId, search, onSearch, onSelect, loading }: Props) {
  const filtered = students.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.diagnosis.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{
      width: "280px", flexShrink: 0, height: "calc(100vh - 80px)",
      overflowY: "auto", paddingRight: "4px",
    }}>
      {/* Search */}
      <div style={{ position: "relative", marginBottom: "16px" }}>
        <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", display: "inline-flex", color: "var(--text-secondary)" }}>
          <Search size={16} />
        </span>
        <input
          id="student-search"
          type="text"
          placeholder="Search students…"
          className="glass-input"
          style={{ paddingLeft: "36px" }}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {/* Student count */}
      <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "10px", fontWeight: 600 }}>
        {filtered.length} student{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: "72px", borderRadius: "12px" }} />
          ))
        ) : filtered.length === 0 ? (
          <div className="glass-card" style={{ padding: "24px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", color: "var(--text-secondary)", marginBottom: "8px" }}>
              <User size={32} />
            </div>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.85rem" }}>No students found</p>
          </div>
        ) : (
          filtered.map((student) => {
            const isSelected = student.id === selectedId;
            const diagClass = DIAGNOSIS_COLORS[student.diagnosis] || DIAGNOSIS_COLORS.Default;
            return (
              <div
                key={student.id}
                onClick={() => onSelect(student.id)}
                style={{
                  padding: "14px", borderRadius: "12px", cursor: "pointer",
                  background: isSelected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.7)",
                  border: isSelected ? "2px solid var(--accent-teal)" : "2px solid transparent",
                  boxShadow: isSelected ? "0 4px 16px rgba(123,196,196,0.25)" : "0 2px 8px rgba(0,0,0,0.05)",
                  transition: "all 0.2s ease",
                  display: "flex", alignItems: "center", gap: "12px",
                }}
              >
                <div style={{
                  width: "44px", height: "44px", borderRadius: "50%", flexShrink: 0,
                  background: isSelected ? "var(--accent-teal)" : "rgba(123,196,196,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "20px", fontWeight: 700,
                  color: isSelected ? "white" : "var(--primary-dark)",
                }}>
                  {student.photoUrl
                    ? <img src={student.photoUrl} alt={student.name} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                    : student.name.charAt(0)
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {student.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                    <span className={`chip ${diagClass}`} style={{ padding: "1px 8px", fontSize: "0.7rem" }}>
                      {student.diagnosis}
                    </span>
                    <span className={`chip ${student.iepStatus === "Active" ? "chip-success" : student.iepStatus === "Under Review" ? "chip-warning" : "chip-gray"}`}
                      style={{ padding: "1px 8px", fontSize: "0.68rem" }}>
                      {student.iepStatus}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

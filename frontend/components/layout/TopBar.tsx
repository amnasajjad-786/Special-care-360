"use client";

import { useAuth } from "@/lib/auth-context";
import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard/students":     "Students",
  "/dashboard/daily-care":   "Daily Care Journal",
  "/dashboard/abc-tracker":  "ABC Behavioral Tracker",
  "/dashboard/admin/alerts": "Alert Center",
  "/dashboard/panic":        "Panic Alert",
};

export default function TopBar() {
  const { profile } = useAuth();
  const pathname = usePathname();

  const pageTitle = Object.entries(PAGE_TITLES).find(([key]) =>
    pathname.startsWith(key)
  )?.[1] || "Dashboard";

  const roleColors: Record<string, string> = {
    admin: "#e8a598", teacher: "#7bc4c4", therapist: "#b8a8d4", parent: "#9b8ec4",
  };
  const roleColor = roleColors[profile?.role || "admin"] || "#7bc4c4";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div style={{
      padding: "16px 24px",
      display: "flex",
      alignItems: "center",
      gap: "16px",
      borderBottom: "1px solid rgba(255,255,255,0.4)",
      background: "rgba(255,255,255,0.35)",
      backdropFilter: "blur(12px)",
      position: "sticky",
      top: 0,
      zIndex: 40,
    }}>
      {/* Page title */}
      <div style={{ flex: 1 }}>
        <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--primary-dark)" }}>
          {pageTitle}
        </h1>
        <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-secondary)" }}>{today}</p>
      </div>

      {/* Search bar */}
      <div style={{ position: "relative", maxWidth: "260px", width: "100%" }}>
        <span style={{
          position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
          fontSize: "1rem", pointerEvents: "none",
        }}>🔍</span>
        <input
          id="topbar-search"
          type="text"
          placeholder="Search…"
          className="glass-input"
          style={{ paddingLeft: "36px", fontSize: "0.85rem", paddingTop: "8px", paddingBottom: "8px" }}
        />
      </div>

      {/* Notification bell */}
      <button
        id="topbar-notifications"
        style={{
          background: "rgba(255,255,255,0.7)",
          border: "1px solid rgba(255,255,255,0.5)",
          borderRadius: "10px",
          width: "40px", height: "40px",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", fontSize: "1.1rem",
          transition: "all 0.2s ease",
          position: "relative",
        }}
        title="Notifications"
      >
        🔔
        <span style={{
          position: "absolute", top: "4px", right: "4px",
          width: "9px", height: "9px", borderRadius: "50%",
          background: "var(--danger)",
          border: "2px solid white",
        }} />
      </button>

      {/* User chip */}
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "6px 12px 6px 6px",
        background: "rgba(255,255,255,0.7)",
        border: "1px solid rgba(255,255,255,0.5)",
        borderRadius: "999px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}>
        <div style={{
          width: "30px", height: "30px", borderRadius: "50%",
          background: roleColor, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "13px", fontWeight: 700, color: "var(--primary-dark)",
        }}>
          {profile?.name?.charAt(0).toUpperCase() || "U"}
        </div>
        <div>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.2 }}>
            {profile?.name?.split(" ")[0] || "User"}
          </div>
          <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", textTransform: "capitalize" }}>
            {profile?.role}
          </div>
        </div>
      </div>
    </div>
  );
}

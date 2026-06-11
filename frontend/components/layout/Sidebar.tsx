"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import toast from "react-hot-toast";

interface NavItem {
  href: string;
  icon: string;
  label: string;
  roles: string[];
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard/students",    icon: "👤", label: "Students",    roles: ["admin","teacher","therapist","parent"] },
  { href: "/dashboard/daily-care",  icon: "📓", label: "Daily Care",  roles: ["admin","teacher","parent"] },
  { href: "/dashboard/abc-tracker", icon: "🧠", label: "ABC Tracker", roles: ["admin","teacher","therapist","parent"] },
  { href: "/dashboard/admin/alerts",icon: "🚨", label: "Alerts",      roles: ["admin"] },
<<<<<<< HEAD
  { href: "/dashboard/admin",       icon: "🔑", label: "Admin Panel", roles: ["admin"] },
=======
>>>>>>> 9ba631039d4105b4708d5fc7f92f0bebec531811
  { href: "/dashboard/panic",       icon: "⚠️", label: "Panic Alert", roles: ["teacher","therapist"] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, logout } = useAuth();
  const [alertCount, setAlertCount] = useState(0);

  // ─── Real-time active alert count (admin only) ───────────────────────────
  useEffect(() => {
    if (profile?.role !== "admin") return;
    try {
      const q = query(
        collection(db, "panicAlerts"),
        where("status", "==", "active"),
        where("centerId", "==", profile.centerId || "demo-center-001")
      );
      const unsub = onSnapshot(q, (snap) => {
        setAlertCount(snap.size);
      }, () => {
        // Firebase not configured — use mock
        setAlertCount(1);
      });
      return unsub;
    } catch {
      setAlertCount(1);
    }
  }, [profile]);

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out successfully");
    router.push("/");
  };

  const visibleNav = NAV_ITEMS.filter(
    (item) => !profile?.role || item.roles.includes(profile.role)
  );

  const roleColors: Record<string, string> = {
    admin: "#e8a598",
    teacher: "#7bc4c4",
    therapist: "#b8a8d4",
    parent: "#9b8ec4",
  };

  const roleColor = roleColors[profile?.role || "admin"] || "#7bc4c4";

  return (
    <nav className="sidebar">
      {/* ── Logo ── */}
      <div style={{ padding: "24px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
            border: "2px solid rgba(255,255,255,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "22px", flexShrink: 0,
          }}>🦋</div>
          <div>
            <div style={{ color: "white", fontWeight: 800, fontSize: "0.95rem", lineHeight: 1.2 }}>
              Special Care 360
            </div>
            <div style={{ fontSize: "0.72rem", color: "rgba(226,232,240,0.55)", marginTop: "2px" }}>
              Special Education Platform
            </div>
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", margin: "0 16px 12px" }} />

      {/* ── Nav Items ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {visibleNav.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const badgeCount = item.label === "Alerts" ? alertCount : 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-nav-item ${isActive ? "active" : ""}`}
            >
              <span style={{ fontSize: "1.1rem", minWidth: "22px" }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {badgeCount > 0 && (
                <span style={{
                  background: "var(--danger)", color: "white",
                  borderRadius: "999px", padding: "2px 7px",
                  fontSize: "0.72rem", fontWeight: 700,
                  animation: "pulse-ring 2s infinite",
                }}>
                  {badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* ── Divider ── */}
      <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", margin: "0 16px 12px" }} />

      {/* ── User Footer ── */}
      <div style={{ padding: "12px 16px 20px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "10px 12px", borderRadius: "12px",
          background: "rgba(255,255,255,0.06)",
          marginBottom: "10px",
        }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "50%",
            background: roleColor,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "14px", fontWeight: 700, color: "var(--primary-dark)",
            flexShrink: 0,
          }}>
            {profile?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{ color: "white", fontWeight: 600, fontSize: "0.85rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {profile?.name || "User"}
            </div>
            <div style={{
              fontSize: "0.72rem", color: roleColor,
              fontWeight: 600, textTransform: "capitalize",
            }}>
              {profile?.role}
            </div>
          </div>
        </div>

        <button
          id="sidebar-logout"
          onClick={handleLogout}
          style={{
            width: "100%", padding: "9px", borderRadius: "10px",
            background: "rgba(229,62,62,0.12)", border: "1px solid rgba(229,62,62,0.25)",
            color: "#fc8181", fontSize: "0.85rem", fontWeight: 600,
            cursor: "pointer", transition: "all 0.2s ease",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = "rgba(229,62,62,0.22)"; }}
          onMouseOut={(e) => { e.currentTarget.style.background = "rgba(229,62,62,0.12)"; }}
        >
          🚪 Logout
        </button>
      </div>
    </nav>
  );
}

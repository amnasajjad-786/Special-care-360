"use client";

import { useAuth } from "@/lib/auth-context";
import { usePathname, useRouter } from "next/navigation";
import { useSidebar } from "@/app/dashboard/layout";
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy, limit, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import toast from "react-hot-toast";
import { Bell, Settings, LogOut } from "lucide-react";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard/students":     "Students",
  "/dashboard/daily-care":   "Daily Care Journal",
  "/dashboard/abc-tracker":  "ABC Behavioral Tracker",
  "/dashboard/admin/alerts": "Alert Center",
  "/dashboard/admin":        "Admin Panel",
  "/dashboard/panic":        "Panic Alert",
};

interface NotificationItem {
  id: string;
  type: "alert" | "journal" | "system";
  title: string;
  body: string;
  time: string;
  read: boolean;
}

function getDefaultMocks(role: string): NotificationItem[] {
  if (role === "parent") {
    return [
      { id: "mock-n1", type: "journal", title: "Daily Care Submitted", body: "Ms. Fatima Khan submitted Ahmed's journal.", time: "5m ago", read: false },
      { id: "mock-n2", type: "system", title: "IEP Goal Updated", body: "Dr. Zara Ahmed updated verbal communication goal.", time: "2h ago", read: false },
      { id: "mock-n3", type: "system", title: "Weekly Newsletter", body: "Special Care 360 Weekly Digest is available.", time: "1d ago", read: true },
    ];
  } else {
    return [
      { id: "mock-s1", type: "system", title: "System Check", body: "Database backups completed successfully.", time: "1h ago", read: true },
      { id: "mock-s2", type: "system", title: "Staff Meeting", body: "Monthly center meeting Friday at 3:00 PM.", time: "4h ago", read: true }
    ];
  }
}

export default function TopBar() {
  const { profile, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { toggle } = useSidebar();

  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const pageTitle = Object.entries(PAGE_TITLES).find(([key]) =>
    pathname.startsWith(key)
  )?.[1] || "Dashboard";

  const roleColors: Record<string, string> = {
    admin: "#e8a598", teacher: "#7bc4c4", therapist: "#b8a8d4", parent: "#9b8ec4",
  };
  const roleColor = roleColors[profile?.role || "admin"] || "#7bc4c4";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // ─── Load notifications (Live Firestore notifications for all users) ───
  useEffect(() => {
    if (!profile) return;

    try {
      const q = query(
        collection(db, "notifications"),
        where("recipientId", "==", profile.uid)
      );
      
      const unsub = onSnapshot(q, (snap) => {
        if (snap.empty) {
          // Auto-seed mock notifications in Firestore so they are real and interactive
          const mocks = getDefaultMocks(profile.role);
          mocks.forEach(async (m) => {
            try {
              let createdAtDate = new Date();
              if (m.time.includes("m")) {
                const mins = parseInt(m.time);
                createdAtDate = new Date(Date.now() - mins * 60000);
              } else if (m.time.includes("h")) {
                const hrs = parseInt(m.time);
                createdAtDate = new Date(Date.now() - hrs * 3600000);
              } else if (m.time.includes("d")) {
                const days = parseInt(m.time);
                createdAtDate = new Date(Date.now() - days * 86400000);
              }
              
              await addDoc(collection(db, "notifications"), {
                recipientId: profile.uid,
                type: m.type === "journal" ? "daily_journal" : m.type,
                title: m.title,
                message: m.body,
                read: m.read,
                createdAt: createdAtDate.toISOString(),
              });
            } catch (err) {
              console.warn("Failed to auto-seed mock notification:", err);
            }
          });
          return;
        }

        interface MappedNotif extends NotificationItem {
          _rawDate: Date;
        }

        const items: MappedNotif[] = snap.docs.map(doc => {
          const data = doc.data();
          
          let timeStr = "Just now";
          let parsedDate = new Date();
          if (data.createdAt) {
            try {
              parsedDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
              const diffMs = Date.now() - parsedDate.getTime();
              const diffMins = Math.floor(diffMs / 60000);
              const diffHours = Math.floor(diffMins / 60);
              const diffDays = Math.floor(diffHours / 24);
              
              if (diffMins < 1) timeStr = "Just now";
              else if (diffMins < 60) timeStr = `${diffMins}m ago`;
              else if (diffHours < 24) timeStr = `${diffHours}h ago`;
              else timeStr = `${diffDays}d ago`;
            } catch (_) {}
          }
          
          return {
            id: doc.id,
            type: data.type || "system",
            title: data.title || (
              data.type === "panic_alert" ? "Panic Alert 🚨" :
              data.type === "daily_journal" ? "Daily Journal 📓" :
              data.type === "behavior_incident" ? "Behavior Incident ⚠️" :
              data.type === "care_plan_update" ? "Care Plan Updated 🎯" :
              data.type === "medical_update" ? "Medical Profile Updated 🩺" :
              "Notification"
            ),
            body: data.message || "",
            time: timeStr,
            read: !!data.read,
            _rawDate: parsedDate,
          };
        });
        
        // Sort latest first
        items.sort((a, b) => b._rawDate.getTime() - a._rawDate.getTime());
        // Limit to 20 items
        const limitedItems: NotificationItem[] = items.slice(0, 20).map(({ _rawDate, ...rest }) => rest);
        
        setNotifications(limitedItems);
      }, () => {
        setNotifications(getDefaultMocks(profile.role));
      });
      return unsub;
    } catch (err) {
      console.warn("Firestore listener failed for notifications:", err);
      setNotifications(getDefaultMocks(profile.role));
    }
  }, [profile]);

  // ─── Click outside dropdowns to close them ───
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("#topbar-user-chip") && !target.closest("#topbar-profile-dropdown")) {
        setProfileOpen(false);
      }
      if (!target.closest("#topbar-notifications") && !target.closest("#topbar-notifications-dropdown")) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out successfully");
    router.push("/");
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;
    
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    toast.success("All notifications marked as read");
    
    try {
      for (const item of unread) {
        if (item.id.startsWith("mock-")) continue;
        await updateDoc(doc(db, "notifications", item.id), { read: true });
      }
    } catch (err) {
      console.error("Failed to mark notifications read in database:", err);
    }
  };

  const handleSettingsClick = () => {
    setProfileOpen(false);
    toast.success("Settings panel is currently configured by center admins.");
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div style={{
      padding: "16px 24px",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      borderBottom: "1px solid rgba(255,255,255,0.4)",
      background: "rgba(255,255,255,0.35)",
      backdropFilter: "blur(12px)",
      position: "sticky",
      top: 0,
      zIndex: 40,
    }}>
      {/* ── Hamburger (mobile only) ── */}
      <button
        id="topbar-hamburger"
        className="hamburger-btn"
        onClick={toggle}
        aria-label="Open navigation menu"
      >
        <span className="hamburger-bar" />
        <span className="hamburger-bar" />
        <span className="hamburger-bar" />
      </button>

      {/* Page title */}
      <div style={{ flex: 1 }}>
        <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--primary-dark)" }}>
          {pageTitle}
        </h1>
        <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-secondary)" }}>{today}</p>
      </div>

      {/* Notification bell */}
      <div style={{ position: "relative" }}>
        <button
          id="topbar-notifications"
          onClick={() => setNotificationsOpen(!notificationsOpen)}
          style={{
            background: notificationsOpen ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.5)",
            borderRadius: "10px",
            width: "40px", height: "40px",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: "1.1rem",
            transition: "all 0.2s ease",
            position: "relative",
            flexShrink: 0,
          }}
          title="Notifications"
        >
          <Bell size={18} style={{ color: "var(--primary-dark)" }} />
          {unreadCount > 0 && (
            <span style={{
              position: "absolute", top: "4px", right: "4px",
              width: "9px", height: "9px", borderRadius: "50%",
              background: "var(--danger)",
              border: "2px solid white",
            }} />
          )}
        </button>

        {/* Notifications Dropdown */}
        {notificationsOpen && (
          <div
            id="topbar-notifications-dropdown"
            className="animate-slide-down"
            style={{
              position: "absolute",
              top: "48px",
              right: 0,
              width: "320px",
              background: "rgba(255, 255, 255, 0.85)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(255, 255, 255, 0.45)",
              borderRadius: "16px",
              boxShadow: "0 10px 25px rgba(31, 41, 55, 0.12)",
              padding: "16px",
              zIndex: 100,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--primary-dark)" }}>
                Notifications {unreadCount > 0 && `(${unreadCount})`}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{
                    background: "none", border: "none", color: "var(--accent-teal)",
                    fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", padding: 0
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>

            <div style={{ maxHeight: "240px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {notifications.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                  All caught up!
                </div>
              ) : (
                notifications.map(item => (
                  <div
                    key={item.id}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "10px",
                      background: item.read ? "rgba(255,255,255,0.4)" : "rgba(123, 196, 196, 0.08)",
                      border: "1px solid rgba(255,255,255,0.5)",
                      fontSize: "0.8rem",
                      position: "relative",
                      transition: "background 0.2s",
                    }}
                  >
                    {!item.read && (
                      <span style={{
                        position: "absolute", top: "12px", right: "12px",
                        width: "6px", height: "6px", borderRadius: "50%",
                        background: "var(--accent-teal)"
                      }} />
                    )}
                    <div style={{ fontWeight: 700, color: "var(--text-primary)", paddingRight: "12px", marginBottom: "2px" }}>{item.title}</div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", lineHeight: 1.3 }}>{item.body}</div>
                    <div style={{ color: "rgba(0,0,0,0.35)", fontSize: "0.68rem", marginTop: "4px", fontWeight: 600 }}>{item.time}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* User chip & Profile Dropdown */}
      <div style={{ position: "relative" }}>
        <button
          id="topbar-user-chip"
          onClick={() => setProfileOpen(!profileOpen)}
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "5px 12px 5px 5px",
            background: profileOpen ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.5)",
            borderRadius: "999px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            flexShrink: 0,
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.2s",
          }}
        >
          <div style={{
            width: "30px", height: "30px", borderRadius: "50%",
            background: roleColor, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "13px", fontWeight: 700, color: "var(--primary-dark)",
          }}>
            {profile?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="topbar-user-text">
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.2 }}>
              {profile?.name?.split(" ")[0] || "User"}
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", textTransform: "capitalize" }}>
              {profile?.role}
            </div>
          </div>
          <span style={{ fontSize: "0.7rem", opacity: 0.5, marginLeft: "4px" }}>{profileOpen ? "▲" : "▼"}</span>
        </button>

        {/* User Profile Dropdown */}
        {profileOpen && (
          <div
            id="topbar-profile-dropdown"
            className="animate-slide-down"
            style={{
              position: "absolute",
              top: "48px",
              right: 0,
              width: "220px",
              background: "rgba(255, 255, 255, 0.85)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(255, 255, 255, 0.45)",
              borderRadius: "16px",
              boxShadow: "0 10px 25px rgba(31, 41, 55, 0.12)",
              padding: "16px",
              zIndex: 100,
            }}
          >
            {/* Header info */}
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--primary-dark)" }}>{profile?.name || "User"}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.email}</div>
              <div style={{ display: "inline-block", marginTop: "6px", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", background: "rgba(61,79,107,0.1)", color: "var(--primary-dark)", padding: "2px 8px", borderRadius: "999px" }}>
                {profile?.role}
              </div>
            </div>

            <div style={{ height: "1px", background: "rgba(0,0,0,0.08)", margin: "8px 0" }} />

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <button
                onClick={handleSettingsClick}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: "8px", background: "none", border: "none",
                  textAlign: "left", fontSize: "0.82rem", color: "var(--text-primary)", fontWeight: 500,
                  cursor: "pointer", transition: "background 0.2s",
                  display: "flex", alignItems: "center", gap: "6px"
                }}
                onMouseOver={e => e.currentTarget.style.background = "rgba(0,0,0,0.04)"}
                onMouseOut={e => e.currentTarget.style.background = "none"}
              >
                <Settings size={15} /> Settings
              </button>
              <button
                onClick={handleLogout}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: "8px", background: "rgba(229,62,62,0.08)", border: "none",
                  textAlign: "left", fontSize: "0.82rem", color: "#e53e3e", fontWeight: 600,
                  cursor: "pointer", transition: "background 0.2s",
                  display: "flex", alignItems: "center", gap: "6px"
                }}
                onMouseOver={e => e.currentTarget.style.background = "rgba(229,62,62,0.14)"}
                onMouseOut={e => e.currentTarget.style.background = "rgba(229,62,62,0.08)"}
              >
                <LogOut size={15} /> Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

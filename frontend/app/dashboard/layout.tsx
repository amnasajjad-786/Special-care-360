"use client";

import { useEffect, createContext, useContext, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import PanicFloatingButton from "@/components/layout/PanicFloatingButton";

// ── Sidebar open/close context (used by TopBar hamburger & Sidebar) ─────────
interface SidebarContextType {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}
export const SidebarContext = createContext<SidebarContextType>({
  isOpen: false,
  toggle: () => {},
  close: () => {},
});
export const useSidebar = () => useContext(SidebarContext);

// ── Role → allowed path prefixes ────────────────────────────────────────────
const ROLE_PATHS: Record<string, string[]> = {
  admin:     ["/dashboard/admin", "/dashboard/students", "/dashboard/daily-care", "/dashboard/abc-tracker", "/dashboard/panic"],
  teacher:   ["/dashboard/students", "/dashboard/daily-care", "/dashboard/abc-tracker", "/dashboard/panic"],
  therapist: ["/dashboard/students", "/dashboard/abc-tracker", "/dashboard/panic"],
  parent:    ["/dashboard/students", "/dashboard/daily-care", "/dashboard/abc-tracker"],
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Auth guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !profile) {
      router.replace("/");
    }
  }, [profile, loading, router]);

  // ── Role-based access guard ─────────────────────────────────────────────
  useEffect(() => {
    if (!loading && profile && profile.status === "approved") {
      const allowed = ROLE_PATHS[profile.role] ?? [];
      const canAccess = allowed.some((p) => pathname.startsWith(p));
      if (!canAccess) {
        // Redirect to the first allowed path for this role
        router.replace(allowed[0] ?? "/");
      }
    }
  }, [profile, loading, pathname, router]);

  // ── Close sidebar on route change (mobile) ──────────────────────────────
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // ── Loading screen ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "var(--bg-gradient)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div className="glass-card" style={{ padding: "48px 56px", textAlign: "center" }}>
          <div style={{
            width: "72px", height: "72px", borderRadius: "50%",
            background: "white", margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 6px 24px rgba(61,79,107,0.2)",
            overflow: "hidden",
            border: "1px solid rgba(61,79,107,0.15)"
          }}>
            <img
              src="/logo.png"
              alt="Special Care 360"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center 15%"
              }}
            />
          </div>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>Loading Special Care 360…</p>
          <div style={{
            margin: "20px auto 0",
            width: "36px", height: "36px", borderRadius: "50%",
            border: "3px solid var(--accent-teal)",
            borderTopColor: "transparent",
            animation: "spin 0.8s linear infinite",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── Pending approval screen ─────────────────────────────────────────────
  if (profile?.status === "pending") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "var(--bg-gradient)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}>
        <div className="glass-card animate-fade-in" style={{ padding: "48px", textAlign: "center", maxWidth: "420px" }}>
          <div style={{ fontSize: "52px", marginBottom: "16px" }}>⏳</div>
          <h2 style={{ color: "var(--primary-dark)", fontWeight: 800, margin: "0 0 10px" }}>
            Awaiting Approval
          </h2>
          <p style={{ color: "var(--text-secondary)", margin: "0 0 24px", lineHeight: 1.6 }}>
            Your account is pending admin approval. You&apos;ll receive access once an administrator approves your registration.
          </p>
          <button
            className="btn-ghost"
            onClick={() => { router.push("/"); }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <SidebarContext.Provider value={{
      isOpen: sidebarOpen,
      toggle: () => setSidebarOpen((o) => !o),
      close: () => setSidebarOpen(false),
    }}>
      <div style={{ display: "flex" }}>
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="sidebar-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <Sidebar />
        <div className="dashboard-layout" style={{ flex: 1 }}>
          <TopBar />
          <div className="page-content">
            {children}
          </div>
        </div>
        <PanicFloatingButton />
      </div>
    </SidebarContext.Provider>
  );
}

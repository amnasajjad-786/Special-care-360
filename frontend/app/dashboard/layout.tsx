"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import PanicFloatingButton from "@/components/layout/PanicFloatingButton";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !profile) {
      router.replace("/");
    }
  }, [profile, loading, router]);

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
          <div style={{ fontSize: "52px", marginBottom: "16px" }}>🦋</div>
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

  if (!profile) return null;

  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <div className="dashboard-layout" style={{ flex: 1 }}>
        <TopBar />
        <div className="page-content">
          {children}
        </div>
      </div>
      <PanicFloatingButton />
    </div>
  );
}

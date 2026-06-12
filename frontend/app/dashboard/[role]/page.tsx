"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function DashboardRoleRedirect() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const role = params?.role as string;

  useEffect(() => {
    if (!loading) {
      if (!profile) {
        router.replace("/");
      } else {
        if (profile.role === "admin") {
          router.replace("/dashboard/admin");
        } else {
          router.replace("/dashboard/students");
        }
      }
    }
  }, [profile, loading, router]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-gradient)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div className="glass-card" style={{ padding: "40px 48px", textAlign: "center" }}>
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
        <h2 style={{ margin: 0, color: "var(--primary-dark)", fontWeight: 700 }}>Special Care 360</h2>
        <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
          Loading {role} dashboard…
        </p>
        <div style={{
          margin: "20px auto 0",
          width: "40px", height: "40px", borderRadius: "50%",
          border: "3px solid var(--accent-teal)",
          borderTopColor: "transparent",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

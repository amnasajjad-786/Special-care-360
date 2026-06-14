"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AlertTriangle, AlertOctagon } from "lucide-react";

export default function PanicFloatingButton() {
  const { profile } = useAuth();
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  // Only teachers and therapists can trigger panic
  if (!profile || !["teacher", "therapist"].includes(profile.role)) return null;

  const handleConfirm = () => {
    setShowModal(false);
    router.push("/dashboard/panic");
  };

  return (
    <>
      <button
        id="panic-float-btn"
        className="panic-float"
        onClick={() => setShowModal(true)}
        title="Send Panic Alert"
      >
        <AlertTriangle size={20} />
        <span>PANIC</span>
      </button>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className="modal-box animate-fade-in"
            style={{ padding: "36px", maxWidth: "420px", width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "center", color: "#c53030", marginBottom: "12px" }}>
                <AlertOctagon size={52} />
              </div>
              <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "#c53030" }}>
                Send Panic Alert?
              </h2>
              <p style={{ margin: "10px 0 0", color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5 }}>
                This will <strong>immediately alert all admins</strong> in your center. Only use in a genuine emergency.
              </p>
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                id="panic-modal-cancel"
                className="btn-ghost"
                onClick={() => setShowModal(false)}
                style={{ flex: 1, padding: "13px" }}
              >
                Cancel
              </button>
              <button
                id="panic-modal-confirm"
                className="btn-danger"
                onClick={handleConfirm}
                style={{ flex: 1, padding: "13px" }}
              >
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <AlertTriangle size={15} /> Send Alert
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

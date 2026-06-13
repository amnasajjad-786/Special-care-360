"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import toast from "react-hot-toast";

const ROLES = [
  { id: "parent",    label: "Parent Login",    emoji: "👨‍👩‍👧", desc: "View your child's progress" },
  { id: "teacher",   label: "Teacher Login",   emoji: "👩🏫", desc: "Manage daily care & journals" },
  { id: "therapist", label: "Therapist Login",  emoji: "🧑‍⚕️", desc: "Track behavioral patterns" },
  { id: "admin",     label: "Admin Login",     emoji: "🛡️", desc: "Full center management" },
];

export default function LoginPage() {
  const router = useRouter();
  const { profile, loading: authLoading, login, register, logout } = useAuth();

  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [loading, setLoading] = useState(false);

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Register form state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRole, setRegRole] = useState("teacher");
  const [regCenterId, setRegCenterId] = useState("demo-center-001");

  // Redirect if already logged in AND approved
  useEffect(() => {
    if (!authLoading && profile && profile.status === "approved") {
      router.push(`/dashboard/${profile.role}`);
    }
  }, [profile, authLoading, router]);

  // Pending approval screen — show inline so user can log out
  if (!authLoading && profile && profile.status === "pending") {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--bg-gradient)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div className="glass-card animate-fade-in" style={{ padding: "48px", textAlign: "center", maxWidth: "420px" }}>
          <div style={{ fontSize: "52px", marginBottom: "16px" }}>⏳</div>
          <h2 style={{ color: "var(--primary-dark)", fontWeight: 800, margin: "0 0 10px" }}>
            Awaiting Approval
          </h2>
          <p style={{ color: "var(--text-secondary)", margin: "0 0 8px", lineHeight: 1.6 }}>
            Your account is pending admin approval. You&apos;ll receive access once an administrator approves your registration.
          </p>
          <p style={{ color: "var(--text-secondary)", margin: "0 0 24px", fontSize: "0.85rem" }}>
            Logged in as <strong>{profile.email}</strong> ({profile.role})
          </p>
          <button
            className="btn-ghost"
            onClick={async () => { await logout(); }}
          >
            Sign Out &amp; Back to Login
          </button>
        </div>
      </main>
    );
  }

  const handleRoleSelect = (roleId: string) => {
    setSelectedRole(roleId);
    setEmail("");
    setPassword("");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setLoading(true);
    try {
      const resolvedProfile = await login(email, password);
      toast.success("Welcome back!");
      // Use role from the returned profile — guaranteed correct even if
      // no role button was clicked before typing credentials manually.
      const role = resolvedProfile?.role ?? selectedRole ?? "admin";
      router.push(`/dashboard/${role}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      toast.error(msg.includes("user-not-found") ? "No account found with this email" :
                  msg.includes("wrong-password") ? "Incorrect password" : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regEmail || !regPassword) {
      toast.error("Please fill all fields");
      return;
    }
    setLoading(true);
    try {
      await register({ name: regName, email: regEmail, password: regPassword, role: regRole, centerId: regCenterId });
      toast.success(regRole === "admin" ? "Account created! Logging you in…" : "Registration submitted! Awaiting admin approval.");
      if (regRole === "admin") router.push("/dashboard/admin");
      else setShowRegister(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      toast.error(msg.includes("email-already-in-use") ? "Email already registered" : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg-gradient)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "460px" }}>
        {/* ── Card ── */}
        <div className="glass-card animate-fade-in" style={{ padding: "40px 36px" }}>

          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <div style={{
              width: "72px", height: "72px", borderRadius: "50%",
              background: "white", margin: "0 auto 14px",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 6px 24px rgba(61,79,107,0.25)",
              overflow: "hidden",
              border: "1px solid rgba(61,79,107,0.15)"
            }}>
              <img
                src="/logo.png"
                alt="Special Care 360 Logo"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center 15%"
                }}
              />
            </div>
            <h1 style={{ margin: 0, fontSize: "1.65rem", fontWeight: 800, color: "var(--primary-dark)" }}>
              Special Care 360
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
              HIPAA-Compliant Special Education Platform
            </p>
          </div>

          {!showRegister ? (
            <>
              {/* ── Login View ── */}
              <div style={{ textAlign: "center", marginBottom: "24px" }}>
                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Welcome Back!
                </h2>
                <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Please select your role to continue
                </p>
              </div>

              {/* Role Buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: selectedRole ? "20px" : "0" }}>
                {ROLES.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => handleRoleSelect(role.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: "14px",
                      padding: "14px 18px", borderRadius: "12px", cursor: "pointer",
                      border: selectedRole === role.id
                        ? "2px solid var(--accent-teal)"
                        : "2px solid transparent",
                      background: selectedRole === role.id
                        ? "rgba(123, 196, 196, 0.1)"
                        : "var(--primary-dark)",
                      color: selectedRole === role.id ? "var(--primary-dark)" : "white",
                      transition: "all 0.2s ease",
                      boxShadow: selectedRole === role.id
                        ? "0 0 0 1px var(--accent-teal), 0 4px 14px rgba(123,196,196,0.3)"
                        : "0 4px 14px rgba(61,79,107,0.25)",
                    }}
                  >
                    <span style={{ fontSize: "1.4rem", minWidth: "28px" }}>{role.emoji}</span>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{role.label}</div>
                      <div style={{ fontSize: "0.75rem", opacity: 0.75 }}>{role.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Slide-in login form */}
              {selectedRole && (
                <form
                  onSubmit={handleLogin}
                  className="animate-slide-down"
                  style={{ display: "flex", flexDirection: "column", gap: "12px" }}
                >
                  <div style={{
                    padding: "10px 14px", background: "rgba(123,196,196,0.08)",
                    borderRadius: "10px", fontSize: "0.82rem", color: "var(--accent-teal)",
                    fontWeight: 600, textAlign: "center",
                    border: "1px solid rgba(123,196,196,0.3)",
                  }}>
                    🔐 Signing in as {ROLES.find(r => r.id === selectedRole)?.label.split(" ")[0]}
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "5px" }}>
                      Email
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      className="glass-input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "5px" }}>
                      Password
                    </label>
                    <input
                      id="login-password"
                      type="password"
                      className="glass-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                  </div>

                  <button
                    id="login-submit"
                    type="submit"
                    className="btn-primary"
                    disabled={loading}
                    style={{ width: "100%", marginTop: "4px", padding: "14px" }}
                  >
                    {loading ? "Signing in…" : `Sign in as ${ROLES.find(r => r.id === selectedRole)?.label.split(" ")[0]}`}
                  </button>
                </form>
              )}

              <p style={{ textAlign: "center", marginTop: "20px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Don&apos;t have an account?{" "}
                <button
                  onClick={() => setShowRegister(true)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-teal)", fontWeight: 600, fontSize: "0.85rem" }}
                >
                  Register
                </button>
              </p>
            </>
          ) : (
            /* ── Register View ── */
            <form
              onSubmit={handleRegister}
              className="animate-slide-down"
              style={{ display: "flex", flexDirection: "column", gap: "14px" }}
            >
              <div style={{ textAlign: "center", marginBottom: "8px" }}>
                <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Create Account
                </h2>
                <p style={{ margin: "5px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  Admin accounts are approved instantly. Others require admin approval.
                </p>
              </div>

              {[
                { id: "reg-name", label: "Full Name", val: regName, setter: setRegName, type: "text", placeholder: "Dr. Amna Raza" },
                { id: "reg-email", label: "Email", val: regEmail, setter: setRegEmail, type: "email", placeholder: "you@example.com" },
                { id: "reg-password", label: "Password", val: regPassword, setter: setRegPassword, type: "password", placeholder: "••••••••" },
                { id: "reg-centerid", label: "Center ID", val: regCenterId, setter: setRegCenterId, type: "text", placeholder: "demo-center-001" },
              ].map(({ id, label, val, setter, type, placeholder }) => (
                <div key={id}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "5px" }}>{label}</label>
                  <input id={id} type={type} className="glass-input" value={val} onChange={(e) => setter(e.target.value)} placeholder={placeholder} required />
                </div>
              ))}

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "5px" }}>Role</label>
                <select
                  id="reg-role"
                  className="glass-input"
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value)}
                  style={{ cursor: "pointer" }}
                >
                  <option value="admin">Admin</option>
                  <option value="teacher">Teacher</option>
                  <option value="therapist">Therapist</option>
                  <option value="parent">Parent</option>
                </select>
              </div>

              <button
                id="register-submit"
                type="submit"
                className="btn-primary"
                disabled={loading}
                style={{ width: "100%", marginTop: "4px", padding: "14px" }}
              >
                {loading ? "Registering…" : "Create Account"}
              </button>

              <p style={{ textAlign: "center", marginTop: "4px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Already have an account?{" "}
                <button
                  onClick={() => setShowRegister(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-teal)", fontWeight: 600, fontSize: "0.85rem" }}
                >
                  Sign in
                </button>
              </p>
            </form>
          )}
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", marginTop: "16px", fontSize: "0.78rem", color: "rgba(255,255,255,0.65)" }}>
          © 2026 Special Care 360 · HIPAA Compliant
        </p>
      </div>
    </main>
  );
}

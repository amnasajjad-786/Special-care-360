"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import toast from "react-hot-toast";

import { Users, GraduationCap, Brain, Shield, Lock } from "lucide-react";

const ROLES = [
  { id: "parent",    label: "Parent Login",    icon: Users, desc: "View your child's progress" },
  { id: "teacher",   label: "Teacher Login",   icon: GraduationCap, desc: "Manage daily care & journals" },
  { id: "therapist", label: "Therapist Login",  icon: Brain, desc: "Track behavioral patterns" },
  { id: "admin",     label: "Admin Login",     icon: Shield, desc: "Full center management" },
];

export default function LoginPage() {
  const router = useRouter();
  const { profile, loading: authLoading, login, loginWithGoogle, register, logout } = useAuth();

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
  const [regCenterId, setRegCenterId] = useState("center-001");

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

  const handleGoogleSignIn = async () => {
    if (!selectedRole) {
      toast.error("Please select a role to continue");
      return;
    }
    setLoading(true);
    try {
      const resolvedProfile = await loginWithGoogle(selectedRole);
      toast.success("Welcome!");
      router.push(`/dashboard/${resolvedProfile.role}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign in failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setLoading(true);
    try {
      const resolvedProfile = await loginWithGoogle(regRole);
      toast.success(
        resolvedProfile.status === "approved"
          ? "Account created and logged in!"
          : "Registration submitted! Awaiting admin approval."
      );
      if (resolvedProfile.status === "approved") {
        router.push(`/dashboard/${resolvedProfile.role}`);
      } else {
        setShowRegister(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google registration failed";
      toast.error(msg);
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

    // Validation checks
    const emailLower = regEmail.trim().toLowerCase();
    if (!emailLower.endsWith("@specialcare360.com")) {
      toast.error("Manual registration requires a @specialcare360.com email address");
      return;
    }

    if (regPassword.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }
    if (!/[A-Z]/.test(regPassword)) {
      toast.error("Password must contain at least 1 uppercase letter");
      return;
    }
    if (!/[a-z]/.test(regPassword)) {
      toast.error("Password must contain at least 1 lowercase letter");
      return;
    }
    if (!/\d/.test(regPassword)) {
      toast.error("Password must contain at least 1 number");
      return;
    }
    if (!/[^A-Za-z0-9]/.test(regPassword)) {
      toast.error("Password must contain at least 1 special character");
      return;
    }

    setLoading(true);
    try {
      await register({ name: regName, email: regEmail, password: regPassword, role: regRole, centerId: regCenterId });
      toast.success(regRole === "admin" ? "Account created! Logging you in…" : "Registration submitted! Awaiting admin approval.");
      if (regRole === "admin") router.push("/dashboard/admin");
      else {
        setRegName("");
        setRegEmail("");
        setRegPassword("");
        setShowRegister(false);
      }
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
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "28px", color: selectedRole === role.id ? "var(--accent-teal)" : "rgba(255,255,255,0.7)" }}>
                      <role.icon size={22} />
                    </span>
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
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      <Lock size={14} /> Signing in as {ROLES.find(r => r.id === selectedRole)?.label.split(" ")[0]}
                    </span>
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

                  <div style={{ display: "flex", alignItems: "center", margin: "10px 0" }}>
                    <hr style={{ flex: 1, border: "0.5px solid rgba(255, 255, 255, 0.15)" }} />
                    <span style={{ padding: "0 10px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>OR</span>
                    <hr style={{ flex: 1, border: "0.5px solid rgba(255, 255, 255, 0.15)" }} />
                  </div>

                  <button
                    id="google-login"
                    type="button"
                    className="btn-secondary"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      background: "rgba(255, 255, 255, 0.05)",
                      color: "white",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "12px",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"; }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.62-.62-1.05-1.37-1.18-2.63zm0 0"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
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
                { id: "reg-centerid", label: "Center ID", val: regCenterId, setter: setRegCenterId, type: "text", placeholder: "center-001" },
              ].map(({ id, label, val, setter, type, placeholder }) => (
                <div key={id}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "5px" }}>{label}</label>
                  <input id={id} type={type} className="glass-input" value={val} onChange={(e) => setter(e.target.value)} placeholder={placeholder} required />
                  {id === "reg-password" && (
                    <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)", marginTop: "4px", paddingLeft: "4px", lineHeight: 1.3 }}>
                      Password requirements: At least 8 characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character.
                    </div>
                  )}
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

              <div style={{ display: "flex", alignItems: "center", margin: "10px 0" }}>
                <hr style={{ flex: 1, border: "0.5px solid rgba(255, 255, 255, 0.15)" }} />
                <span style={{ padding: "0 10px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>OR</span>
                <hr style={{ flex: 1, border: "0.5px solid rgba(255, 255, 255, 0.15)" }} />
              </div>

              <button
                id="google-register"
                type="button"
                className="btn-secondary"
                onClick={handleGoogleRegister}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  background: "rgba(255, 255, 255, 0.05)",
                  color: "white",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "12px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"; }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.62-.62-1.05-1.37-1.18-2.63zm0 0"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign up with Google
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

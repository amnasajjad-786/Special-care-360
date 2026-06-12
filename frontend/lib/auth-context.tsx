"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { UserProfile } from "@/types";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserProfile | null>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  role: string;
  centerId: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Auth state listener ────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = async (email: string, password: string): Promise<UserProfile | null> => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const snap = await getDoc(doc(db, "users", cred.user.uid));
    const resolvedProfile = snap.exists() ? (snap.data() as UserProfile) : null;
    setProfile(resolvedProfile);
    return resolvedProfile;
  };

  // ── Register ───────────────────────────────────────────────────────────────
  const register = async (data: RegisterData): Promise<void> => {
    const cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
    const profileData: UserProfile = {
      uid:      cred.user.uid,
      name:     data.name,
      email:    data.email,
      role:     data.role as UserProfile["role"],
      centerId: data.centerId,
      status:   data.role === "admin" ? "approved" : "pending",
    };
    await setDoc(doc(db, "users", cred.user.uid), {
      ...profileData,
      createdAt: serverTimestamp(),
    });
    setProfile(profileData);
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = async (): Promise<void> => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
  };

  // ── Get ID token ───────────────────────────────────────────────────────────
  const getIdToken = async (): Promise<string | null> => {
    if (user) {
      return await user.getIdToken();
    }
    return null;
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, register, logout, getIdToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

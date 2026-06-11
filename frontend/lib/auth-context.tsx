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
  login: (email: string, password: string) => Promise<void>;
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

// ─── Demo mode: bypass real Firebase when using placeholder config ───────────
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
  typeof window !== "undefined"; // Always true in dev with placeholder

const DEMO_USERS: Record<string, { password: string; profile: UserProfile }> = {
  "admin@demo.com": {
    password: "demo1234",
    profile: { uid: "admin-001", name: "Dr. Amna Raza", email: "admin@demo.com", role: "admin", centerId: "demo-center-001", status: "approved" },
  },
  "teacher@demo.com": {
    password: "demo1234",
    profile: { uid: "teacher-001", name: "Ms. Fatima Khan", email: "teacher@demo.com", role: "teacher", centerId: "demo-center-001", status: "approved" },
  },
  "therapist@demo.com": {
    password: "demo1234",
    profile: { uid: "therapist-001", name: "Dr. Zara Ahmed", email: "therapist@demo.com", role: "therapist", centerId: "demo-center-001", status: "approved" },
  },
  "parent@demo.com": {
    password: "demo1234",
    profile: { uid: "parent-001", name: "Mr. Ali Hassan", email: "parent@demo.com", role: "parent", centerId: "demo-center-001", status: "approved" },
  },
};

let demoCurrentUser: { user: User | null; profile: UserProfile | null } = { user: null, profile: null };
const demoListeners: Array<() => void> = [];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try real Firebase first; fall back to demo mode on error
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        setUser(firebaseUser);
        if (firebaseUser) {
          const docRef = doc(db, "users", firebaseUser.uid);
          const snap = await getDoc(docRef);
          setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        } else {
          setProfile(null);
        }
        setLoading(false);
      });
    } catch {
      // Firebase not configured — use demo mode
      setUser(demoCurrentUser.user);
      setProfile(demoCurrentUser.profile);
      setLoading(false);

      // Register demo listener for updates
      const listener = () => {
        setUser(demoCurrentUser.user);
        setProfile(demoCurrentUser.profile);
      };
      demoListeners.push(listener);
      return () => {
        const idx = demoListeners.indexOf(listener);
        if (idx > -1) demoListeners.splice(idx, 1);
      };
    }
    return () => unsubscribe?.();
  }, []);

  const login = async (email: string, password: string) => {
    // Try demo credentials first
    const demoUser = DEMO_USERS[email.toLowerCase()];
    if (demoUser && demoUser.password === password) {
      demoCurrentUser = {
        user: { uid: demoUser.profile.uid, email } as unknown as User,
        profile: demoUser.profile,
      };
      setUser(demoCurrentUser.user);
      setProfile(demoCurrentUser.profile);
      demoListeners.forEach((l) => l());
      return;
    }

    // Real Firebase login
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const docRef = doc(db, "users", cred.user.uid);
    const snap = await getDoc(docRef);
    setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
  };

  const register = async (data: RegisterData) => {
    // Real Firebase registration
    const cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
    const profileData: UserProfile = {
      uid: cred.user.uid,
      name: data.name,
      email: data.email,
      role: data.role as UserProfile["role"],
      centerId: data.centerId,
      status: data.role === "admin" ? "approved" : "pending",
    };
    await setDoc(doc(db, "users", cred.user.uid), {
      ...profileData,
      createdAt: serverTimestamp(),
    });
    setProfile(profileData);
  };

  const logout = async () => {
    // Clear demo session
    demoCurrentUser = { user: null, profile: null };
    setUser(null);
    setProfile(null);
    demoListeners.forEach((l) => l());
    try {
      await signOut(auth);
    } catch { /* ignore if Firebase not configured */ }
  };

  const getIdToken = async (): Promise<string | null> => {
    if (user && "getIdToken" in user && typeof (user as User).getIdToken === "function") {
      try {
        return await (user as User).getIdToken();
      } catch {
        return "demo-token";
      }
    }
    return "demo-token";
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

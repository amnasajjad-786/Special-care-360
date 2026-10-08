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
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { UserProfile } from "@/types";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  loginWithGoogle: (role: string) => Promise<UserProfile>;
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

export const DEFAULT_CENTER_ID = "center-001";

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Auth state listener ────────────────────────────────────────────────────
  useEffect(() => {
    let stopProfile: (() => void) | undefined;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      stopProfile?.();
      stopProfile = undefined;
      setUser(firebaseUser);
      if (firebaseUser) {
        stopProfile = onSnapshot(doc(db, "users", firebaseUser.uid), snap => {
          const profile = snap.exists() ? { ...snap.data(), uid: firebaseUser.uid } as UserProfile : null;
          setProfile(profile);
          setLoading(false);
          if (profile?.status === "disabled") void signOut(auth);
        }, () => { setProfile(null); setLoading(false); });
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => { stopProfile?.(); unsubscribe(); };
  }, []);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = async (email: string, password: string): Promise<UserProfile> => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const snap = await getDoc(doc(db, "users", cred.user.uid));
    if (!snap.exists()) {
      await signOut(auth);
      setUser(null);
      setProfile(null);
      throw new Error(
        "This Firebase account has no matching Special Care 360 profile. Ask an administrator to link your account."
      );
    }

    const resolvedProfile = snap.data() as UserProfile;
    setProfile(resolvedProfile);
    return resolvedProfile;
  };

  // ── Login with Google ──────────────────────────────────────────────────────
  const loginWithGoogle = async (role: string): Promise<UserProfile> => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const userRef = doc(db, "users", cred.user.uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const existingProfile = snap.data() as UserProfile;
      setProfile(existingProfile);
      return existingProfile;
    } else {
      const profileData: UserProfile = {
        uid:      cred.user.uid,
        name:     cred.user.displayName || cred.user.email?.split("@")[0] || "Google User",
        email:    cred.user.email || "",
        role:     role as UserProfile["role"],
        centerId: DEFAULT_CENTER_ID,
        // A self-registration can never approve itself, whatever role was picked.
        // An existing admin approves it; the first admin is provisioned
        // out-of-band by backend/seed_firestore.py.
        status:   "pending",
      };
      await setDoc(userRef, {
        ...profileData,
        createdAt: serverTimestamp(),
      });
      setProfile(profileData);
      return profileData;
    }
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
      // See loginWithGoogle: self-registration is always pending approval.
      status:   "pending",
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
    <AuthContext.Provider value={{ user, profile, loading, login, loginWithGoogle, register, logout, getIdToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

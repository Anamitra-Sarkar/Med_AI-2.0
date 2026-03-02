"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebase";
import { getProfile, type UserProfile } from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** null = still checking, true = profile exists, false = no profile yet */
  hasProfile: boolean | null;
  userProfile: UserProfile | null;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string) => Promise<User>;
  signInWithGoogle: () => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const checkProfile = useCallback(async (uid: string) => {
    try {
      const profile = await getProfile(uid);
      setUserProfile(profile);
      setHasProfile(true);
    } catch {
      // 404 or any error = no profile yet
      setUserProfile(null);
      setHasProfile(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const auth = getFirebaseAuth();
    const currentUser = auth?.currentUser;
    if (currentUser) await checkProfile(currentUser.uid);
  }, [checkProfile]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await checkProfile(firebaseUser.uid);
      } else {
        setHasProfile(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [checkProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase is not configured.");
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase is not configured.");
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    return credential.user;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase is not configured.");
    const credential = await signInWithPopup(auth, getGoogleProvider());
    return credential.user;
  }, []);

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await firebaseSignOut(auth);
    setUser(null);
    setHasProfile(null);
    setUserProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        hasProfile,
        userProfile,
        refreshProfile,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

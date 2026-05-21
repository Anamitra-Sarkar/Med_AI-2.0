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
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  getFirebaseAuth,
  getGoogleProvider,
  ensureFirebaseAuthPersistence,
  isFirebaseConfigured,
} from "@/lib/firebase";
import { getProfile, type UserProfile } from "@/lib/api";
import { useTheme } from "@/context/ThemeContext";

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isGuest?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /** null = still checking, true = profile exists, false = no profile yet */
  hasProfile: boolean | null;
  userProfile: UserProfile | null;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (email: string, password: string) => Promise<AuthUser>;
  signInWithGoogle: () => Promise<AuthUser | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const GUEST_USER: AuthUser = {
  uid: "guest",
  email: null,
  displayName: "Guest",
  photoURL: null,
  isGuest: true,
};

function normalizeUser(user: FirebaseUser): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

function shouldUseGoogleRedirectFlow(): boolean {
  if (typeof window === "undefined") return false;

  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(navigatorWithStandalone.standalone);
  const hasTouchInput =
    window.matchMedia("(pointer: coarse)").matches ||
    (navigatorWithStandalone.maxTouchPoints ?? 0) > 0;
  const isCompactViewport = window.matchMedia("(max-width: 1024px)").matches;

  return isStandalone || (hasTouchInput && isCompactViewport);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured());
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const { initTheme, resetTheme } = useTheme();

  const enterGuestMode = useCallback(() => {
    setUser(GUEST_USER);
    setHasProfile(true);
    setUserProfile(null);
    initTheme(GUEST_USER.uid, undefined);
    setLoading(false);
  }, [initTheme]);

  const checkProfile = useCallback(async (uid: string) => {
    try {
      const profile = await getProfile(uid);
      setUserProfile(profile);
      setHasProfile(true);
      // Apply the user's saved theme — falls back to system pref if not set
      initTheme(uid, profile.theme);
    } catch {
      // 404 or any error = no profile yet
      setUserProfile(null);
      setHasProfile(false);
      // Still initialise theme with system default for this UID
      initTheme(uid, undefined);
    }
  }, [initTheme]);

  const refreshProfile = useCallback(async () => {
    if (!user || user.isGuest) return;
    await checkProfile(user.uid);
  }, [checkProfile, user]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      enterGuestMode();
      return;
    }

    // Process any pending redirect result from signInWithRedirect.
    // On mobile devices, Google sign-in uses the redirect flow, and getRedirectResult
    // MUST be called after the redirect returns so Firebase can finalise the sign-in and
    // emit the authenticated user via onAuthStateChanged.
    ensureFirebaseAuthPersistence(auth)
      .then(() => getRedirectResult(auth))
      .catch((error: unknown) => {
        // Firebase throws specific codes when there is simply no pending redirect
        // (auth/no-auth-event, auth/null-user, auth/redirect-cancelled-by-user).
        // These are expected on normal page loads and can be safely ignored.
        // Any other error is unexpected and should be surfaced in the console.
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code: unknown }).code)
            : "";
        const ignoredCodes = [
          "auth/no-auth-event",
          "auth/null-user",
          "auth/redirect-cancelled-by-user",
        ];
        if (!ignoredCodes.includes(code)) {
          console.error("[Auth] getRedirectResult error:", error);
        }
      });

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser ? normalizeUser(firebaseUser) : null);
      if (firebaseUser) {
        await checkProfile(firebaseUser.uid);
      } else {
        setHasProfile(null);
        setUserProfile(null);
        // User signed out — reset theme to system default, clear persisted UID
        resetTheme();
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [checkProfile, enterGuestMode, resetTheme]);

  const signIn = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) return GUEST_USER;
    await ensureFirebaseAuthPersistence(auth);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return normalizeUser(credential.user);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) return GUEST_USER;
    await ensureFirebaseAuthPersistence(auth);
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    return normalizeUser(credential.user);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return GUEST_USER;
    await ensureFirebaseAuthPersistence(auth);

    if (shouldUseGoogleRedirectFlow()) {
      await signInWithRedirect(auth, getGoogleProvider());
      return null;
    }

    try {
      const credential = await signInWithPopup(auth, getGoogleProvider());
      return normalizeUser(credential.user);
    } catch (error: unknown) {
      const code =
        typeof error === "object" && error && "code" in error ? String(error.code) : "";

      if (code === "auth/popup-blocked") {
        await signInWithRedirect(auth, getGoogleProvider());
        return null;
      }

      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await firebaseSignOut(auth);
    setUser(null);
    setHasProfile(null);
    setUserProfile(null);
    resetTheme();
  }, [resetTheme]);

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

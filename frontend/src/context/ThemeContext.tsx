"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { updateProfile } from "@/lib/api";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  /**
   * Called by AuthContext after a user logs in and their profile is loaded.
   * Applies the user's saved theme and keeps the UID so future changes
   * are persisted back to the backend — no localStorage involved.
   */
  initTheme: (uid: string, savedTheme?: "light" | "dark") => void;
  /** Called by AuthContext on sign-out to reset to system default */
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/** Derive system preference — used only as a fallback when no saved theme exists */
function systemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Apply theme class to <html> without touching localStorage */
function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  // UID of the currently signed-in user — null when logged out
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  // Apply class whenever theme changes
  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  /**
   * Called once per login by AuthContext after the profile is fetched.
   * Sets the active UID so persist() can write to the right user record.
   */
  const initTheme = useCallback((uid: string, savedTheme?: "light" | "dark") => {
    setCurrentUid(uid);
    setThemeState(savedTheme ?? systemTheme());
  }, []);

  /** Called on sign-out — revert to system default, clear UID */
  const resetTheme = useCallback(() => {
    setCurrentUid(null);
    setThemeState(systemTheme());
  }, []);

  /** Persist to backend (fire-and-forget, non-blocking) */
  const persistTheme = useCallback((uid: string, t: Theme) => {
    updateProfile(uid, { theme: t }).catch(() => {
      // Non-critical — UI already updated; silently ignore network errors
    });
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    if (currentUid) persistTheme(currentUid, t);
  }, [currentUid, persistTheme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      if (currentUid) persistTheme(currentUid, next);
      return next;
    });
  }, [currentUid, persistTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, initTheme, resetTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

"use client";

  import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

  export interface Note {
    id: string;
    content: string;
    timestamp: string;
  }

  export interface HealthProfileState {
    age: string;
    bloodType: string;
    conditions: string;
    medications: string;
  }

  interface WorkspaceContextValue {
    notes: Note[];
    addNote: (content: string) => void;
    deleteNote: (id: string) => void;
    clearNotes: () => void;
    healthProfile: HealthProfileState;
    updateHealthProfile: (patch: Partial<HealthProfileState>) => void;
  }

  const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

  const initialHealthProfile: HealthProfileState = {
    age: "",
    bloodType: "",
    conditions: "",
    medications: "",
  };

  function makeId() {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  export function formatHealthProfileSummary(profile: HealthProfileState): string {
    const parts: string[] = [];
    const age = profile.age.trim();
    const bloodType = profile.bloodType.trim();
    const firstCondition = profile.conditions
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)[0];

    if (age) parts.push(age);
    if (bloodType) parts.push(bloodType);
    if (firstCondition) parts.push(firstCondition);

    return parts.length > 0 ? parts.join(" · ") : "No health profile";
  }

  export function buildHealthProfileContext(profile: HealthProfileState): string {
    const parts: string[] = [];
    const age = profile.age.trim();
    const bloodType = profile.bloodType.trim();
    const conditions = profile.conditions.trim();
    const medications = profile.medications.trim();

    if (age) parts.push(`Age: ${age}`);
    if (bloodType) parts.push(`Blood type: ${bloodType}`);
    if (conditions) parts.push(`Known conditions: ${conditions}`);
    if (medications) parts.push(`Current medications: ${medications}`);

    return parts.join("\n");
  }

  export function WorkspaceProvider({ children }: { children: ReactNode }) {
    const [notes, setNotes] = useState<Note[]>([]);
    const [healthProfile, setHealthProfile] = useState<HealthProfileState>(initialHealthProfile);

    const addNote = useCallback((content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      setNotes((prev) => [...prev, { id: makeId(), content: trimmed, timestamp: new Date().toISOString() }]);
    }, []);

    const deleteNote = useCallback((id: string) => {
      setNotes((prev) => prev.filter((note) => note.id !== id));
    }, []);

    const clearNotes = useCallback(() => {
      setNotes([]);
    }, []);

    const updateHealthProfile = useCallback((patch: Partial<HealthProfileState>) => {
      setHealthProfile((prev) => ({ ...prev, ...patch }));
    }, []);

    const value = useMemo(
      () => ({ notes, addNote, deleteNote, clearNotes, healthProfile, updateHealthProfile }),
      [notes, addNote, deleteNote, clearNotes, healthProfile, updateHealthProfile]
    );

    return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
  }

  export function useWorkspace(): WorkspaceContextValue {
    const ctx = useContext(WorkspaceContext);
    if (!ctx) {
      throw new Error("useWorkspace must be used within a WorkspaceProvider");
    }
    return ctx;
  }

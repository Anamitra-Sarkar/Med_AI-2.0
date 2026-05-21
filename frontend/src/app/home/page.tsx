"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FiBookOpen, FiSettings, FiPlus } from "react-icons/fi";
import Link from "next/link";
import AppLoadingScreen from "@/components/AppLoadingScreen";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/Sidebar";
import ChatInterface from "@/components/ChatInterface";
import DiagnosticModal from "@/components/DiagnosticModal";
import NearbyModal from "@/components/NearbyModal";
import NotesPanel from "@/components/NotesPanel";
import SymptomCheckerModal from "@/components/SymptomCheckerModal";
import { isFirebaseConfigured } from "@/lib/firebase";

const diagnosticTitles: Record<string, string> = {
  cataract: "ClearView Cataract Screening",
  "diabetic-retinopathy": "RetinaGuard DR Grading",
  kidney: "NephroScan CT Analysis",
  skin: "DermaVision Skin Analysis",
  cardiac: "CardioInsight MRI Classifier",
};

export default function HomePage() {
  const { user, loading, hasProfile } = useAuth();
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [diagnosticModal, setDiagnosticModal] = useState({ open: false, modelType: "", title: "" });
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [symptomCheckerOpen, setSymptomCheckerOpen] = useState(false);
  const [chatPrefillPrompt, setChatPrefillPrompt] = useState("");
  const [chatPrefillVersion, setChatPrefillVersion] = useState(0);

  // Chat session state — drives ChatInterface
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // Ticks to force sidebar list refresh
  const [chatRefreshTick, setChatRefreshTick] = useState(0);
  const [uploadRefreshTick, setUploadRefreshTick] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      if (isFirebaseConfigured()) router.replace("/login");
      return;
    }
    if (user.isGuest) return;
    if (hasProfile === null) return;
    if (hasProfile === false) router.replace("/profile/create");
  }, [loading, user, hasProfile, router]);

  function handleMenuSelect(key: string) {
    setSidebarOpen(false);
    if (key === "nearby") {
      setNearbyOpen(true);
    } else {
      setDiagnosticModal({ open: true, modelType: key, title: diagnosticTitles[key] || key });
    }
  }

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setChatRefreshTick((t) => t + 1);
  }, []);

  const handleRestoreChat = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
  }, []);

  const handleSessionCreated = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setChatRefreshTick((t) => t + 1);
  }, []);

  const handleUploadRecorded = useCallback(() => {
    setUploadRefreshTick((t) => t + 1);
  }, []);

  if (
    loading ||
    (!user && isFirebaseConfigured()) ||
    (user && !user.isGuest && (hasProfile === null || hasProfile === false))
  ) {
    return <AppLoadingScreen message="Preparing your workspace…" />;
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background text-foreground">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((p) => !p)}
        onMenuSelect={handleMenuSelect}
        onNewChat={handleNewChat}
        onRestoreChat={handleRestoreChat}
        onOpenSymptomChecker={() => setSymptomCheckerOpen(true)}
        chatRefreshTick={chatRefreshTick}
        uploadRefreshTick={uploadRefreshTick}
      />

      {/* Persistent sidebar toggle — always visible, outside sidebar */}
      <button
        onClick={() => setSidebarOpen((prev) => !prev)}
        aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        className="fixed left-0 top-1/2 z-50 flex h-8 w-5 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-border bg-surface-1 text-muted-foreground shadow-md transition-all duration-200 hover:bg-surface-offset hover:text-foreground"
        style={{
          left: sidebarOpen ? "240px" : "0px",
          transition: "left 200ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          {sidebarOpen ? <path d="M7 3L3 8L7 13" /> : <path d="M3 3L7 8L3 13" />}
        </svg>
      </button>

      <div className="medfield-bg flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-[oklch(from_var(--surface-1)_l_c_h_/_0.95)] px-4 py-3 backdrop-blur-sm shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <h1
              className="text-lg text-foreground"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              Valeon
            </h1>
          </div>
          <div className="flex items-center gap-1">
            {/* New Chat button in top-right */}
            <motion.button
              onClick={handleNewChat}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-offset hover:text-foreground"
              aria-label="New chat" title="New Chat">
              <FiPlus size={20} />
            </motion.button>
            <motion.button
              onClick={() => setNotesOpen((p) => !p)}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className={`rounded-lg p-2 transition-colors ${notesOpen ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-surface-offset hover:text-foreground'}`}
              aria-label="Notes" title="Notes">
              <FiBookOpen size={20} />
            </motion.button>
            {user && !user.isGuest && (
              <Link href="/settings"
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
                aria-label="Settings">
                <FiSettings size={20} />
              </Link>
            )}
          </div>
        </header>

        <ChatInterface
          activeSessionId={activeSessionId}
          onSessionCreated={handleSessionCreated}
          prefillPrompt={chatPrefillPrompt}
          prefillVersion={chatPrefillVersion}
        />
      </div>

      <DiagnosticModal
        isOpen={diagnosticModal.open}
        onClose={() => setDiagnosticModal({ open: false, modelType: "", title: "" })}
        modelType={diagnosticModal.modelType}
        title={diagnosticModal.title}
        onUploadRecorded={handleUploadRecorded}
      />
      <NearbyModal isOpen={nearbyOpen} onClose={() => setNearbyOpen(false)} />
      <NotesPanel isOpen={notesOpen} onClose={() => setNotesOpen(false)} />
      <SymptomCheckerModal
        isOpen={symptomCheckerOpen}
        onClose={() => setSymptomCheckerOpen(false)}
        onSelectPrompt={(prompt) => {
          setChatPrefillPrompt(prompt);
          setChatPrefillVersion((v) => v + 1);
        }}
      />
    </div>
  );
}

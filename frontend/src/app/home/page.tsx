"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FiSettings, FiMenu, FiPlus } from "react-icons/fi";
import Link from "next/link";
import AppLoadingScreen from "@/components/AppLoadingScreen";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/Sidebar";
import ChatInterface from "@/components/ChatInterface";
import DiagnosticModal from "@/components/DiagnosticModal";
import NearbyModal from "@/components/NearbyModal";

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

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [diagnosticModal, setDiagnosticModal] = useState({ open: false, modelType: "", title: "" });
  const [nearbyOpen, setNearbyOpen] = useState(false);

  // Chat session state — drives ChatInterface
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // Ticks to force sidebar list refresh
  const [chatRefreshTick, setChatRefreshTick] = useState(0);
  const [uploadRefreshTick, setUploadRefreshTick] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
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

  if (loading || !user || hasProfile === null || hasProfile === false) {
    return <AppLoadingScreen message="Preparing your workspace…" />;
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((p) => !p)}
        onMenuSelect={handleMenuSelect}
        onNewChat={handleNewChat}
        onRestoreChat={handleRestoreChat}
        chatRefreshTick={chatRefreshTick}
        uploadRefreshTick={uploadRefreshTick}
      />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-2.5 glass-card">
          <div className="flex items-center gap-3">
            <motion.button onClick={() => setSidebarOpen((p) => !p)}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="rounded-lg p-2 text-foreground transition-colors hover:bg-primary/10"
              aria-label="Toggle sidebar">
              <FiMenu size={20} />
            </motion.button>
            <Logo size="sm" />
            <h1 className="text-lg font-bold bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-transparent">
              Valeon
            </h1>
          </div>
          <div className="flex items-center gap-1">
            {/* New Chat button in top-right */}
            <motion.button
              onClick={handleNewChat}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="rounded-lg p-2 text-teal-400/70 transition-colors hover:bg-teal-500/10 hover:text-teal-400"
              aria-label="New chat" title="New Chat">
              <FiPlus size={20} />
            </motion.button>
            <Link href="/settings"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
              aria-label="Settings">
              <FiSettings size={20} />
            </Link>
          </div>
        </header>

        <ChatInterface
          activeSessionId={activeSessionId}
          onSessionCreated={handleSessionCreated}
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
    </div>
  );
}

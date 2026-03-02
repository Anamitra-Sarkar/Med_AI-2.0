"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FiSettings, FiMenu } from "react-icons/fi";
import Link from "next/link";
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
  const [diagnosticModal, setDiagnosticModal] = useState({
    open: false,
    modelType: "",
    title: "",
  });
  const [nearbyOpen, setNearbyOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    // hasProfile===null means the profile check is still in-flight — wait
    if (hasProfile === null) return;
    if (hasProfile === false) {
      // New user: force profile creation before anything else
      router.replace("/profile/create");
    }
  }, [loading, user, hasProfile, router]);

  function handleMenuSelect(key: string) {
    setSidebarOpen(false);
    if (key === "nearby") {
      setNearbyOpen(true);
    } else {
      setDiagnosticModal({
        open: true,
        modelType: key,
        title: diagnosticTitles[key] || key,
      });
    }
  }

  // Show spinner while auth OR profile check is still resolving
  if (loading || !user || hasProfile === null || hasProfile === false) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <motion.div
          className="h-10 w-10 rounded-full border-4 border-teal-500 border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((p) => !p)}
        onMenuSelect={handleMenuSelect}
      />

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-2.5 glass-card">
          <div className="flex items-center gap-3">
            <motion.button
              onClick={() => setSidebarOpen((p) => !p)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="rounded-lg p-2 text-foreground transition-colors hover:bg-primary/10"
              aria-label="Toggle sidebar"
            >
              <FiMenu size={20} />
            </motion.button>
            <Logo size="sm" />
            <h1 className="text-lg font-bold bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-transparent">
              Valeon
            </h1>
          </div>
          <Link
            href="/settings"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
            aria-label="Settings"
          >
            <FiSettings size={20} />
          </Link>
        </header>

        {/* Chat area */}
        <ChatInterface />
      </div>

      {/* Modals */}
      <DiagnosticModal
        isOpen={diagnosticModal.open}
        onClose={() =>
          setDiagnosticModal({ open: false, modelType: "", title: "" })
        }
        modelType={diagnosticModal.modelType}
        title={diagnosticModal.title}
      />
      <NearbyModal isOpen={nearbyOpen} onClose={() => setNearbyOpen(false)} />
    </div>
  );
}

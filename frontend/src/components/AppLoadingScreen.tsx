"use client";

import { motion } from "framer-motion";

interface AppLoadingScreenProps {
  message?: string;
}

export default function AppLoadingScreen({
  message = "Preparing your health dashboard…",
}: AppLoadingScreenProps) {
  return (
    <div className="hero-mesh fixed inset-0 z-50 flex flex-col items-center justify-center gap-8">
      <div className="absolute inset-0 grid-pattern opacity-30 pointer-events-none" />
      <div className="relative flex flex-col items-center gap-6">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 rounded-2xl bg-surface-1 ring-1 ring-border shadow-[var(--shadow-lg)]" />
          <svg viewBox="0 0 32 32" fill="none" className="relative h-8 w-8" aria-label="Valeon">
            <path d="M16 4L28 24H4L16 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="text-primary" />
            <circle cx="16" cy="18" r="2" fill="currentColor" className="text-primary" />
          </svg>
        </div>
        <div className="text-center">
          <h1 className="hero-type text-3xl text-foreground">Valeon</h1>
          <p className="mono-label mt-1">Medical AI Platform</p>
        </div>
        <div className="w-48 overflow-hidden rounded-full bg-surface-offset" style={{ height: "2px" }}>
          <motion.div
            className="h-full rounded-full bg-primary"
            style={{
              animation: "loadProgress 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            }}
          />
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

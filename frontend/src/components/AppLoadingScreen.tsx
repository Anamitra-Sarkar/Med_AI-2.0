"use client";

import { motion } from "framer-motion";
import Logo from "@/components/Logo";

interface AppLoadingScreenProps {
  message?: string;
}

export default function AppLoadingScreen({
  message = "Preparing your health dashboard…",
}: AppLoadingScreenProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#164e63_0%,#0f172a_45%,#020617_100%)] px-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-teal-400/20 blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 24, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl"
          animate={{ x: [0, -36, 0], y: [0, -30, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <Logo size="lg" />
        </motion.div>
        <div className="space-y-1">
          <p className="text-2xl font-semibold tracking-tight text-white">Valeon</p>
          <p className="text-sm text-white/65">{message}</p>
        </div>
        <motion.div
          className="h-10 w-10 rounded-full border-4 border-teal-400/80 border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    </div>
  );
}

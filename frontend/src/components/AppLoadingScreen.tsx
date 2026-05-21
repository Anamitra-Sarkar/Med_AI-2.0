"use client";

import { motion } from "framer-motion";

interface AppLoadingScreenProps {
  message?: string;
}

export default function AppLoadingScreen({
  message = "Preparing your health dashboard…",
}: AppLoadingScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-2 text-4xl font-normal tracking-tight text-foreground [font-family:'Instrument Serif',serif]">
            Valeon
          </div>
          <p className="text-sm text-muted-foreground">{message}</p>
        </motion.div>
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-surface-offset">
          <motion.div
            className="h-full w-1/3 rounded-full bg-primary"
            animate={{ x: ["-10%", "220%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiX,
  FiEye,
  FiActivity,
  FiDroplet,
  FiSun,
  FiZap,
  FiMapPin,
} from "react-icons/fi";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onMenuSelect: (key: string) => void;
}

const menuItems = [
  { key: "cataract", label: "ClearView Cataract Screening", icon: FiEye },
  { key: "dr", label: "RetinaGuard DR Grading", icon: FiActivity },
  { key: "kidney", label: "NephroScan CT Analysis", icon: FiDroplet },
  { key: "skin", label: "DermaVision Skin Analysis", icon: FiSun },
  { key: "cardiac", label: "CardioInsight MRI Classifier", icon: FiZap },
  { key: "nearby", label: "Nearby Care Locator", icon: FiMapPin },
];

const sidebarVariants = {
  closed: { x: -280 },
  open: { x: 0 },
};

export default function Sidebar({
  isOpen,
  onToggle,
  onMenuSelect,
}: SidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Close on outside click (mobile only)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(e.target as Node) &&
        window.innerWidth < 1024 &&
        isOpen
      ) {
        onToggle();
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onToggle]);

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={onToggle}
          />
        )}
      </AnimatePresence>

      {/* Sidebar panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            ref={sidebarRef}
            variants={sidebarVariants}
            initial="closed"
            animate="open"
            exit="closed"
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 z-50 flex h-full w-[280px] flex-col border-r border-white/10 bg-slate-900/95 backdrop-blur-xl lg:relative lg:z-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-white/50">
                AI Diagnostic Tools
              </h2>
              <motion.button
                onClick={onToggle}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Close sidebar"
              >
                <FiX size={18} />
              </motion.button>
            </div>

            {/* Menu items */}
            <nav className="flex-1 overflow-y-auto p-3">
              <div className="flex flex-col gap-1">
                {menuItems.map((item, i) => (
                  <motion.button
                    key={item.key}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                    onClick={() => onMenuSelect(item.key)}
                    className="group flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-white/70 transition-all hover:bg-white/8 hover:text-white"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 transition-colors group-hover:bg-teal-500/20">
                      <item.icon
                        size={16}
                        className="text-teal-400/70 transition-colors group-hover:text-teal-400"
                      />
                    </div>
                    <span className="leading-tight">{item.label}</span>
                  </motion.button>
                ))}
              </div>
            </nav>

            {/* Footer */}
            <div className="border-t border-white/10 px-5 py-3">
              <p className="text-[10px] text-white/30 text-center">
                AI-powered diagnostics — not a substitute for professional
                medical advice
              </p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

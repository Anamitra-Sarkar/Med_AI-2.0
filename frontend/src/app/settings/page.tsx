"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiArrowLeft,
  FiUser,
  FiMoon,
  FiSun,
  FiLogOut,
  FiChevronDown,
  FiSettings,
} from "react-icons/fi";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { getProfile, updateProfile } from "@/lib/api";

/* ─── animation variants ─── */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};

export default function SettingsPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();

  const [profileExpanded, setProfileExpanded] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Profile form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [diseases, setDiseases] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [leftEye, setLeftEye] = useState("");
  const [rightEye, setRightEye] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    getProfile(user.uid)
      .then((p) => {
        setName(p.name || "");
        setEmail(p.email || "");
        setDiseases(p.diseases || "");
        setHeight(p.height || "");
        setWeight(p.weight || "");
        setLeftEye(p.left_eye_power || "");
        setRightEye(p.right_eye_power || "");
      })
      .catch(() => {});
  }, [user]);

  async function handleSaveProfile() {
    if (!user) return;
    setSaving(true);
    try {
      await updateProfile(user.uid, {
        name,
        email,
        diseases: diseases || undefined,
        height: height || undefined,
        weight: weight || undefined,
        left_eye_power: leftEye || undefined,
        right_eye_power: rightEye || undefined,
      });
      toast.success("Profile updated!");
      setProfileExpanded(false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update profile";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut();
      toast.success("Signed out");
      router.replace("/");
    } catch {
      toast.error("Failed to sign out");
    }
  }

  if (authLoading || !user) {
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
    <div className="relative min-h-screen overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-teal-400/10 blur-3xl"
          animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-3xl"
          animate={{ x: [0, -50, 0], y: [0, -60, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center gap-4"
        >
          <motion.button
            onClick={() => router.push("/home")}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="rounded-xl border border-white/15 bg-white/5 p-2.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Back to home"
          >
            <FiArrowLeft size={20} />
          </motion.button>
          <div className="flex items-center gap-2">
            <FiSettings className="text-teal-400" size={24} />
            <h1 className="text-2xl font-bold text-white">Settings</h1>
          </div>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          {/* ─── Edit Profile ─── */}
          <motion.div
            variants={itemVariants}
            className="overflow-hidden rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl"
          >
            <button
              onClick={() => setProfileExpanded((p) => !p)}
              className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-white/5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-500/20">
                  <FiUser className="text-teal-400" size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Edit Profile</h3>
                  <p className="text-xs text-white/50">
                    Update your health information
                  </p>
                </div>
              </div>
              <motion.div
                animate={{ rotate: profileExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <FiChevronDown className="text-white/40" size={20} />
              </motion.div>
            </button>

            <AnimatePresence>
              {profileExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 border-t border-white/10 px-6 py-5">
                    {/* Name */}
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-white/60">
                        Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-teal-400 focus:shadow-[0_0_12px_rgba(20,184,166,0.2)]"
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-white/60">
                        Email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-teal-400 focus:shadow-[0_0_12px_rgba(20,184,166,0.2)]"
                      />
                    </div>

                    {/* Diseases */}
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-white/60">
                        Diseases / Conditions
                      </label>
                      <input
                        type="text"
                        value={diseases}
                        onChange={(e) => setDiseases(e.target.value)}
                        placeholder="Conditions separated by comma, or NIL"
                        className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-teal-400 focus:shadow-[0_0_12px_rgba(20,184,166,0.2)]"
                      />
                    </div>

                    {/* Height & Weight */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-white/60">
                          Height
                        </label>
                        <input
                          type="text"
                          value={height}
                          onChange={(e) => setHeight(e.target.value)}
                          placeholder="e.g. 170 cm"
                          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-teal-400 [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-white/60">
                          Weight
                        </label>
                        <input
                          type="text"
                          value={weight}
                          onChange={(e) => setWeight(e.target.value)}
                          placeholder="e.g. 70 kg"
                          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-teal-400 [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </div>

                    {/* Eye Power */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-white/60">
                          Left Eye Power
                        </label>
                        <input
                          type="text"
                          value={leftEye}
                          onChange={(e) => setLeftEye(e.target.value)}
                          placeholder="e.g. -1.50"
                          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-teal-400 [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-white/60">
                          Right Eye Power
                        </label>
                        <input
                          type="text"
                          value={rightEye}
                          onChange={(e) => setRightEye(e.target.value)}
                          placeholder="e.g. -2.00"
                          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-teal-400 [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </div>

                    {/* Save */}
                    <motion.button
                      onClick={handleSaveProfile}
                      disabled={saving}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? (
                        <motion.div
                          className="h-5 w-5 rounded-full border-2 border-white border-t-transparent"
                          animate={{ rotate: 360 }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                        />
                      ) : (
                        "Save Changes"
                      )}
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* ─── Theme Toggle ─── */}
          <motion.div
            variants={itemVariants}
            className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
                  {theme === "dark" ? (
                    <FiMoon className="text-blue-400" size={18} />
                  ) : (
                    <FiSun className="text-amber-400" size={18} />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-white">Appearance</h3>
                  <p className="text-xs text-white/50">
                    {theme === "dark" ? "Dark" : "Light"} mode
                  </p>
                </div>
              </div>
              {/* Toggle switch */}
              <button
                onClick={toggleTheme}
                className={`relative h-7 w-12 rounded-full transition-colors duration-300 ${
                  theme === "dark" ? "bg-teal-500" : "bg-white/20"
                }`}
                aria-label="Toggle theme"
              >
                <motion.div
                  className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md"
                  animate={{
                    left: theme === "dark" ? "calc(100% - 1.625rem)" : "0.125rem",
                  }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </button>
            </div>
          </motion.div>

          {/* ─── Logout ─── */}
          <motion.div
            variants={itemVariants}
            className="overflow-hidden rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl"
          >
            <AnimatePresence mode="wait">
              {!logoutConfirm ? (
                <motion.button
                  key="logout-trigger"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setLogoutConfirm(true)}
                  className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-white/5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
                    <FiLogOut className="text-red-400" size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-red-400">Logout</h3>
                    <p className="text-xs text-white/50">
                      Sign out of your account
                    </p>
                  </div>
                </motion.button>
              ) : (
                <motion.div
                  key="logout-confirm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-6 py-4"
                >
                  <p className="mb-3 text-sm text-white/70">
                    Are you sure you want to sign out?
                  </p>
                  <div className="flex gap-3">
                    <motion.button
                      onClick={() => setLogoutConfirm(false)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex-1 rounded-xl border border-white/15 bg-white/5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      onClick={handleLogout}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-semibold text-white shadow-lg"
                    >
                      Sign Out
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

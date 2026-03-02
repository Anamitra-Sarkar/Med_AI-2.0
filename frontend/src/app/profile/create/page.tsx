"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FiHeart, FiActivity } from "react-icons/fi";
import toast from "react-hot-toast";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { createProfile } from "@/lib/api";

/* ─── animation variants ─── */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

export default function ProfileCreatePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [diseases, setDiseases] = useState("");
  const [height, setHeight] = useState("");
  const [heightUnit, setHeightUnit] = useState<"cm" | "ft">("cm");
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("kg");
  const [leftEye, setLeftEye] = useState("");
  const [rightEye, setRightEye] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!user) {
      toast.error("You must be signed in");
      return;
    }

    setSubmitting(true);
    try {
      await createProfile({
        firebase_uid: user.uid,
        name: user.displayName || "",
        email: user.email || "",
        diseases: diseases.trim().toLowerCase() === "nil" || !diseases.trim() ? "NIL" : diseases.trim(),
        height: height ? `${height} ${heightUnit}` : undefined,
        weight: weight ? `${weight} ${weightUnit}` : undefined,
        left_eye_power: leftEye || undefined,
        right_eye_power: rightEye || undefined,
      });

      toast.success("Profile created successfully!");
      router.push("/home");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save profile";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || (!authLoading && !user)) {
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      {/* animated gradient background */}
      <div className="pointer-events-none absolute inset-0 -z-10 animate-[gradientShift_12s_ease_infinite] bg-[length:200%_200%] bg-gradient-to-br from-teal-600 via-teal-700 to-blue-800" />

      {/* floating orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-teal-400/20 blur-3xl"
          animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-blue-500/20 blur-3xl"
          animate={{ x: [0, -50, 0], y: [0, -60, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute left-1/2 top-1/3 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-indigo-400/10 blur-3xl"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* glassmorphism card */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-lg rounded-3xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl sm:p-10"
      >
        {/* logo */}
        <motion.div variants={itemVariants} className="mb-6 flex justify-center">
          <Logo size="lg" />
        </motion.div>

        {/* heading */}
        <motion.h1
          variants={itemVariants}
          className="mb-2 text-center text-3xl font-bold text-white"
        >
          Complete Your Profile
        </motion.h1>
        <motion.p
          variants={itemVariants}
          className="mb-8 text-center text-sm text-white/60"
        >
          Help us personalise your health experience
        </motion.p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Diseases */}
          <motion.div variants={itemVariants}>
            <label htmlFor="diseases" className="mb-1.5 block text-sm font-medium text-white/80">
              Diseases / Conditions
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 transition-all focus-within:border-teal-400 focus-within:shadow-[0_0_12px_rgba(20,184,166,0.3)]">
              <FiHeart className="shrink-0 text-white/40" />
              <input
                id="diseases"
                type="text"
                value={diseases}
                onChange={(e) => setDiseases(e.target.value)}
                placeholder="Enter conditions separated by comma, or NIL"
                aria-label="Diseases or conditions"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              />
            </div>
          </motion.div>

          {/* Height + Weight row */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Height */}
            <div>
              <label htmlFor="height" className="mb-1.5 block text-sm font-medium text-white/80">
                Height
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 transition-all focus-within:border-teal-400 focus-within:shadow-[0_0_12px_rgba(20,184,166,0.3)]">
                <FiActivity className="shrink-0 text-white/40" />
                <input
                  id="height"
                  type="number"
                  min={0}
                  step="any"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="Height"
                  aria-label="Height"
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <select
                  value={heightUnit}
                  onChange={(e) => setHeightUnit(e.target.value as "cm" | "ft")}
                  aria-label="Height unit"
                  className="shrink-0 cursor-pointer rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-white outline-none"
                >
                  <option value="cm" className="text-slate-900">cm</option>
                  <option value="ft" className="text-slate-900">ft</option>
                </select>
              </div>
            </div>

            {/* Weight */}
            <div>
              <label htmlFor="weight" className="mb-1.5 block text-sm font-medium text-white/80">
                Weight
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 transition-all focus-within:border-teal-400 focus-within:shadow-[0_0_12px_rgba(20,184,166,0.3)]">
                <FiActivity className="shrink-0 text-white/40" />
                <input
                  id="weight"
                  type="number"
                  min={0}
                  step="any"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="Weight"
                  aria-label="Weight"
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <select
                  value={weightUnit}
                  onChange={(e) => setWeightUnit(e.target.value as "kg" | "lbs")}
                  aria-label="Weight unit"
                  className="shrink-0 cursor-pointer rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-white outline-none"
                >
                  <option value="kg" className="text-slate-900">kg</option>
                  <option value="lbs" className="text-slate-900">lbs</option>
                </select>
              </div>
            </div>
          </motion.div>

          {/* Eye Power row */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Left Eye */}
            <div>
              <label htmlFor="leftEye" className="mb-1.5 block text-sm font-medium text-white/80">
                Left Eye Power
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 transition-all focus-within:border-teal-400 focus-within:shadow-[0_0_12px_rgba(20,184,166,0.3)]">
                <span className="shrink-0 text-xs font-semibold text-white/40">L</span>
                <input
                  id="leftEye"
                  type="number"
                  step={0.25}
                  value={leftEye}
                  onChange={(e) => setLeftEye(e.target.value)}
                  placeholder="e.g. -1.50"
                  aria-label="Left eye power"
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
            </div>

            {/* Right Eye */}
            <div>
              <label htmlFor="rightEye" className="mb-1.5 block text-sm font-medium text-white/80">
                Right Eye Power
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 transition-all focus-within:border-teal-400 focus-within:shadow-[0_0_12px_rgba(20,184,166,0.3)]">
                <span className="shrink-0 text-xs font-semibold text-white/40">R</span>
                <input
                  id="rightEye"
                  type="number"
                  step={0.25}
                  value={rightEye}
                  onChange={(e) => setRightEye(e.target.value)}
                  placeholder="e.g. -2.00"
                  aria-label="Right eye power"
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
            </div>
          </motion.div>

          {/* Submit */}
          <motion.div variants={itemVariants} className="mt-2">
            <motion.button
              type="submit"
              disabled={submitting}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-blue-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <motion.div
                  className="h-5 w-5 rounded-full border-2 border-white border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              ) : (
                "Save Profile"
              )}
            </motion.button>
          </motion.div>
        </form>
      </motion.div>
    </div>
  );
}

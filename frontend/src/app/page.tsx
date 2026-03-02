"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  FiMessageCircle,
  FiEye,
  FiActivity,
  FiHeart,
  FiShield,
  FiCamera,
  FiSend,
  FiMail,
  FiUser,
} from "react-icons/fi";
import Logo from "@/components/Logo";

/* ─── animation helpers ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.6, ease: "easeOut" as const },
  }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};

/* ─── data ─── */
const features = [
  {
    icon: FiMessageCircle,
    title: "AI Health Chat",
    desc: "Smart, compassionate conversations about your health powered by advanced AI.",
  },
  {
    icon: FiEye,
    title: "ClearView Cataract Screening",
    desc: "AI-powered eye analysis for early cataract detection and monitoring.",
  },
  {
    icon: FiActivity,
    title: "RetinaGuard DR Grading",
    desc: "Precise diabetic retinopathy detection and severity grading.",
  },
  {
    icon: FiShield,
    title: "NephroScan CT Analysis",
    desc: "Comprehensive kidney health assessment from CT imagery.",
  },
  {
    icon: FiCamera,
    title: "DermaVision Skin Analysis",
    desc: "Intelligent skin condition detection and classification.",
  },
  {
    icon: FiHeart,
    title: "CardioInsight MRI Classifier",
    desc: "Advanced heart health analysis from cardiac MRI scans.",
  },
];

/* ─── reusable section wrapper with inView ─── */
function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.section
      ref={ref}
      id={id}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={stagger}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/* ═══════════════════════ PAGE ═══════════════════════ */

export default function Home() {
  return (
    <div className="overflow-x-hidden">
      {/* ── HERO ── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
        {/* animated gradient bg */}
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

        <motion.div
          className="flex flex-col items-center gap-6"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div variants={fadeUp} custom={0}>
            <Logo size="lg" />
          </motion.div>

          <motion.h1
            variants={fadeUp}
            custom={1}
            className="text-5xl font-bold tracking-tight text-white sm:text-7xl"
          >
            Valeon
          </motion.h1>

          <motion.p
            variants={fadeUp}
            custom={2}
            className="max-w-lg text-lg font-medium text-white/80 sm:text-xl"
          >
            Your Premium AI Health Companion
          </motion.p>

          <motion.div
            variants={fadeUp}
            custom={3}
            className="mt-4 flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              href="/signup"
              className="rounded-full bg-white px-8 py-3 text-sm font-semibold text-teal-700 shadow-lg transition hover:bg-white/90 hover:shadow-xl"
            >
              Join Now
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-white/40 bg-white/10 px-8 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              Sign In
            </Link>
          </motion.div>
        </motion.div>

        {/* scroll indicator */}
        <motion.div
          className="absolute bottom-8"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="h-8 w-5 rounded-full border-2 border-white/40 p-1">
            <div className="mx-auto h-2 w-1 rounded-full bg-white/60" />
          </div>
        </motion.div>
      </section>

      {/* ── ABOUT ── */}
      <Section
        id="about"
        className="mx-auto max-w-4xl px-6 py-28"
      >
        <motion.div
          variants={cardVariant}
          className="glass-card rounded-3xl p-10 text-center dark:glass-dark sm:p-14"
        >
          <h2 className="mb-6 text-3xl font-bold text-slate-800 dark:text-white sm:text-4xl">
            About Valeon
          </h2>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
            Valeon brings the power of artificial intelligence to personal
            healthcare. From intelligent health conversations to advanced
            medical imaging analysis, Valeon provides accessible, reliable
            insights—helping you make informed decisions about your
            well-being, anytime, anywhere.
          </p>
        </motion.div>
      </Section>

      {/* ── FEATURES ── */}
      <Section
        id="features"
        className="mx-auto max-w-6xl px-6 py-28"
      >
        <motion.h2
          variants={fadeUp}
          custom={0}
          className="mb-14 text-center text-3xl font-bold text-slate-800 dark:text-white sm:text-4xl"
        >
          Powerful Features
        </motion.h2>

        <motion.div
          variants={stagger}
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={cardVariant}
              whileHover={{ y: -6, transition: { duration: 0.25 } }}
              className="glass-card group cursor-default rounded-2xl p-8 transition-shadow hover:shadow-2xl dark:glass-dark"
            >
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 text-white shadow-md">
                <f.icon size={22} />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-slate-800 dark:text-white">
                {f.title}
              </h3>
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {f.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* ── CONTACT ── */}
      <Section
        id="contact"
        className="mx-auto max-w-2xl px-6 py-28"
      >
        <motion.h2
          variants={fadeUp}
          custom={0}
          className="mb-10 text-center text-3xl font-bold text-slate-800 dark:text-white sm:text-4xl"
        >
          Get in Touch
        </motion.h2>

        <motion.form
          variants={cardVariant}
          onSubmit={(e) => e.preventDefault()}
          className="glass-card flex flex-col gap-5 rounded-3xl p-8 dark:glass-dark sm:p-10"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Name
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/60 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-white/5">
              <FiUser className="text-slate-400" />
              <input
                type="text"
                placeholder="Your name"
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-white"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Email
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/60 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-white/5">
              <FiMail className="text-slate-400" />
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-white"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Message
            </span>
            <textarea
              rows={4}
              placeholder="How can we help?"
              className="rounded-xl border border-slate-200 bg-white/60 px-4 py-3 text-sm text-slate-800 outline-none backdrop-blur placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </label>

          <button
            type="submit"
            className="mt-2 inline-flex items-center justify-center gap-2 self-end rounded-full bg-gradient-to-r from-teal-500 to-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl hover:brightness-110"
          >
            <FiSend size={16} />
            Send Message
          </button>
        </motion.form>
      </Section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-slate-200 bg-white/50 backdrop-blur dark:border-white/10 dark:bg-slate-900/50">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-10 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span className="text-sm font-semibold text-slate-700 dark:text-white">
              Valeon
            </span>
          </div>

          <nav className="flex gap-6 text-sm text-slate-500 dark:text-slate-400">
            <a href="#about" className="transition hover:text-teal-600 dark:hover:text-teal-400">
              About
            </a>
            <a href="#features" className="transition hover:text-teal-600 dark:hover:text-teal-400">
              Features
            </a>
            <a href="#contact" className="transition hover:text-teal-600 dark:hover:text-teal-400">
              Contact
            </a>
          </nav>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            &copy; {new Date().getFullYear()} Valeon. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

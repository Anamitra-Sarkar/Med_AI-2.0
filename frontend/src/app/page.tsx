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

/* ─────────────────────────────────────────────────────────────────
   ECG WAVEFORM DESIGNS
   5 distinct clinically-inspired morphologies, each 800 units wide.
   baseline at y=60, amplitude range roughly 10–90.
   All are duplicated end-to-end (offset +800) for seamless looping.
───────────────────────────────────────────────────────────────── */

/**
 * Design A — Classic Normal Sinus Rhythm
 * P wave → PR interval → sharp narrow QRS → ST segment → rounded T wave
 */
function buildA(): string {
  const t =
    "M0,60 L60,60 " +                             // pre-P flat
    "L80,54 L100,60 " +                           // P wave (gentle hump)
    "L160,60 " +                                  // PR interval
    "L200,60 L210,18 L218,60 L226,88 L234,60 " + // QRS: Q dip, tall R, S dip
    "L270,60 " +                                  // ST segment
    "L300,52 L330,60 " +                          // T wave (rounded)
    "L800,60";                                    // back to flat
  return t + " " + shiftPath(t, 800);
}

/**
 * Design B — Broad Notched QRS (Bundle Branch pattern)
 * Wide double-peaked R wave, prominent S, visible U wave after T
 */
function buildB(): string {
  const t =
    "M0,60 L70,60 " +
    "L90,56 L110,60 " +                           // P wave
    "L150,60 " +
    "L180,60 L195,35 L210,45 L222,25 L234,60 L248,75 L260,60 " + // notched R-R'
    "L300,60 " +
    "L325,50 L355,60 " +                          // T wave
    "L385,57 L405,60 " +                          // U wave
    "L800,60";
  return t + " " + shiftPath(t, 800);
}

/**
 * Design C — Peaked T-waves (Hyperkalaemia-like / athletic heart)
 * Small QRS, very tall narrow T wave, no prominent P
 */
function buildC(): string {
  const t =
    "M0,60 L100,60 " +
    "L120,57 L140,60 " +                          // small P
    "L190,60 L200,52 L208,60 L216,68 L224,60 " + // small QRS
    "L250,60 " +
    "L270,22 L290,60 " +                          // tall peaked T
    "L800,60";
  return t + " " + shiftPath(t, 800);
}

/**
 * Design D — ST Elevation pattern
 * Normal QRS followed by a raised ST segment that curves into T
 */
function buildD(): string {
  const t =
    "M0,60 L50,60 " +
    "L70,55 L90,60 " +                            // P wave
    "L140,60 " +
    "L165,60 L175,15 L183,60 L191,80 L200,60 " + // QRS
    "L210,48 L240,44 L270,42 L300,48 L330,60 " + // elevated ST segment curving to T
    "L800,60";
  return t + " " + shiftPath(t, 800);
}

/**
 * Design E — Atrial Flutter-like (rapid sawtooth baseline + QRS)
 * Fast regular sawtooth flutter waves with periodic QRS break
 */
function buildE(): string {
  // flutter waves every 40px, then a QRS interruption around x=400
  const flutter = Array.from({ length: 10 }, (_, i) => {
    const x0 = i * 40;
    return `L${x0},60 L${x0 + 15},50 L${x0 + 30},65 L${x0 + 40},60`;
  }).join(" ");
  const t =
    `M0,60 ${flutter} ` +                         // flutter baseline 0-400
    "L390,60 L395,20 L403,60 L411,80 L420,60 " + // QRS break
    "L440,60 " +
    // second run of flutter 440-800
    Array.from({ length: 9 }, (_, i) => {
      const x0 = 440 + i * 40;
      return `L${x0},60 L${x0 + 15},50 L${x0 + 30},65 L${x0 + 40},60`;
    }).join(" ") +
    " L800,60";
  return t + " " + shiftPath(t, 800);
}

/** Shift all numeric X coordinates in a path string by +offset */
function shiftPath(path: string, offset: number): string {
  // Replace M/L followed by x,y — only shift x
  return path.replace(/([ML])(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/g, (_m, cmd, x, y) =>
    `${cmd}${parseFloat(x) + offset},${y}`
  );
}

/** The 5 builder functions, indexed for deterministic selection */
const ECG_BUILDERS = [buildA, buildB, buildC, buildD, buildE];

/** Unique gradient IDs per line to avoid SVG defs collision */
const GRAD_COLORS: Array<[string, string]> = [
  ["#2dd4bf", "#38bdf8"], // teal → sky
  ["#34d399", "#60a5fa"], // emerald → blue
  ["#5eead4", "#818cf8"], // teal → indigo
  ["#22d3ee", "#a78bfa"], // cyan → violet
  ["#2dd4bf", "#93c5fd"], // teal → light-blue
  ["#6ee7b7", "#67e8f9"], // green → cyan
  ["#38bdf8", "#c4b5fd"], // sky → purple
];

function EcgLine({
  y,
  opacity,
  duration,
  designIndex,
  lineIndex,
}: {
  y: string;
  opacity: number;
  duration: number;
  designIndex: number;
  lineIndex: number;
}) {
  const pathData = ECG_BUILDERS[designIndex % ECG_BUILDERS.length]();
  const gradId = `ecgGrad${lineIndex}`;
  const [c1, c2] = GRAD_COLORS[lineIndex % GRAD_COLORS.length];

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1600 120"
      preserveAspectRatio="none"
      className="absolute left-0 w-[200%]"
      style={{ top: y, opacity }}
      animate={{ x: ["0%", "-50%"] }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "linear",
        repeatType: "loop",
      }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={c1} stopOpacity="0" />
          <stop offset="15%" stopColor={c1} stopOpacity="1" />
          <stop offset="85%" stopColor={c2} stopOpacity="1" />
          <stop offset="100%" stopColor={c2} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={pathData}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </motion.svg>
  );
}

/* ─── 7 lines: position / opacity / speed / which design (0–4) ───
   Design indices are spread so adjacent lines are never the same shape.
   The sequence below cycles through A B C D E C B deliberately.
─── */
const ECG_LINES: Array<{ y: string; opacity: number; duration: number; design: number }> = [
  { y: "5%",  opacity: 0.09, duration: 16, design: 0 }, // A — classic sinus
  { y: "17%", opacity: 0.16, duration: 12, design: 1 }, // B — bundle branch
  { y: "30%", opacity: 0.26, duration: 9,  design: 2 }, // C — peaked T
  { y: "47%", opacity: 0.36, duration: 7,  design: 3 }, // D — ST elevation  (focal, brightest)
  { y: "61%", opacity: 0.26, duration: 10, design: 4 }, // E — flutter
  { y: "76%", opacity: 0.16, duration: 13, design: 2 }, // C again, different speed
  { y: "89%", opacity: 0.09, duration: 17, design: 1 }, // B again, different speed
];

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

        {/* ── ECG HEARTBEAT LINES ── */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          {ECG_LINES.map((line, i) => (
            <EcgLine
              key={i}
              y={line.y}
              opacity={line.opacity}
              duration={line.duration}
              designIndex={line.design}
              lineIndex={i}
            />
          ))}
        </div>

        {/* hero content */}
        <motion.div
          className="relative z-10 flex flex-col items-center gap-6"
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
          className="absolute bottom-8 z-10"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="h-8 w-5 rounded-full border-2 border-white/40 p-1">
            <div className="mx-auto h-2 w-1 rounded-full bg-white/60" />
          </div>
        </motion.div>
      </section>

      {/* ── ABOUT ── */}
      <Section id="about" className="mx-auto max-w-4xl px-6 py-28">
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
      <Section id="features" className="mx-auto max-w-6xl px-6 py-28">
        <motion.h2
          variants={fadeUp}
          custom={0}
          className="mb-14 text-center text-3xl font-bold text-slate-800 dark:text-white sm:text-4xl"
        >
          Powerful Features
        </motion.h2>

        <motion.div variants={stagger} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
      <Section id="contact" className="mx-auto max-w-2xl px-6 py-28">
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
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Name</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/60 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-white/5">
              <FiUser className="text-slate-400" />
              <input type="text" placeholder="Your name" className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-white" />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Email</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/60 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-white/5">
              <FiMail className="text-slate-400" />
              <input type="email" placeholder="you@example.com" className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-white" />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Message</span>
            <textarea rows={4} placeholder="How can we help?" className="rounded-xl border border-slate-200 bg-white/60 px-4 py-3 text-sm text-slate-800 outline-none backdrop-blur placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white" />
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
            <span className="text-sm font-semibold text-slate-700 dark:text-white">Valeon</span>
          </div>
          <nav className="flex gap-6 text-sm text-slate-500 dark:text-slate-400">
            <a href="#about" className="transition hover:text-teal-600 dark:hover:text-teal-400">About</a>
            <a href="#features" className="transition hover:text-teal-600 dark:hover:text-teal-400">Features</a>
            <a href="#contact" className="transition hover:text-teal-600 dark:hover:text-teal-400">Contact</a>
          </nav>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            &copy; {new Date().getFullYear()} Valeon. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

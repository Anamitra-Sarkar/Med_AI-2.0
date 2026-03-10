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
    transition: { duration: 0.55, ease: "easeOut" as const },
  },
};

/* ─── data ─── */
const features = [
  {
    icon: FiMessageCircle,
    title: "AI Health Chat",
    desc: "Smart, compassionate conversations about your health powered by advanced AI.",
    color: "from-teal-500 to-cyan-400",
  },
  {
    icon: FiEye,
    title: "ClearView Cataract Screening",
    desc: "AI-powered eye analysis for early cataract detection and monitoring.",
    color: "from-blue-500 to-indigo-400",
  },
  {
    icon: FiActivity,
    title: "RetinaGuard DR Grading",
    desc: "Precise diabetic retinopathy detection and severity grading.",
    color: "from-violet-500 to-purple-400",
  },
  {
    icon: FiShield,
    title: "NephroScan CT Analysis",
    desc: "Comprehensive kidney health assessment from CT imagery.",
    color: "from-emerald-500 to-teal-400",
  },
  {
    icon: FiCamera,
    title: "DermaVision Skin Analysis",
    desc: "Intelligent skin condition detection and classification.",
    color: "from-pink-500 to-rose-400",
  },
  {
    icon: FiHeart,
    title: "CardioInsight MRI Classifier",
    desc: "Advanced heart health analysis from cardiac MRI scans.",
    color: "from-red-500 to-orange-400",
  },
];

/* ─── section wrapper ─── */
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

/* ─── ambient orb (reusable) ─── */
function Orb({
  className,
  duration,
  animate,
}: {
  className: string;
  duration: number;
  animate: object;
}) {
  return (
    <motion.div
      className={`pointer-events-none absolute rounded-full blur-3xl ${className}`}
      animate={animate}
      transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/* ─────────────────────────────────────────────────────────
   ECG WAVEFORM DESIGNS  (5 distinct morphologies)
───────────────────────────────────────────────────────── */
function shiftPath(path: string, offset: number): string {
  return path.replace(/([ML])(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/g, (_m, cmd, x, y) =>
    `${cmd}${parseFloat(x) + offset},${y}`
  );
}

function buildA(): string {
  const t =
    "M0,60 L60,60 L80,54 L100,60 L160,60 " +
    "L200,60 L210,18 L218,60 L226,88 L234,60 " +
    "L270,60 L300,52 L330,60 L800,60";
  return t + " " + shiftPath(t, 800);
}
function buildB(): string {
  const t =
    "M0,60 L70,60 L90,56 L110,60 L150,60 " +
    "L180,60 L195,35 L210,45 L222,25 L234,60 L248,75 L260,60 " +
    "L300,60 L325,50 L355,60 L385,57 L405,60 L800,60";
  return t + " " + shiftPath(t, 800);
}
function buildC(): string {
  const t =
    "M0,60 L100,60 L120,57 L140,60 " +
    "L190,60 L200,52 L208,60 L216,68 L224,60 " +
    "L250,60 L270,22 L290,60 L800,60";
  return t + " " + shiftPath(t, 800);
}
function buildD(): string {
  const t =
    "M0,60 L50,60 L70,55 L90,60 L140,60 " +
    "L165,60 L175,15 L183,60 L191,80 L200,60 " +
    "L210,48 L240,44 L270,42 L300,48 L330,60 L800,60";
  return t + " " + shiftPath(t, 800);
}
function buildE(): string {
  const flutter = Array.from({ length: 10 }, (_, i) => {
    const x0 = i * 40;
    return `L${x0},60 L${x0 + 15},50 L${x0 + 30},65 L${x0 + 40},60`;
  }).join(" ");
  const t =
    `M0,60 ${flutter} ` +
    "L390,60 L395,20 L403,60 L411,80 L420,60 L440,60 " +
    Array.from({ length: 9 }, (_, i) => {
      const x0 = 440 + i * 40;
      return `L${x0},60 L${x0 + 15},50 L${x0 + 30},65 L${x0 + 40},60`;
    }).join(" ") +
    " L800,60";
  return t + " " + shiftPath(t, 800);
}

const ECG_BUILDERS = [buildA, buildB, buildC, buildD, buildE];
const GRAD_COLORS: Array<[string, string]> = [
  ["#2dd4bf", "#38bdf8"],
  ["#34d399", "#60a5fa"],
  ["#5eead4", "#818cf8"],
  ["#22d3ee", "#a78bfa"],
  ["#2dd4bf", "#93c5fd"],
  ["#6ee7b7", "#67e8f9"],
  ["#38bdf8", "#c4b5fd"],
];

function EcgLine({ y, opacity, duration, designIndex, lineIndex }: {
  y: string; opacity: number; duration: number; designIndex: number; lineIndex: number;
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
      transition={{ duration, repeat: Infinity, ease: "linear", repeatType: "loop" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={c1} stopOpacity="0" />
          <stop offset="15%" stopColor={c1} stopOpacity="1" />
          <stop offset="85%" stopColor={c2} stopOpacity="1" />
          <stop offset="100%" stopColor={c2} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={pathData} fill="none" stroke={`url(#${gradId})`}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </motion.svg>
  );
}

const ECG_LINES = [
  { y: "5%",  opacity: 0.09, duration: 16, design: 0 },
  { y: "17%", opacity: 0.16, duration: 12, design: 1 },
  { y: "30%", opacity: 0.26, duration: 9,  design: 2 },
  { y: "47%", opacity: 0.36, duration: 7,  design: 3 },
  { y: "61%", opacity: 0.26, duration: 10, design: 4 },
  { y: "76%", opacity: 0.16, duration: 13, design: 2 },
  { y: "89%", opacity: 0.09, duration: 17, design: 1 },
];

/* ═══════════════════════ PAGE ═══════════════════════ */
export default function Home() {
  return (
    <div className="overflow-x-hidden">

      {/* ── HERO ── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
        <div className="pointer-events-none absolute inset-0 -z-10 animate-[gradientShift_12s_ease_infinite] bg-[length:200%_200%] bg-gradient-to-br from-teal-600 via-teal-700 to-blue-800" />
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <Orb className="-left-24 -top-24 h-[420px] w-[420px] bg-teal-400/20" duration={18} animate={{ x: [0,60,0], y: [0,40,0] }} />
          <Orb className="-bottom-32 -right-32 h-[500px] w-[500px] bg-blue-500/20" duration={22} animate={{ x: [0,-50,0], y: [0,-60,0] }} />
          <Orb className="left-1/2 top-1/3 h-[300px] w-[300px] -translate-x-1/2 bg-indigo-400/10" duration={14} animate={{ scale: [1,1.15,1] }} />
        </div>

        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          {ECG_LINES.map((line, i) => (
            <EcgLine key={i} y={line.y} opacity={line.opacity} duration={line.duration}
              designIndex={line.design} lineIndex={i} />
          ))}
        </div>

        <motion.div className="relative z-10 flex flex-col items-center gap-6"
          initial="hidden" animate="visible" variants={stagger}>
          <motion.div variants={fadeUp} custom={0}><Logo size="lg" /></motion.div>
          <motion.h1 variants={fadeUp} custom={1}
            className="text-5xl font-bold tracking-tight text-white sm:text-7xl">
            Valeon
          </motion.h1>
          <motion.p variants={fadeUp} custom={2}
            className="max-w-lg text-lg font-medium text-white/80 sm:text-xl">
            Your Premium AI Health Companion
          </motion.p>
          <motion.div variants={fadeUp} custom={3}
            className="mt-4 flex flex-wrap items-center justify-center gap-4">
            <Link href="/signup"
              className="rounded-full bg-white px-8 py-3 text-sm font-semibold text-teal-700 shadow-lg transition hover:bg-white/90 hover:shadow-xl">
              Join Now
            </Link>
            <Link href="/login"
              className="rounded-full border border-white/40 bg-white/10 px-8 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20">
              Sign In
            </Link>
          </motion.div>
        </motion.div>

        <motion.div className="absolute bottom-8 z-10"
          animate={{ y: [0,10,0] }} transition={{ duration: 2, repeat: Infinity }}>
          <div className="h-8 w-5 rounded-full border-2 border-white/40 p-1">
            <div className="mx-auto h-2 w-1 rounded-full bg-white/60" />
          </div>
        </motion.div>
      </section>

      {/* ── BELOW-FOLD WRAPPER — shared ambient background ── */}
      <div className="section-bg">

        {/* ambient orbs shared across all below-fold sections */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <Orb className="-left-48 top-[10%] h-[600px] w-[600px] bg-teal-500/5" duration={25} animate={{ x: [0,80,0], y: [0,60,0] }} />
          <Orb className="-right-48 top-[35%] h-[500px] w-[500px] bg-blue-600/5" duration={30} animate={{ x: [0,-60,0], y: [0,80,0] }} />
          <Orb className="left-1/4 top-[65%] h-[400px] w-[400px] bg-indigo-500/4" duration={20} animate={{ scale: [1,1.2,1] }} />
          <Orb className="right-1/4 top-[80%] h-[350px] w-[350px] bg-teal-400/4" duration={22} animate={{ x: [0,40,0], y: [0,-40,0] }} />
        </div>

        {/* ── ABOUT ── */}
        <Section id="about" className="relative mx-auto max-w-4xl px-6 py-28">
          <motion.div variants={cardVariant}
            className="glass-card rounded-3xl p-10 text-center sm:p-14 dark:glass-card">
            {/* teal top accent bar */}
            <div className="mx-auto mb-8 h-1 w-16 rounded-full bg-gradient-to-r from-teal-400 to-blue-400" />
            <motion.h2 variants={fadeUp} custom={0}
              className="mb-6 text-3xl font-bold sm:text-4xl gradient-text">
              About Valeon
            </motion.h2>
            <motion.p variants={fadeUp} custom={1}
              className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-400">
              Valeon brings the power of artificial intelligence to personal
              healthcare. From intelligent health conversations to advanced
              medical imaging analysis, Valeon provides accessible, reliable
              insights—helping you make informed decisions about your
              well-being, anytime, anywhere.
            </motion.p>
          </motion.div>
        </Section>

        {/* ── FEATURES ── */}
        <Section id="features" className="relative mx-auto max-w-6xl px-6 py-28">
          <motion.div variants={fadeUp} custom={0} className="mb-14 text-center">
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-gradient-to-r from-teal-400 to-blue-400" />
            <h2 className="text-3xl font-bold sm:text-4xl gradient-text">Powerful Features</h2>
            <p className="mt-3 text-slate-500">Everything you need for AI-driven health insights</p>
          </motion.div>

          <motion.div variants={stagger} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                variants={cardVariant}
                custom={i}
                whileHover={{ y: -8, transition: { duration: 0.25 } }}
                className="glass-card group cursor-default rounded-2xl p-8 transition-all duration-300"
              >
                {/* coloured top border per card */}
                <div className={`mb-5 h-0.5 w-full rounded-full bg-gradient-to-r ${f.color} opacity-60`} />
                <div className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${f.color} text-white shadow-md`}>
                  <f.icon size={22} />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">{f.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </Section>

        {/* ── CONTACT ── */}
        <Section id="contact" className="relative mx-auto max-w-2xl px-6 py-28">
          <motion.div variants={fadeUp} custom={0} className="mb-10 text-center">
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-gradient-to-r from-teal-400 to-blue-400" />
            <h2 className="text-3xl font-bold sm:text-4xl gradient-text">Get in Touch</h2>
          </motion.div>

          <motion.form variants={cardVariant} onSubmit={(e) => e.preventDefault()}
            className="glass-card flex flex-col gap-5 rounded-3xl p-8 sm:p-10">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-300">Name</span>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur focus-within:border-teal-500/50 transition-colors">
                <FiUser className="text-slate-400" />
                <input type="text" placeholder="Your name"
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
              </div>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-300">Email</span>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur focus-within:border-teal-500/50 transition-colors">
                <FiMail className="text-slate-400" />
                <input type="email" placeholder="you@example.com"
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
              </div>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-300">Message</span>
              <textarea rows={4} placeholder="How can we help?"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none backdrop-blur placeholder:text-slate-500 focus:border-teal-500/50 transition-colors" />
            </label>
            <button type="submit"
              className="mt-2 inline-flex items-center justify-center gap-2 self-end rounded-full bg-gradient-to-r from-teal-500 to-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:shadow-[0_0_24px_rgba(45,212,191,0.4)] hover:brightness-110">
              <FiSend size={16} />
              Send Message
            </button>
          </motion.form>
        </Section>

        {/* ── FOOTER ── */}
        <footer className="relative border-t border-white/8 bg-black/20 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-10 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-3">
              <Logo size="sm" />
              <span className="text-sm font-semibold text-white">Valeon</span>
            </div>
            <nav className="flex gap-6 text-sm text-slate-400">
              <a href="#about" className="transition hover:text-teal-400">About</a>
              <a href="#features" className="transition hover:text-teal-400">Features</a>
              <a href="#contact" className="transition hover:text-teal-400">Contact</a>
            </nav>
            <p className="text-xs text-slate-500">
              &copy; {new Date().getFullYear()} Valeon. All rights reserved.
            </p>
          </div>
        </footer>

      </div>{/* end section-bg */}
    </div>
  );
}

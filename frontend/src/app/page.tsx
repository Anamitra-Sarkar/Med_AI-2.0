"use client";

import Link from "next/link";
import { motion } from "framer-motion";
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
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";

const features = [
  {
    icon: FiMessageCircle,
    title: "AI Health Chat",
    desc: "Thoughtful, context-aware conversations for everyday health questions and guidance.",
  },
  {
    icon: FiEye,
    title: "ClearView Cataract Screening",
    desc: "AI-powered eye analysis for early cataract detection and monitoring.",
  },
  {
    icon: FiActivity,
    title: "RetinaGuard DR Grading",
    desc: "Diabetic retinopathy detection and severity grading in a clinical-grade layout.",
  },
  {
    icon: FiShield,
    title: "NephroScan CT Analysis",
    desc: "Kidney CT interpretation designed for fast, confident review.",
  },
  {
    icon: FiCamera,
    title: "DermaVision Skin Analysis",
    desc: "Skin condition classification with a clear, readable result flow.",
  },
  {
    icon: FiHeart,
    title: "CardioInsight MRI Classifier",
    desc: "Cardiac MRI analysis tailored for modern medical workflows.",
  },
];

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (!isFirebaseConfigured()) router.replace("/home");
  }, [router]);

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 80% 40% at 50% -10%, color-mix(in oklch, var(--primary) 8%, transparent), transparent)",
      }}
    >
      <section className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-16">
        <div className="grid w-full gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-8 text-left">
            <Logo size="lg" />
            <div className="space-y-4">
              <h1
                className="max-w-xl text-[clamp(3rem,8vw,5.5rem)] leading-[0.95] text-foreground"
                style={{ fontFamily: "'Instrument Serif', serif" }}
              >
                Premium medical AI, designed with clarity.
              </h1>
              <p className="max-w-xl text-[var(--text-base)] text-muted-foreground">
                Valeon brings clinical precision and modern AI into one calm, confident workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className="btn-primary inline-flex items-center justify-center gap-2">
                Join Now
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-[var(--radius)] border border-border bg-surface-1 px-5 py-2.5 text-sm font-medium text-foreground transition-[background-color,box-shadow,transform] duration-200 hover:bg-surface-offset hover:shadow-[var(--shadow-sm)]"
              >
                Sign In
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((feature) => (
              <motion.div
                key={feature.title}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.2 }}
                className="rounded-[var(--radius)] border border-border bg-surface-1 p-5 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]"
              >
                <feature.icon size={20} className="text-primary" />
                <h3 className="mt-4 text-base font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-[clamp(3rem,6vw,6rem)]">
        <div className="grid gap-6 rounded-[16px] border border-border bg-surface-1 p-6 shadow-[var(--shadow-sm)] lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2
              className="text-[var(--text-xl)] text-foreground"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              Built for calm, trustworthy health workflows.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Clear visual hierarchy, restrained color, and a focused interface help the app feel less like a demo and more like a premium product.
            </p>
          </div>
          <form className="grid gap-3">
            <input
              type="text"
              placeholder="Name"
              className="rounded-[var(--radius)] border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_15%,transparent)]"
            />
            <input
              type="email"
              placeholder="Email"
              className="rounded-[var(--radius)] border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_15%,transparent)]"
            />
            <button type="button" className="btn-primary inline-flex items-center justify-center gap-2">
              <FiSend size={16} />
              Send Message
            </button>
          </form>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-[clamp(3rem,6vw,6rem)]">
        <div className="flex items-center gap-3">
          <FiUser className="text-primary" />
          <FiMail className="text-primary" />
          <span className="text-sm text-muted-foreground">Clinical precision. Modern AI. No visual clutter.</span>
        </div>
      </section>
    </div>
  );
}

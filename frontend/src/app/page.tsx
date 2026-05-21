"use client";

import Link from "next/link";
import {
  FiMessageCircle,
  FiEye,
  FiActivity,
  FiHeart,
  FiShield,
  FiCamera,
  FiSend,
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
    <div className="bg-background text-foreground">
      <div className="hero-mesh relative min-h-screen overflow-hidden noise-overlay">
        <div className="absolute inset-0 grid-pattern opacity-[0.35]" />

        <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-between px-6 py-8">
          <div className="flex items-center justify-between">
            <Logo size="sm" />
            <div className="flex items-center gap-3">
              <Link href="/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                Sign in
              </Link>
              <Link href="/signup" className="btn-primary text-sm">
                Get started
              </Link>
            </div>
          </div>

          <div className="grid items-center gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="flex flex-col gap-6 lg:max-w-[65%]">
              <span className="mono-label">Medical AI Platform — v2.0</span>
              <h1 className="hero-type text-[clamp(3.5rem,9vw,7rem)] text-foreground">
                Clinical AI,
                <br />
                <em>refined</em> for
                <br />
                real workflows.
              </h1>
              <p className="max-w-lg text-[var(--text-base)] leading-relaxed text-muted-foreground">
                Valeon combines diagnostic imaging AI, health chat, and nearby care — in one workspace built for clarity and speed.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link href="/signup" className="btn-primary inline-flex items-center gap-2 text-sm">
                  Start for free
                  <FiSend size={13} />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-border bg-transparent px-5 py-2.5 text-sm text-foreground transition-all hover:bg-surface-1 hover:shadow-[var(--shadow-sm)]"
                >
                  Already a member
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="surface-shimmer relative overflow-hidden rounded-2xl border border-border p-7 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)] lg:col-span-2">
                <FiMessageCircle size={24} className="text-primary" />
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">AI Health Chat</h3>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Thoughtful, context-aware conversations for everyday health questions — with your full profile in context.
                </p>
                <div className="absolute bottom-6 right-6 flex gap-1">
                  {["Symptoms", "Medications", "Lifestyle"].map((tag) => (
                    <span key={tag} className="rounded-full border border-border bg-surface-offset px-2.5 py-0.5 text-[10px] text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="surface-shimmer relative overflow-hidden rounded-2xl border border-border p-7 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]">
                <FiEye size={24} className="text-primary" />
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">ClearView Cataract</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  AI-powered eye analysis for early detection and monitoring.
                </p>
              </div>

              {features.slice(2).map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-border bg-surface-1 p-5 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
                >
                  <feature.icon size={18} className="text-primary" />
                  <h3 className="mt-4 text-sm font-semibold text-foreground">{feature.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pb-4">
            <div className="h-px w-12 bg-border" />
            <span className="mono-label">6 AI modules</span>
          </div>
        </div>
      </div>

      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8">
          <span className="mono-label">Not a substitute for professional medical advice</span>
          <Link href="/signup" className="btn-primary text-sm">
            Get started →
          </Link>
        </div>
      </section>
    </div>
  );
}

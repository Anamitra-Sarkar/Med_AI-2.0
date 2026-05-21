"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FcGoogle } from "react-icons/fc";
import { FiMail, FiLock } from "react-icons/fi";
import AppLoadingScreen from "@/components/AppLoadingScreen";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

export default function LoginPage() {
  const { user, loading: authLoading, signIn, signInWithGoogle } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!authLoading && user) router.replace("/home");
  }, [authLoading, user, router]);

   async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEmailError("");
    setPasswordError("");
    setFormError("");

    let valid = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address.");
      valid = false;
    }
    if (!password) {
      setPasswordError("Password is required.");
      valid = false;
    }
    if (!valid) return;

    setSubmitting(true);
    try {
      await signIn(email, password);
      router.push("/home");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setSubmitting(true);
    setFormError("");
    try {
      const signedInUser = await signInWithGoogle();
      if (signedInUser) router.push("/home");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || (!authLoading && user)) {
    return <AppLoadingScreen message="Checking your sign-in…" />;
  }

  return (
    <div className="hero-mesh relative min-h-screen overflow-hidden px-4 py-16 text-foreground noise-overlay">
      <div className="absolute inset-0 grid-pattern opacity-30 pointer-events-none" />
      <div className="relative flex min-h-screen items-center justify-center">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-md"
        >
          <motion.div variants={itemVariants} className="mb-6 text-center">
            <Logo size="sm" />
            <span className="mono-label mt-3 block">Secure Access</span>
          </motion.div>

          <motion.div variants={itemVariants} className="rounded-2xl border border-border bg-surface-1 p-8 shadow-[var(--shadow-lg)]">
            <motion.h1
              variants={itemVariants}
              className="hero-type text-3xl text-foreground"
            >
              Welcome back.
            </motion.h1>
            <motion.p variants={itemVariants} className="mt-2 text-sm text-muted-foreground">
              Sign in to continue with Valeon
            </motion.p>

            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
              <motion.div variants={itemVariants}>
                <label htmlFor="email" className="mb-2 block text-[var(--text-sm)] font-medium text-foreground">
                  Email
                </label>
                <div className="flex items-center gap-2 rounded-[var(--radius)] border border-border bg-background px-4 py-2.5 transition focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_15%,transparent)]">
                  <FiMail className="shrink-0 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-label="Email address"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
                {emailError && <p className="mt-1 text-sm text-red-600">{emailError}</p>}
              </motion.div>

              <motion.div variants={itemVariants}>
                <label htmlFor="password" className="mb-2 block text-[var(--text-sm)] font-medium text-foreground">
                  Password
                </label>
                <div className="flex items-center gap-2 rounded-[var(--radius)] border border-border bg-background px-4 py-2.5 transition focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_15%,transparent)]">
                  <FiLock className="shrink-0 text-muted-foreground" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    aria-label="Password"
                    autoComplete="current-password"
                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
                {passwordError && <p className="mt-1 text-sm text-red-600">{passwordError}</p>}
              </motion.div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <motion.button
                variants={itemVariants}
                type="submit"
                disabled={submitting}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="btn-primary mt-2 w-full disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Signing in…" : "Sign In"}
              </motion.button>
            </form>

            <motion.div variants={itemVariants} className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </motion.div>

            <motion.button
              variants={itemVariants}
              type="button"
              onClick={handleGoogle}
              disabled={submitting}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="flex w-full items-center justify-center gap-3 rounded-[var(--radius)] border border-border bg-background py-3 text-sm font-medium text-foreground transition hover:bg-surface-offset disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FcGoogle size={20} />
              Sign In with Google
            </motion.button>

            <motion.p variants={itemVariants} className="mt-8 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-medium text-primary">
                Join Now
              </Link>
            </motion.p>
          </motion.div>
          <p className="mt-4 text-center mono-label opacity-60">Protected by Firebase Authentication</p>
        </motion.div>
      </div>
    </div>
  );
}

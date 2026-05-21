"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FcGoogle } from "react-icons/fc";
import { FiMail, FiLock, FiUser } from "react-icons/fi";
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

export default function SignUpPage() {
  const { user, loading: authLoading, signUp, signInWithGoogle } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!authLoading && user) router.replace("/home");
  }, [authLoading, user, router]);

  function validate(): boolean {
    setNameError("");
    setEmailError("");
    setPasswordError("");
    setConfirmError("");
    setFormError("");

    let valid = true;
    if (!name.trim()) {
      setNameError("Name is required.");
      valid = false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address.");
      valid = false;
    }
    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      valid = false;
    }
    if (password !== confirmPassword) {
      setConfirmError("Passwords do not match.");
      valid = false;
    }
    return valid;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await signUp(email, password);
      router.push("/profile/create");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setSubmitting(true);
    setFormError("");
    try {
      const signedInUser = await signInWithGoogle();
      if (signedInUser) router.push("/profile/create");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || (!authLoading && user)) {
    return <AppLoadingScreen message="Setting up your account…" />;
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
              Join Valeon.
            </motion.h1>
            <motion.p variants={itemVariants} className="mt-2 text-sm text-muted-foreground">
              Start your health journey with Valeon
            </motion.p>

            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
              <motion.div variants={itemVariants}>
                <label htmlFor="name" className="mb-2 block text-[var(--text-sm)] font-medium text-foreground">
                  Name
                </label>
                <div className="flex items-center gap-2 rounded-[var(--radius)] border border-border bg-background px-4 py-2.5 transition focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_15%,transparent)]">
                  <FiUser className="shrink-0 text-muted-foreground" />
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    aria-label="Full name"
                    autoComplete="name"
                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
                {nameError && <p className="mt-1 text-sm text-red-600">{nameError}</p>}
              </motion.div>

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
                    placeholder="Min. 6 characters"
                    aria-label="Password"
                    autoComplete="new-password"
                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
                {passwordError && <p className="mt-1 text-sm text-red-600">{passwordError}</p>}
              </motion.div>

              <motion.div variants={itemVariants}>
                <label htmlFor="confirmPassword" className="mb-2 block text-[var(--text-sm)] font-medium text-foreground">
                  Confirm Password
                </label>
                <div className="flex items-center gap-2 rounded-[var(--radius)] border border-border bg-background px-4 py-2.5 transition focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_15%,transparent)]">
                  <FiLock className="shrink-0 text-muted-foreground" />
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    aria-label="Confirm password"
                    autoComplete="new-password"
                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
                {confirmError && <p className="mt-1 text-sm text-red-600">{confirmError}</p>}
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
                {submitting ? "Creating account…" : "Sign Up"}
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
              Sign Up with Google
            </motion.button>

            <motion.p variants={itemVariants} className="mt-8 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary">
                Sign In
              </Link>
            </motion.p>
          </motion.div>
          <p className="mt-4 text-center mono-label opacity-60">Protected by Firebase Authentication</p>
        </motion.div>
      </div>
    </div>
  );
}

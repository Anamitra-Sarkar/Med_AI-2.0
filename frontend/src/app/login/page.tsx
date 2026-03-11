"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FcGoogle } from "react-icons/fc";
import { FiMail, FiLock } from "react-icons/fi";
import toast from "react-hot-toast";
import AppLoadingScreen from "@/components/AppLoadingScreen";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";

/* ─── animation variants ─── */
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

  useEffect(() => {
    if (!authLoading && user) router.replace("/home");
  }, [authLoading, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (!password) {
      toast.error("Password is required");
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email, password);
      toast.success("Welcome back!");
      router.push("/home");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setSubmitting(true);
    try {
      const signedInUser = await signInWithGoogle();
      if (signedInUser) {
        toast.success("Signed in with Google!");
        router.push("/home");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || (!authLoading && user)) {
    return <AppLoadingScreen message="Checking your sign-in…" />;
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
        className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl sm:p-10"
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
          Welcome Back
        </motion.h1>
        <motion.p
          variants={itemVariants}
          className="mb-8 text-center text-sm text-white/60"
        >
          Sign in to continue with Valeon
        </motion.p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <motion.div variants={itemVariants}>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-white/80">
              Email
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 transition-all focus-within:border-teal-400 focus-within:shadow-[0_0_12px_rgba(20,184,166,0.3)]">
              <FiMail className="shrink-0 text-white/40" />
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
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              />
            </div>
          </motion.div>

          {/* Password */}
          <motion.div variants={itemVariants}>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-white/80">
              Password
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 transition-all focus-within:border-teal-400 focus-within:shadow-[0_0_12px_rgba(20,184,166,0.3)]">
              <FiLock className="shrink-0 text-white/40" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                aria-label="Password"
                autoComplete="current-password"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              />
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
                "Sign In"
              )}
            </motion.button>
          </motion.div>
        </form>

        {/* Divider */}
        <motion.div variants={itemVariants} className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/15" />
          <span className="text-xs text-white/40">or</span>
          <div className="h-px flex-1 bg-white/15" />
        </motion.div>

        {/* Google */}
        <motion.div variants={itemVariants}>
          <motion.button
            type="button"
            onClick={handleGoogle}
            disabled={submitting}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FcGoogle size={20} />
            Sign In with Google
          </motion.button>
        </motion.div>

        {/* Link to signup */}
        <motion.p
          variants={itemVariants}
          className="mt-8 text-center text-sm text-white/50"
        >
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-teal-300 transition hover:text-teal-200">
            Join Now
          </Link>
        </motion.p>
      </motion.div>
    </div>
  );
}

import type { NextConfig } from "next";

const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
});

const nextConfig: NextConfig = {
  turbopack: {},
  images: {
    remotePatterns: [
      { protocol: "https" as const, hostname: "lh3.googleusercontent.com" },
      { protocol: "https" as const, hostname: "firebasestorage.googleapis.com" },
      { protocol: "https" as const, hostname: "storage.googleapis.com" },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:7860",
  },
};

export default withPWA(nextConfig);

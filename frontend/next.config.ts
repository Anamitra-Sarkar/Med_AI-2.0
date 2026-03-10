import type { NextConfig } from "next";

// next-pwa v5 uses require() — types not available as ESM
const withPWA = require("next-pwa")({
  dest: "public",
  // Disable in development so hot-reload is not affected
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  // Remove any stale hand-written sw.js so next-pwa's generated one wins
  sw: "sw.js",
  // Workbox runtime caching strategies
  runtimeCaching: [
    {
      // Network-first for all Valeon API calls (HuggingFace Space backend)
      urlPattern: /^https:\/\/.*\.hf\.space\/api\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "valeon-api-cache",
        networkTimeoutSeconds: 15,
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      // Network-first for local API (dev / self-hosted)
      urlPattern: /^\/api\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "local-api-cache",
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 60 * 60, // 1 hour
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      // Stale-while-revalidate for Google Fonts stylesheets
      urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      // Cache-first for all static Next.js assets (_next/static)
      urlPattern: /\/_next\/static\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "next-static-assets",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      // Stale-while-revalidate for Next.js image optimisation
      urlPattern: /\/_next\/image\?.*/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "next-image-cache",
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      // Network-first for all page navigations
      urlPattern: /^https:\/\/valeon-ai-med\.vercel\.app\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "valeon-pages",
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
  // Offline fallback — show /offline.html if a page navigation fails
  fallbacks: {
    document: "/offline.html",
  },
  // Prevent next-pwa from injecting a conflicting service worker in public/
  // (we want only the generated workbox-based one)
  buildExcludes: [/middleware-manifest\.json$/],
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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            // Required for service worker scope
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);

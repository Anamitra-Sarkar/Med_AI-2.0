import type { Metadata, Viewport } from "next";
import Providers from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Valeon – Medical AI",
    template: "%s | Valeon",
  },
  description: "AI-powered medical diagnostic assistant — cataract screening, retinopathy, kidney, skin & cardiac analysis.",
  manifest: "/manifest.json",
  // iOS Safari PWA
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Valeon",
    startupImage: ["/icons/icon-512x512.png"],
  },
  // Android / general
  applicationName: "Valeon",
  keywords: ["medical AI", "cataract", "retinopathy", "health", "diagnostic"],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.svg",
  },
  other: {
    // Force iOS to use standalone mode (belt-and-suspenders alongside appleWebApp)
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Valeon",
    // Microsoft tiles
    "msapplication-TileColor": "#0d9488",
    "msapplication-TileImage": "/icons/icon-144x144.png",
    "msapplication-config": "none",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
    { media: "(prefers-color-scheme: light)", color: "#0d9488" },
  ],
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

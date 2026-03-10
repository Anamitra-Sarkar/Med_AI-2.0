"use client";

/**
 * ScreenshotDetector — mounted globally in layout.tsx.
 *
 * Detects screenshot attempts via multiple signals and dispatches a
 * custom  window event  "valeon:screenshot"  that any component can
 * listen to with:
 *
 *   window.addEventListener('valeon:screenshot', handler)
 *
 * Detection vectors covered:
 *  1. PrintScreen key (Windows / Linux)
 *  2. Meta+Shift+3 and Meta+Shift+4  (macOS native screenshots)
 *  3. Ctrl+P / Cmd+P  (Print dialog — often used to save as PDF)
 *  4. CSS @media print  (catches both Ctrl+P and any print-to-PDF)
 *  5. visibilitychange  (Android / iOS screenshot briefly hides the page)
 *
 * NOTE: Browser sandboxing means no approach is 100% reliable.
 * Use the event to log, warn, or watermark — not to "block" screenshots.
 */

import { useEffect } from "react";

function dispatchScreenshotEvent(method: string) {
  const event = new CustomEvent("valeon:screenshot", {
    detail: { method, ts: new Date().toISOString() },
    bubbles: false,
    cancelable: false,
  });
  window.dispatchEvent(event);
}

export default function ScreenshotDetector() {
  useEffect(() => {
    // ── 1 & 2 & 3: Keyboard shortcuts ────────────────────────────────────
    function handleKeyDown(e: KeyboardEvent) {
      const { key, code, metaKey, ctrlKey, shiftKey } = e;

      // PrintScreen (Windows/Linux)
      if (key === "PrintScreen" || code === "PrintScreen") {
        dispatchScreenshotEvent("keyboard:printscreen");
        return;
      }

      // macOS: Cmd+Shift+3 (full screen) or Cmd+Shift+4 (area)
      if (metaKey && shiftKey && (key === "3" || key === "4" || key === "#" || key === "$")) {
        dispatchScreenshotEvent("keyboard:macos-screenshot");
        return;
      }

      // Ctrl+P or Cmd+P (print / save as PDF)
      if ((ctrlKey || metaKey) && (key === "p" || key === "P")) {
        dispatchScreenshotEvent("keyboard:print");
        // Do NOT call e.preventDefault() here — allow the print dialog.
      }
    }

    // ── 4: @media print (CSS / print dialog) ─────────────────────────────
    const printMQ = window.matchMedia("print");
    function handlePrintMQ(e: MediaQueryListEvent) {
      if (e.matches) dispatchScreenshotEvent("media:print");
    }

    // ── 5: visibilitychange (mobile screenshot gesture) ───────────────────
    function handleVisibilityChange() {
      // Visibility goes hidden briefly on iOS/Android during screenshot;
      // we fire when the page becomes visible again (screenshot is done).
      if (document.visibilityState === "visible") {
        // Heuristic: only fire if the previous hide was very short (<= 800ms)
        // to avoid false positives from tab switching.
        const now = Date.now();
        const hiddenAt = (handleVisibilityChange as unknown as { _hiddenAt?: number })._hiddenAt;
        if (hiddenAt && now - hiddenAt <= 800) {
          dispatchScreenshotEvent("visibility:mobile-screenshot");
        }
      } else {
        (handleVisibilityChange as unknown as { _hiddenAt: number })._hiddenAt = Date.now();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    printMQ.addEventListener("change", handlePrintMQ);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      printMQ.removeEventListener("change", handlePrintMQ);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Renders nothing — purely a side-effect component
  return null;
}

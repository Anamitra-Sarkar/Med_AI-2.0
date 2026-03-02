"use client";

import { useState, useCallback, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiX,
  FiMapPin,
  FiNavigation,
  FiPhone,
  FiExternalLink,
  FiAlertCircle,
} from "react-icons/fi";
import toast from "react-hot-toast";
import { getNearbyPlaces, type Place } from "@/lib/api";

const NearbyMap = lazy(() => import("./NearbyMap"));

interface NearbyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "all" | "hospital" | "clinic" | "pharmacy";

const tabs: { key: Tab; label: string; emoji: string }[] = [
  { key: "all", label: "All", emoji: "🗺️" },
  { key: "hospital", label: "Hospitals", emoji: "🏥" },
  { key: "clinic", label: "Clinics", emoji: "🏨" },
  { key: "pharmacy", label: "Pharmacies", emoji: "💊" },
];

export default function NearbyModal({ isOpen, onClose }: NearbyModalProps) {
  const [step, setStep] = useState<
    "ask" | "loading" | "results" | "denied" | "error"
  >("ask");
  const [places, setPlaces] = useState<Place[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [userCoords, setUserCoords] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const reset = useCallback(() => {
    setStep("ask");
    setPlaces([]);
    setActiveTab("all");
    setUserCoords(null);
    setErrorMsg("");
  }, []);

  function handleClose() {
    reset();
    onClose();
  }

  function handleAllow() {
    setStep("loading");

    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      setStep("error");
      setErrorMsg("Geolocation is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          setUserCoords({ lat: latitude, lon: longitude });
          const data = await getNearbyPlaces(latitude, longitude, 3000);
          setPlaces(data.results);
          setStep("results");
        } catch {
          toast.error("Failed to fetch nearby places");
          setStep("error");
          setErrorMsg(
            "Could not fetch nearby healthcare locations. Please try again."
          );
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStep("denied");
        } else if (err.code === err.TIMEOUT) {
          setStep("error");
          setErrorMsg("Location request timed out. Please try again.");
        } else {
          setStep("error");
          setErrorMsg("Location unavailable. Please check your device settings.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  const filteredPlaces =
    activeTab === "all" ? places : places.filter((p) => p.type === activeTab);

  const activeTypeFilter = activeTab === "all" ? null : activeTab;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/15 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl"
          >
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FiMapPin className="text-teal-400" size={22} />
                <h2 className="text-lg font-bold text-white sm:text-xl">
                  Nearby Care Locator
                </h2>
              </div>
              <motion.button
                onClick={handleClose}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Close modal"
              >
                <FiX size={20} />
              </motion.button>
            </div>

            {/* ── Permission request ── */}
            {step === "ask" && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="py-8 text-center"
              >
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-500/20">
                  <FiNavigation size={28} className="text-teal-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">
                  Location Access Required
                </h3>
                <p className="mx-auto mb-6 max-w-xs text-sm text-white/60">
                  Valeon needs your location to show nearby doctors, hospitals,
                  clinics, and pharmacies on an interactive map.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <motion.button
                    onClick={() => setStep("denied")}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="rounded-xl border border-white/15 bg-white/5 px-6 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10"
                  >
                    Deny
                  </motion.button>
                  <motion.button
                    onClick={handleAllow}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="rounded-xl bg-gradient-to-r from-teal-500 to-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg"
                  >
                    Allow
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ── Loading ── */}
            {step === "loading" && (
              <div className="flex flex-col items-center justify-center py-12">
                <motion.div
                  className="h-10 w-10 rounded-full border-4 border-teal-500 border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                <p className="mt-4 text-sm text-white/60">
                  Finding nearby facilities…
                </p>
                {/* Loading skeleton */}
                <div className="mt-6 w-full space-y-3">
                  {[1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.4, 0.8, 0.4] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        delay: i * 0.2,
                      }}
                      className="h-14 rounded-xl bg-white/5"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Denied ── */}
            {step === "denied" && (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20">
                  <FiAlertCircle size={24} className="text-red-400" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-white">
                  Location Access Denied
                </h3>
                <p className="mx-auto mb-6 max-w-xs text-sm text-white/60">
                  Please enable location permissions in your browser settings to
                  use this feature.
                </p>
                <motion.button
                  onClick={() => setStep("ask")}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="rounded-xl border border-white/15 bg-white/5 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                >
                  Try Again
                </motion.button>
              </div>
            )}

            {/* ── Error ── */}
            {step === "error" && (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20">
                  <FiAlertCircle size={24} className="text-amber-400" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-white">
                  Something went wrong
                </h3>
                <p className="mx-auto mb-6 max-w-xs text-sm text-white/60">
                  {errorMsg || "An unexpected error occurred. Please try again."}
                </p>
                <motion.button
                  onClick={() => setStep("ask")}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="rounded-xl border border-white/15 bg-white/5 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                >
                  Try Again
                </motion.button>
              </div>
            )}

            {/* ── Results ── */}
            {step === "results" && userCoords && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {/* Leaflet Map */}
                <div className="mb-4 overflow-hidden rounded-2xl border border-white/10 shadow-lg">
                  <Suspense
                    fallback={
                      <div className="h-[300px] w-full animate-pulse rounded-2xl bg-white/5" />
                    }
                  >
                    <NearbyMap
                      userLat={userCoords.lat}
                      userLon={userCoords.lon}
                      places={places}
                      activeType={activeTypeFilter}
                    />
                  </Suspense>
                </div>

                {/* Tabs */}
                <div className="mb-4 flex gap-1 rounded-xl bg-white/5 p-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
                        activeTab === tab.key
                          ? "bg-gradient-to-r from-teal-500 to-blue-600 text-white shadow"
                          : "text-white/50 hover:text-white/70"
                      }`}
                    >
                      <span className="mr-1">{tab.emoji}</span>
                      {tab.label}
                      {tab.key !== "all" && (
                        <span className="ml-1 opacity-70">
                          ({places.filter((p) => p.type === tab.key).length})
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Place list */}
                <div className="max-h-[35vh] space-y-2 overflow-y-auto">
                  {filteredPlaces.length > 0 ? (
                    filteredPlaces.map((place, i) => {
                      const osmLink = `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=17/${place.lat}/${place.lon}`;
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="group rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:border-teal-500/30 hover:bg-white/8"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h4 className="truncate text-sm font-medium text-white">
                                {place.name}
                              </h4>
                              <span
                                className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize"
                                style={{
                                  background:
                                    place.type === "hospital"
                                      ? "rgba(239,68,68,0.15)"
                                      : place.type === "clinic"
                                        ? "rgba(59,130,246,0.15)"
                                        : "rgba(16,185,129,0.15)",
                                  color:
                                    place.type === "hospital"
                                      ? "#f87171"
                                      : place.type === "clinic"
                                        ? "#60a5fa"
                                        : "#34d399",
                                }}
                              >
                                {place.type}
                              </span>
                              {place.address && (
                                <p className="mt-1 text-xs text-white/50">
                                  {place.address}
                                </p>
                              )}
                              {place.opening_hours && (
                                <p className="mt-1 text-xs text-white/40">
                                  🕐 {place.opening_hours}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 flex-col gap-1">
                              {place.phone && (
                                <a
                                  href={`tel:${place.phone}`}
                                  className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-teal-400"
                                  aria-label="Call"
                                >
                                  <FiPhone size={14} />
                                </a>
                              )}
                              <a
                                href={osmLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-teal-400"
                                aria-label="Open in OpenStreetMap"
                              >
                                <FiExternalLink size={14} />
                              </a>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="py-10 text-center">
                      <p className="text-sm text-white/40">
                        No{" "}
                        {activeTab === "all"
                          ? "facilities"
                          : activeTab === "pharmacy"
                            ? "pharmacies"
                            : activeTab + "s"}{" "}
                        found within 3 km.
                      </p>
                      <p className="mt-1 text-xs text-white/25">
                        Try expanding the search area or checking a different
                        category.
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer attribution */}
                <p className="mt-3 text-center text-xs text-white/20">
                  Map data © OpenStreetMap contributors · Powered by Overpass
                  API
                </p>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

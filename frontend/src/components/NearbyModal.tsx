"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiX, FiMapPin, FiStar, FiNavigation } from "react-icons/fi";
import toast from "react-hot-toast";
import { getNearbyPlaces, type Place } from "@/lib/api";

interface NearbyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "doctors" | "clinics" | "pharmacies";

const tabs: { key: Tab; label: string }[] = [
  { key: "doctors", label: "Doctors" },
  { key: "clinics", label: "Clinics" },
  { key: "pharmacies", label: "Medicine Shops" },
];

export default function NearbyModal({ isOpen, onClose }: NearbyModalProps) {
  const [step, setStep] = useState<
    "ask" | "loading" | "results" | "denied" | "error"
  >("ask");
  const [places, setPlaces] = useState<(Place & { _type: string })[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("doctors");

  const reset = useCallback(() => {
    setStep("ask");
    setPlaces([]);
    setActiveTab("doctors");
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
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const [doctors, clinics, pharmacies] = await Promise.all([
            getNearbyPlaces(latitude, longitude, "doctor"),
            getNearbyPlaces(latitude, longitude, "hospital"),
            getNearbyPlaces(latitude, longitude, "pharmacy"),
          ]);
          setPlaces([
            ...doctors.results.map((p) => ({ ...p, _type: "doctor" as const })),
            ...clinics.results.map((p) => ({ ...p, _type: "clinic" as const })),
            ...pharmacies.results.map((p) => ({ ...p, _type: "pharmacy" as const })),
          ]);
          setStep("results");
        } catch {
          toast.error("Failed to fetch nearby places");
          setStep("error");
        }
      },
      () => {
        setStep("denied");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const filteredPlaces = places.filter((p) => {
    if (activeTab === "doctors") return p._type === "doctor";
    if (activeTab === "clinics") return p._type === "clinic";
    return p._type === "pharmacy";
  });

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
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border border-white/15 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl"
          >
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
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

            {/* Permission request */}
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
                  Valeon needs your location to find nearby healthcare
                  facilities, doctors, and pharmacies.
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

            {/* Loading */}
            {step === "loading" && (
              <div className="flex flex-col items-center justify-center py-12">
                <motion.div
                  className="h-10 w-10 rounded-full border-4 border-teal-500 border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
                <p className="mt-4 text-sm text-white/60">
                  Finding nearby facilities…
                </p>
              </div>
            )}

            {/* Denied */}
            {step === "denied" && (
              <div className="py-8 text-center">
                <p className="mb-4 text-sm text-white/60">
                  Location access was denied. Please enable location permissions
                  in your browser settings to use this feature.
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

            {/* Error */}
            {step === "error" && (
              <div className="py-8 text-center">
                <p className="mb-4 text-sm text-white/60">
                  Unable to fetch nearby places. The Google Maps API might not
                  be configured yet. Please try again later.
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

            {/* Results */}
            {step === "results" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
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
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Place list */}
                <div className="max-h-[40vh] space-y-2 overflow-y-auto">
                  {filteredPlaces.length > 0 ? (
                    filteredPlaces.map((place, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/8"
                      >
                        <h4 className="text-sm font-medium text-white">
                          {place.name}
                        </h4>
                        <p className="mt-1 text-xs text-white/50">
                          {place.address}
                        </p>
                        {place.rating != null && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-amber-400">
                            <FiStar size={12} />
                            <span>{place.rating}</span>
                          </div>
                        )}
                      </motion.div>
                    ))
                  ) : (
                    <p className="py-8 text-center text-sm text-white/40">
                      No {activeTab} found nearby.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

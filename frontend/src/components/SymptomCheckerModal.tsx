"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { FiActivity, FiArrowLeft, FiArrowRight, FiX } from "react-icons/fi";

interface SymptomCheckerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
}

type BodyPart = "head" | "chest" | "abdomen" | "limbs" | "skin";
type Duration = "< 1 day" | "1-3 days" | "3-7 days" | "> 1 week";

const symptomMap: Record<BodyPart, string[]> = {
  head: [
    "Headache",
    "Dizziness",
    "Blurred vision",
    "Nausea",
    "Sensitivity to light",
    "Neck stiffness",
    "Confusion",
    "Sinus pressure",
    "Vomiting",
    "Ringing ears",
    "Balance issues",
    "Fever",
  ],
  chest: [
    "Chest pain",
    "Tightness",
    "Shortness of breath",
    "Palpitations",
    "Cough",
    "Wheezing",
    "Sweating",
    "Fatigue",
    "Pressure",
    "Dizziness",
    "Fever",
    "Swelling",
  ],
  abdomen: [
    "Abdominal pain",
    "Bloating",
    "Nausea",
    "Vomiting",
    "Diarrhea",
    "Constipation",
    "Acid reflux",
    "Loss of appetite",
    "Cramps",
    "Fever",
    "Gas",
    "Heartburn",
  ],
  limbs: [
    "Pain",
    "Numbness",
    "Weakness",
    "Cramps",
    "Swelling",
    "Tingling",
    "Stiffness",
    "Bruising",
    "Tremor",
    "Cold limbs",
    "Joint pain",
    "Reduced mobility",
  ],
  skin: [
    "Rash",
    "Itching",
    "Redness",
    "Dryness",
    "Swelling",
    "Burning",
    "Hives",
    "Peeling",
    "Tenderness",
    "Blisters",
    "Discoloration",
    "Warmth",
  ],
};

const bodyPartLabel: Record<BodyPart, string> = {
  head: "Head",
  chest: "Chest",
  abdomen: "Abdomen",
  limbs: "Limbs",
  skin: "Skin",
};

function buildPrompt(bodyPart: BodyPart, symptoms: string[], duration: Duration | "", severity: number | null) {
  const symptomText = symptoms.length > 0 ? symptoms.join(", ") : "these symptoms";
  const severityText = severity ? `${severity}/5` : "unknown";
  return `I have ${symptomText} in my ${bodyPartLabel[bodyPart].toLowerCase()} for ${duration || "an unknown duration"}, severity ${severityText}. What could this be?`;
}

export default function SymptomCheckerModal({ isOpen, onClose, onSelectPrompt }: SymptomCheckerModalProps) {
  const [step, setStep] = useState(1);
  const [bodyPart, setBodyPart] = useState<BodyPart | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [duration, setDuration] = useState<Duration | "">("");
  const [severity, setSeverity] = useState<number | null>(null);

  const availableSymptoms = useMemo(() => {
    return bodyPart ? symptomMap[bodyPart] : [];
  }, [bodyPart]);

  function closeAndReset() {
    setStep(1);
    setBodyPart(null);
    setSymptoms([]);
    setDuration("");
    setSeverity(null);
    onClose();
  }

  function selectBodyPart(part: BodyPart) {
    setBodyPart(part);
    setSymptoms([]);
    setStep(2);
  }

  function toggleSymptom(symptom: string) {
    setSymptoms((prev) =>
      prev.includes(symptom) ? prev.filter((item) => item !== symptom) : [...prev, symptom]
    );
  }

  function submitAssessment() {
    if (!bodyPart) return;
    const prompt = buildPrompt(bodyPart, symptoms, duration, severity);
    onSelectPrompt(prompt);
    closeAndReset();
  }

  const stepTitle = ["Select area", "Pick symptoms", "Duration & severity", "Summary"][step - 1];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[6px]"
          onClick={(e) => e.target === e.currentTarget && closeAndReset()}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[16px] border border-border bg-surface-1 p-6 shadow-[var(--shadow-lg)]"
          >
            <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <FiActivity className="text-primary" size={22} />
                <div>
                  <h2 className="text-lg font-semibold text-foreground sm:text-xl">Symptom Checker</h2>
                  <p className="text-xs text-muted-foreground">Step {step} of 4 · {stepTitle}</p>
                </div>
              </div>
              <button
                onClick={closeAndReset}
                className="rounded-[var(--radius)] p-2 text-muted-foreground transition-colors hover:bg-surface-offset hover:text-foreground"
                aria-label="Close modal"
              >
                <FiX size={20} />
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                {step === 1 && (
                  <div className="space-y-5">
                    <p className="text-sm text-muted-foreground">
                      Tap the part of the body most affected.
                    </p>
                    <div className="flex justify-center">
                      <svg viewBox="0 0 240 420" className="h-[360px] w-[200px] max-w-full" aria-hidden>
                        <path
                          d="M120 30c17 0 30 13 30 30s-13 30-30 30-30-13-30-30 13-30 30-30Zm-38 65c-5 16-7 33-7 48 0 18 1 35 5 50h14v68c0 14 10 25 24 25s24-11 24-25v-68h14c4-15 5-32 5-50 0-15-2-32-7-48-10 8-22 12-36 12s-26-4-36-12Z"
                          fill={bodyPart === "head" ? "var(--primary)" : "color-mix(in oklch, var(--surface-offset) 70%, var(--foreground))"}
                          opacity={bodyPart === "head" ? 0.9 : 0.45}
                          stroke="var(--border)"
                        />
                        <path
                          d="M82 150c8-12 23-18 38-18s30 6 38 18c7 10 11 24 11 39 0 20-6 41-11 60H82c-5-19-11-40-11-60 0-15 4-29 11-39Z"
                          fill={bodyPart === "chest" ? "var(--primary)" : "color-mix(in oklch, var(--surface-offset) 70%, var(--foreground))"}
                          opacity={bodyPart === "chest" ? 0.9 : 0.45}
                          stroke="var(--border)"
                        />
                        <path
                          d="M89 247h62v56c0 13-11 24-24 24h-14c-13 0-24-11-24-24v-56Z"
                          fill={bodyPart === "abdomen" ? "var(--primary)" : "color-mix(in oklch, var(--surface-offset) 70%, var(--foreground))"}
                          opacity={bodyPart === "abdomen" ? 0.9 : 0.45}
                          stroke="var(--border)"
                        />
                        <path
                          d="M72 166c-20 15-30 38-34 62-2 13 1 25 8 36 6 10 15 15 25 15 6 0 11-5 11-11V172c0-4-4-7-10-6Zm96 0c20 15 30 38 34 62 2 13-1 25-8 36-6 10-15 15-25 15-6 0-11-5-11-11V172c0-4 4-7 10-6Zm-102 148c-11 18-18 42-18 61 0 18 11 29 26 29 13 0 21-8 24-20 4-20 6-45 6-69H66Zm108 0h-38c0 24 2 49 6 69 3 12 11 20 24 20 15 0 26-11 26-29 0-19-7-43-18-61Z"
                          fill={bodyPart === "limbs" ? "var(--primary)" : "color-mix(in oklch, var(--surface-offset) 70%, var(--foreground))"}
                          opacity={bodyPart === "limbs" ? 0.9 : 0.45}
                          stroke="var(--border)"
                        />
                        <path
                          d="M64 96c15-10 34-16 56-16s41 6 56 16c15 10 25 24 25 42 0 31-23 58-56 58H95c-33 0-56-27-56-58 0-18 10-32 25-42Z"
                          fill={bodyPart === "skin" ? "var(--primary)" : "color-mix(in oklch, var(--surface-offset) 70%, var(--foreground))"}
                          opacity={bodyPart === "skin" ? 0.9 : 0.25}
                          stroke={bodyPart === "skin" ? "var(--primary)" : "var(--border)"}
                          strokeWidth="2"
                        />
                      </svg>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {(["head", "chest", "abdomen", "limbs", "skin"] as BodyPart[]).map((part) => (
                        <button
                          key={part}
                          onClick={() => selectBodyPart(part)}
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                            bodyPart === part
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {bodyPartLabel[part]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {step === 2 && bodyPart && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        Choose one or more symptoms for <span className="font-medium text-foreground">{bodyPartLabel[bodyPart]}</span>.
                      </p>
                      <button
                        onClick={() => setStep(1)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <FiArrowLeft size={12} /> Back
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {availableSymptoms.map((symptom) => {
                        const active = symptoms.includes(symptom);
                        return (
                          <button
                            key={symptom}
                            onClick={() => toggleSymptom(symptom)}
                            className={`rounded-full border px-3 py-2 text-xs transition-all ${
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {symptom}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {step === 3 && bodyPart && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        Pick how long this has been happening and how severe it feels.
                      </p>
                      <button
                        onClick={() => setStep(2)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <FiArrowLeft size={12} /> Back
                      </button>
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs font-medium text-foreground">Duration</p>
                      <div className="flex flex-wrap gap-2">
                        {(["< 1 day", "1-3 days", "3-7 days", "> 1 week"] as Duration[]).map((item) => (
                          <button
                            key={item}
                            onClick={() => setDuration(item)}
                            className={`rounded-full border px-3 py-2 text-xs transition-colors ${
                              duration === item
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs font-medium text-foreground">Severity</p>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((level) => {
                          const active = severity !== null && level <= severity;
                          const color =
                            severity !== null && severity >= 4
                              ? "bg-red-500"
                              : severity === 3
                                ? "bg-amber-500"
                                : "bg-emerald-500";
                          return (
                            <button
                              key={level}
                              onClick={() => setSeverity(level)}
                              className={`h-4 w-4 rounded-full border transition-all ${
                                active ? `${color} border-transparent scale-110` : "border-border bg-background"
                              }`}
                              aria-label={`Severity ${level}`}
                            />
                          );
                        })}
                        <span className="ml-2 text-xs text-muted-foreground">1 mild · 5 severe</span>
                      </div>
                    </div>
                  </div>
                )}

                {step === 4 && bodyPart && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        Review your selection before sending it to Valeon.
                      </p>
                      <button
                        onClick={() => setStep(3)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <FiArrowLeft size={12} /> Back
                      </button>
                    </div>

                    <div className="rounded-[16px] border border-border bg-surface-offset p-4 text-xs text-foreground shadow-[var(--shadow-sm)] space-y-3">
                      <div>
                        <p className="mono-label mb-1">Body part</p>
                        <p>{bodyPartLabel[bodyPart]}</p>
                      </div>
                      <div>
                        <p className="mono-label mb-1">Symptoms</p>
                        <p>{symptoms.length > 0 ? symptoms.join(", ") : "No symptoms selected"}</p>
                      </div>
                      <div className="flex gap-6">
                        <div>
                          <p className="mono-label mb-1">Duration</p>
                          <p>{duration || "Not set"}</p>
                        </div>
                        <div>
                          <p className="mono-label mb-1">Severity</p>
                          <p>{severity ? `${severity}/5` : "Not set"}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <button
                        onClick={() => setStep(3)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <FiArrowLeft size={12} /> Edit
                      </button>
                      <button
                        onClick={submitAssessment}
                        className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-[var(--shadow-sm)] transition-colors hover:opacity-95"
                      >
                        Get AI Assessment <FiArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <div className="text-xs text-muted-foreground">
                {bodyPart ? `${bodyPartLabel[bodyPart]} · ${symptoms.length} symptom(s)` : "Choose a body area to begin"}
              </div>
              <div className="flex items-center gap-2">
                {step < 4 && (
                  <button
                    onClick={() => setStep((prev) => Math.min(4, prev + 1))}
                    disabled={(step === 1 && !bodyPart) || (step === 3 && (!duration || !severity))}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-2 text-xs text-foreground transition-colors hover:bg-surface-offset disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next <FiArrowRight size={12} />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

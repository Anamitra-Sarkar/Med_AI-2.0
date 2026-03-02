"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiUploadCloud,
  FiX,
  FiAlertCircle,
  FiCheckCircle,
} from "react-icons/fi";
import toast from "react-hot-toast";
import { diagnoseImage, type DiagnosisResult } from "@/lib/api";

interface DiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelType: string;
  title: string;
}

export default function DiagnosticModal({
  isOpen,
  onClose,
  modelType,
  title,
}: DiagnosticModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setLoading(false);
    setDragOver(false);
  }, []);

  function handleClose() {
    handleReset();
    onClose();
  }

  function handleFile(f: File) {
    if (f.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10 MB");
      return;
    }
    if (!f.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  async function handleAnalyze() {
    if (!file) return;
    setLoading(true);
    try {
      const res = await diagnoseImage(modelType, file);
      setResult(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

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
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/15 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white sm:text-xl">
                {title}
              </h2>
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

            {!result ? (
              <>
                {/* Upload area */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      fileInputRef.current?.click();
                  }}
                  className={`mb-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all ${
                    dragOver
                      ? "border-teal-400 bg-teal-400/10"
                      : "border-white/20 bg-white/5 hover:border-white/30 hover:bg-white/8"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleInputChange}
                    className="hidden"
                  />
                  {preview ? (
                    <img
                      src={preview}
                      alt="Preview"
                      className="max-h-48 rounded-xl object-contain"
                    />
                  ) : (
                    <>
                      <FiUploadCloud
                        size={40}
                        className="mb-3 text-white/40"
                      />
                      <p className="text-sm text-white/60">
                        Drag & drop an image or{" "}
                        <span className="text-teal-400 font-medium">
                          browse
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-white/30">
                        PNG, JPG up to 10 MB
                      </p>
                    </>
                  )}
                </div>

                {/* Analyze button */}
                <motion.button
                  onClick={handleAnalyze}
                  disabled={!file || loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-blue-600 py-3 text-sm font-semibold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? (
                    <>
                      <motion.div
                        className="h-5 w-5 rounded-full border-2 border-white border-t-transparent"
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                      />
                      Analyzing…
                    </>
                  ) : (
                    "Analyze Image"
                  )}
                </motion.button>
              </>
            ) : (
              /* Result card */
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {preview && (
                  <img
                    src={preview}
                    alt="Analyzed"
                    className="mx-auto max-h-40 rounded-xl object-contain"
                  />
                )}

                {/* Summary */}
                <div className="rounded-2xl border border-teal-500/20 bg-teal-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <FiCheckCircle
                      className="mt-0.5 shrink-0 text-teal-400"
                      size={20}
                    />
                    <div>
                      <h3 className="mb-1 font-semibold text-white">
                        Analysis Summary
                      </h3>
                      <p className="text-sm leading-relaxed text-white/80 whitespace-pre-wrap">
                        {result.summary}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Consult doctor note */}
                <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                  <FiAlertCircle
                    className="mt-0.5 shrink-0 text-amber-400"
                    size={20}
                  />
                  <p className="text-sm text-white/80">
                    This is an AI-assisted analysis and should not replace
                    professional medical advice. Please consult a healthcare
                    provider for a definitive diagnosis.
                  </p>
                </div>

                {/* New analysis */}
                <motion.button
                  onClick={handleReset}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
                >
                  New Analysis
                </motion.button>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

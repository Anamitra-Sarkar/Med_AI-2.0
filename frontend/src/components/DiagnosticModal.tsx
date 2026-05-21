"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiUploadCloud, FiX, FiAlertCircle, FiCheckCircle } from "react-icons/fi";
import toast from "react-hot-toast";
import { diagnoseImage, recordUpload, type DiagnosisResult } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const MODEL_LABELS: Record<string, string> = {
  cataract: "ClearView Cataract Screening",
  "diabetic-retinopathy": "RetinaGuard DR Grading",
  kidney: "NephroScan CT Analysis",
  skin: "DermaVision Skin Analysis",
  cardiac: "CardioInsight MRI Classifier",
};

interface DiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelType: string;
  title: string;
  /** Called after a successful analysis so the sidebar uploads list can refresh */
  onUploadRecorded?: () => void;
}

export default function DiagnosticModal({
  isOpen,
  onClose,
  modelType,
  title,
  onUploadRecorded,
}: DiagnosticModalProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReset = useCallback(() => {
    setFile(null); setPreview(null); setResult(null); setLoading(false); setDragOver(false);
  }, []);

  function handleClose() { handleReset(); onClose(); }

  function handleFile(f: File) {
    if (f.size > 10 * 1024 * 1024) { toast.error("File must be under 10 MB"); return; }
    if (!f.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    setFile(f); setResult(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
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
      // Record upload to MongoDB — include the base64 data_url so it can be
      // viewed and downloaded later from the sidebar File Uploads section.
      if (user && !user.isGuest) {
        recordUpload({
          firebase_uid: user.uid,
          filename: file.name,
          file_type: file.type,
          model_type: modelType,
          model_label: MODEL_LABELS[modelType] || title,
          predictions: res.predictions,
          summary: res.summary,
          data_url: preview,   // base64 data URL captured by FileReader
        })
          .then(() => onUploadRecorded?.())
          .catch(() => {});
      }
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
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[oklch(0.1_0_0_/_0.5)] backdrop-blur-[4px]"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[16px] border border-border bg-surface-1 p-6 shadow-[var(--shadow-lg)]"
          >
            <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
              <h2 className="text-lg font-semibold text-foreground sm:text-xl">{title}</h2>
              <motion.button onClick={handleClose} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                className="rounded-[var(--radius)] p-2 text-muted-foreground transition-colors hover:bg-surface-offset hover:text-foreground" aria-label="Close modal">
                <FiX size={20} />
              </motion.button>
            </div>

            {!result ? (
              <>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                  className={`mb-5 flex cursor-pointer flex-col items-center justify-center rounded-[16px] border border-dashed p-8 transition-all ${
                    dragOver ? "border-primary bg-[color-mix(in_oklch,var(--primary)_10%,var(--surface-1))]" : "border-border bg-background hover:bg-surface-offset"
                  }`}
                >
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleInputChange} className="hidden" />
                  {preview ? (
                    <img src={preview} alt="Preview" className="max-h-48 rounded-xl object-contain" />
                  ) : (
                    <>
                      <FiUploadCloud size={40} className="mb-3 text-primary" />
                      <p className="text-sm text-foreground">Drag & drop an image or{" "}
                        <span className="font-medium text-primary">browse</span></p>
                      <p className="mt-1 text-xs text-muted-foreground">PNG, JPG up to 10 MB</p>
                    </>
                  )}
                </div>
                <motion.button onClick={handleAnalyze} disabled={!file || loading}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="btn-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-40">
                  {loading ? (
                    <><motion.div className="h-5 w-5 rounded-full border-2 border-current border-t-transparent"
                      animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
                      Analyzing…</>
                  ) : "Analyze Image"}
                </motion.button>
              </>
            ) : (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {preview && <img src={preview} alt="Analyzed" className="mx-auto max-h-40 rounded-xl object-contain" />}
                <div className="rounded-[16px] border border-border bg-surface-2 p-4">
                  <div className="flex items-start gap-3">
                    <FiCheckCircle className="mt-0.5 shrink-0 text-primary" size={20} />
                    <div>
                      <h3 className="mb-1 font-semibold text-foreground">Analysis Summary</h3>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{result.summary}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-[16px] border border-border bg-background p-4">
                  <FiAlertCircle className="mt-0.5 shrink-0 text-amber-500" size={20} />
                  <p className="text-sm text-muted-foreground">This is an AI-assisted analysis and should not replace professional medical advice. Please consult a healthcare provider for a definitive diagnosis.</p>
                </div>
                <motion.button onClick={handleReset} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="w-full rounded-[var(--radius)] border border-border bg-background py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-offset">
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

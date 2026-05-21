"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiX, FiEye, FiActivity, FiDroplet, FiSun, FiZap, FiMapPin,
  FiMessageSquare, FiFolder, FiChevronDown, FiPlus, FiTrash2,
  FiDownload, FiExternalLink,
} from "react-icons/fi";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import {
  listChatSessions, deleteChatSession,
  listUploadRecords, deleteUploadRecord,
  type ChatSession, type UploadRecord,
} from "@/lib/api";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onMenuSelect: (key: string) => void;
  onNewChat: () => void;
  onRestoreChat: (sessionId: string) => void;
  /** Increment to trigger re-fetch of chats */
  chatRefreshTick?: number;
  /** Increment to trigger re-fetch of uploads */
  uploadRefreshTick?: number;
}

const diagnosticTools = [
  { key: "cataract", label: "ClearView Cataract Screening", icon: FiEye },
  { key: "diabetic-retinopathy", label: "RetinaGuard DR Grading", icon: FiActivity },
  { key: "kidney", label: "NephroScan CT Analysis", icon: FiDroplet },
  { key: "skin", label: "DermaVision Skin Analysis", icon: FiSun },
  { key: "cardiac", label: "CardioInsight MRI Classifier", icon: FiZap },
  { key: "nearby", label: "Nearby Care Locator", icon: FiMapPin },
];

const MODEL_ICON: Record<string, React.ElementType> = {
  cataract: FiEye, "diabetic-retinopathy": FiActivity, "diabetic_retinopathy": FiActivity,
  kidney: FiDroplet, skin: FiSun, cardiac: FiZap,
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Open a data_url in a new browser tab for viewing */
function viewUpload(u: UploadRecord) {
  if (!u.data_url) { toast.error("No image data available for this scan."); return; }
  const win = window.open();
  if (!win) { toast.error("Pop-up blocked — please allow pop-ups for Valeon."); return; }
  win.document.write(
    `<!DOCTYPE html><html><head><title>${u.filename}</title>
    <style>body{margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;}
    img{max-width:100%;max-height:100vh;object-fit:contain;border-radius:12px;}</style></head>
    <body><img src="${u.data_url}" alt="${u.filename}" /></body></html>`
  );
  win.document.close();
}

/** Trigger a browser download of the stored image */
function downloadUpload(u: UploadRecord) {
  if (!u.data_url) { toast.error("No image data available for this scan."); return; }
  const a = document.createElement("a");
  a.href = u.data_url;
  // Derive a sensible extension from the stored MIME type
  const ext = u.file_type?.split("/")[1] ?? "png";
  a.download = u.filename.includes(".") ? u.filename : `${u.filename}.${ext}`;
  a.click();
}

export default function Sidebar({
  isOpen, onToggle, onMenuSelect, onNewChat, onRestoreChat,
  chatRefreshTick = 0, uploadRefreshTick = 0,
}: SidebarProps) {
  const { user } = useAuth();
  const canPersist = Boolean(user && !user.isGuest);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const [chatsOpen, setChatsOpen] = useState(true);
  const [uploadsOpen, setUploadsOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(true);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [uploadsLoading, setUploadsLoading] = useState(false);

  // Close on outside click (mobile)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node) && window.innerWidth < 1024 && isOpen)
        onToggle();
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onToggle]);

  const fetchChats = useCallback(async () => {
    if (!canPersist || !user) return;
    setChatsLoading(true);
    try {
      const data = await listChatSessions(user.uid);
      setSessions(data.sessions);
    } catch { /* silently ignore */ } finally {
      setChatsLoading(false);
    }
  }, [canPersist, user]);

  const fetchUploads = useCallback(async () => {
    if (!canPersist || !user) return;
    setUploadsLoading(true);
    try {
      const data = await listUploadRecords(user.uid);
      setUploads(data.uploads);
    } catch { /* silently ignore */ } finally {
      setUploadsLoading(false);
    }
  }, [canPersist, user]);

  useEffect(() => { fetchChats(); }, [fetchChats, chatRefreshTick]);
  useEffect(() => { fetchUploads(); }, [fetchUploads, uploadRefreshTick]);

  async function handleDeleteSession(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation();
    if (!canPersist || !user) return;
    try {
      await deleteChatSession(user.uid, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch { /* silently ignore */ }
  }

  async function handleDeleteUpload(e: React.MouseEvent, uploadId: string) {
    e.stopPropagation();
    if (!canPersist || !user) return;
    try {
      await deleteUploadRecord(user.uid, uploadId);
      setUploads((prev) => prev.filter((u) => u.id !== uploadId));
    } catch { /* silently ignore */ }
  }

  const SectionHeader = ({
    label, open, onToggle: toggle, count,
  }: { label: string; open: boolean; onToggle: () => void; count?: number }) => (
    <button
      onClick={toggle}
      className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-surface-offset"
    >
      <div className="flex items-center gap-2">
        <span className="mono-label">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-surface-offset px-1.5 py-0.5 text-[10px] text-muted-foreground">{count}</span>
        )}
      </div>
      <motion.div animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.2 }}>
        <FiChevronDown size={12} className="text-muted-foreground" />
      </motion.div>
    </button>
  );

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={onToggle} />
        )}
      </AnimatePresence>

      {/* Sidebar panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            ref={sidebarRef}
            initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 z-50 flex h-full w-[280px] flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] lg:relative lg:z-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--sidebar-border)] px-4 py-4">
              <div className="flex flex-col gap-0.5">
                <h2 className="hero-type text-xl text-foreground">Valeon</h2>
                <span className="mono-label">Medical AI</span>
              </div>
              <div className="flex items-center gap-1">
                <motion.button onClick={onToggle} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-surface-offset hover:text-foreground"
                  aria-label="Close sidebar">
                  <FiX size={18} />
                </motion.button>
              </div>
            </div>

            {/* Scrollable content */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-3">
              <motion.button
                onClick={onNewChat}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="btn-primary flex w-full items-center justify-center gap-2"
              >
                <FiPlus size={16} />
                New Chat
              </motion.button>

              {/* ── Past Chats ── */}
              <SectionHeader label="Past Chats" open={chatsOpen}
                onToggle={() => setChatsOpen((p) => !p)} count={sessions.length} />
              <AnimatePresence initial={false}>
                {chatsOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                    className="overflow-hidden">
                    <div className="pb-2 space-y-0.5">
                      {chatsLoading ? (
                        [1, 2, 3].map((i) => (
                          <div key={i} className="mx-2 h-9 animate-pulse rounded-lg bg-surface-offset" />
                        ))
                      ) : sessions.length === 0 ? (
                        <p className="px-4 py-2 text-xs text-muted-foreground">No past chats yet.</p>
                      ) : (
                        sessions.map((s) => (
                          <motion.div key={s.id}
                            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                            className="group flex cursor-pointer items-center gap-2 rounded-[var(--radius)] px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-offset hover:text-foreground"
                            onClick={() => { onRestoreChat(s.id); onToggle(); }}
                          >
                            <FiMessageSquare size={13} className="shrink-0 text-primary" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium">{s.title}</p>
                              <p className="text-[10px] text-muted-foreground">{formatDate(s.updated_at)}</p>
                            </div>
                            <motion.button
                              onClick={(e) => handleDeleteSession(e, s.id)}
                              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                              className="hidden shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground group-hover:flex"
                              aria-label="Delete chat">
                              <FiTrash2 size={12} />
                            </motion.button>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── File Uploads ── */}
              <SectionHeader label="File Uploads" open={uploadsOpen}
                onToggle={() => setUploadsOpen((p) => !p)} count={uploads.length} />
              <AnimatePresence initial={false}>
                {uploadsOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                    className="overflow-hidden">
                    <div className="pb-2 space-y-0.5">
                      {uploadsLoading ? (
                        [1, 2].map((i) => (
                          <div key={i} className="mx-2 h-9 animate-pulse rounded-lg bg-surface-offset" />
                        ))
                      ) : uploads.length === 0 ? (
                        <p className="px-4 py-2 text-xs text-muted-foreground">No scans or uploads yet.</p>
                      ) : (
                        uploads.map((u) => {
                          const Icon = MODEL_ICON[u.model_type] || FiFolder;
                          return (
                            <motion.div key={u.id}
                              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                              className="group flex items-center gap-2 rounded-[var(--radius)] px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-offset hover:text-foreground"
                            >
                              <Icon size={13} className="shrink-0 text-primary" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">{u.filename}</p>
                                <p className="text-[10px] text-muted-foreground">{u.model_label} · {formatDate(u.uploaded_at)}</p>
                              </div>
                              {/* Action buttons — visible on hover */}
                              <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                                <motion.button
                                  onClick={(e) => { e.stopPropagation(); viewUpload(u); }}
                                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                                  aria-label="View image" title="View">
                                  <FiExternalLink size={12} />
                                </motion.button>
                                <motion.button
                                  onClick={(e) => { e.stopPropagation(); downloadUpload(u); }}
                                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                                  aria-label="Download image" title="Download">
                                  <FiDownload size={12} />
                                </motion.button>
                                <motion.button
                                  onClick={(e) => handleDeleteUpload(e, u.id)}
                                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                                  aria-label="Delete upload record">
                                  <FiTrash2 size={12} />
                                </motion.button>
                              </div>
                            </motion.div>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── AI Diagnostic Tools ── */}
              <SectionHeader label="Diagnostic Tools" open={toolsOpen}
                onToggle={() => setToolsOpen((p) => !p)} />
              <AnimatePresence initial={false}>
                {toolsOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                    className="overflow-hidden">
                    <div className="pb-2 space-y-0.5">
                      {diagnosticTools.map((item, i) => (
                        <motion.button key={item.key}
                          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04, duration: 0.3 }}
                          onClick={() => onMenuSelect(item.key)}
                          className="group flex w-full items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-left transition-all hover:bg-surface-offset hover:text-foreground"
                        >
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-offset text-[10px] font-medium text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                            {String(i + 1).padStart(2, "0")}
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <span className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">{item.label}</span>
                          </div>
                          <item.icon size={12} className="ml-auto shrink-0 text-muted-foreground opacity-0 transition-all group-hover:opacity-100" />
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </nav>

            {/* Footer */}
            <div className="border-t border-[var(--sidebar-border)] px-5 py-4">
              <div className="mb-2 h-px w-8 bg-primary opacity-40" />
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                AI-assisted tools — not a substitute<br />for professional medical advice
              </p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

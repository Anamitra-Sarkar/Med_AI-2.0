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
    if (!user) return;
    setChatsLoading(true);
    try {
      const data = await listChatSessions(user.uid);
      setSessions(data.sessions);
    } catch { /* silently ignore */ } finally {
      setChatsLoading(false);
    }
  }, [user]);

  const fetchUploads = useCallback(async () => {
    if (!user) return;
    setUploadsLoading(true);
    try {
      const data = await listUploadRecords(user.uid);
      setUploads(data.uploads);
    } catch { /* silently ignore */ } finally {
      setUploadsLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchChats(); }, [fetchChats, chatRefreshTick]);
  useEffect(() => { fetchUploads(); }, [fetchUploads, uploadRefreshTick]);

  async function handleDeleteSession(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteChatSession(user.uid, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch { /* silently ignore */ }
  }

  async function handleDeleteUpload(e: React.MouseEvent, uploadId: string) {
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteUploadRecord(user.uid, uploadId);
      setUploads((prev) => prev.filter((u) => u.id !== uploadId));
    } catch { /* silently ignore */ }
  }

  const SectionHeader = ({
    label, icon: Icon, open, onToggle: toggle, count,
  }: { label: string; icon: React.ElementType; open: boolean; onToggle: () => void; count?: number }) => (
    <button
      onClick={toggle}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/5"
    >
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-teal-400/70" />
        <span className="text-xs font-semibold uppercase tracking-widest text-white/40">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">{count}</span>
        )}
      </div>
      <motion.div animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.2 }}>
        <FiChevronDown size={12} className="text-white/30" />
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
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
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
            className="fixed left-0 top-0 z-50 flex h-full w-[280px] flex-col border-r border-white/10 bg-slate-900/95 backdrop-blur-xl lg:relative lg:z-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-white/50">Valeon</h2>
              <div className="flex items-center gap-1">
                <motion.button
                  onClick={onNewChat} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  className="rounded-lg p-1.5 text-teal-400/70 transition-colors hover:bg-teal-500/10 hover:text-teal-400"
                  aria-label="New chat" title="New Chat">
                  <FiPlus size={16} />
                </motion.button>
                <motion.button onClick={onToggle} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Close sidebar">
                  <FiX size={18} />
                </motion.button>
              </div>
            </div>

            {/* Scrollable content */}
            <nav className="flex-1 overflow-y-auto p-2 space-y-1">

              {/* ── Past Chats ── */}
              <SectionHeader label="Past Chats" icon={FiMessageSquare} open={chatsOpen}
                onToggle={() => setChatsOpen((p) => !p)} count={sessions.length} />
              <AnimatePresence initial={false}>
                {chatsOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                    className="overflow-hidden">
                    <div className="pb-2 space-y-0.5">
                      {chatsLoading ? (
                        [1, 2, 3].map((i) => (
                          <div key={i} className="mx-2 h-9 animate-pulse rounded-lg bg-white/5" />
                        ))
                      ) : sessions.length === 0 ? (
                        <p className="px-4 py-2 text-xs text-white/25">No past chats yet.</p>
                      ) : (
                        sessions.map((s) => (
                          <motion.div key={s.id}
                            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                            className="group flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-white/8 cursor-pointer"
                            onClick={() => { onRestoreChat(s.id); onToggle(); }}
                          >
                            <FiMessageSquare size={13} className="shrink-0 text-teal-400/50" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-white/70">{s.title}</p>
                              <p className="text-[10px] text-white/30">{formatDate(s.updated_at)}</p>
                            </div>
                            <motion.button
                              onClick={(e) => handleDeleteSession(e, s.id)}
                              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                              className="hidden shrink-0 rounded p-1 text-white/20 transition-colors hover:text-red-400 group-hover:flex"
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
              <SectionHeader label="File Uploads" icon={FiFolder} open={uploadsOpen}
                onToggle={() => setUploadsOpen((p) => !p)} count={uploads.length} />
              <AnimatePresence initial={false}>
                {uploadsOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                    className="overflow-hidden">
                    <div className="pb-2 space-y-0.5">
                      {uploadsLoading ? (
                        [1, 2].map((i) => (
                          <div key={i} className="mx-2 h-9 animate-pulse rounded-lg bg-white/5" />
                        ))
                      ) : uploads.length === 0 ? (
                        <p className="px-4 py-2 text-xs text-white/25">No scans or uploads yet.</p>
                      ) : (
                        uploads.map((u) => {
                          const Icon = MODEL_ICON[u.model_type] || FiFolder;
                          return (
                            <motion.div key={u.id}
                              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                              className="group flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-white/8"
                            >
                              <Icon size={13} className="shrink-0 text-teal-400/50" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-white/70">{u.filename}</p>
                                <p className="text-[10px] text-white/30">{u.model_label} · {formatDate(u.uploaded_at)}</p>
                              </div>
                              {/* Action buttons — visible on hover */}
                              <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                                <motion.button
                                  onClick={(e) => { e.stopPropagation(); viewUpload(u); }}
                                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                  className="rounded p-1 text-white/20 transition-colors hover:text-teal-400"
                                  aria-label="View image" title="View">
                                  <FiExternalLink size={12} />
                                </motion.button>
                                <motion.button
                                  onClick={(e) => { e.stopPropagation(); downloadUpload(u); }}
                                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                  className="rounded p-1 text-white/20 transition-colors hover:text-blue-400"
                                  aria-label="Download image" title="Download">
                                  <FiDownload size={12} />
                                </motion.button>
                                <motion.button
                                  onClick={(e) => handleDeleteUpload(e, u.id)}
                                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                  className="rounded p-1 text-white/20 transition-colors hover:text-red-400"
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
              <SectionHeader label="Diagnostic Tools" icon={FiZap} open={toolsOpen}
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
                          className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-white/70 transition-all hover:bg-white/8 hover:text-white"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 transition-colors group-hover:bg-teal-500/20">
                            <item.icon size={14} className="text-teal-400/70 transition-colors group-hover:text-teal-400" />
                          </div>
                          <span className="text-xs leading-tight">{item.label}</span>
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </nav>

            {/* Footer */}
            <div className="border-t border-white/10 px-5 py-3">
              <p className="text-[10px] text-white/30 text-center">
                AI-powered diagnostics — not a substitute for professional medical advice
              </p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

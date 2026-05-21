"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { FiBookOpen, FiTrash2, FiX } from "react-icons/fi";
import { useWorkspace } from "@/context/WorkspaceContext";

interface NotesPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotesPanel({ isOpen, onClose }: NotesPanelProps) {
  const { notes, deleteNote, clearNotes } = useWorkspace();
  const [confirmClear, setConfirmClear] = useState(false);

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [notes]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[58] bg-black/25 backdrop-blur-[2px] lg:bg-transparent"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-y-0 right-0 z-[60] flex w-full flex-col border-l border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] shadow-[var(--shadow-lg)] sm:w-[320px]"
          >
            <div className="flex items-center justify-between border-b border-[var(--sidebar-border)] px-4 py-4">
              <div className="flex items-center gap-2">
                <FiBookOpen className="text-primary" size={16} />
                <h2 className="text-sm font-semibold text-foreground">Notes</h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-surface-offset hover:text-foreground"
                aria-label="Close notes panel"
              >
                <FiX size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {sortedNotes.length === 0 ? (
                <div className="rounded-xl border border-border bg-surface-offset p-4 text-xs text-muted-foreground">
                  Saved message notes will appear here.
                </div>
              ) : (
                sortedNotes.map((note) => (
                  <div
                    key={note.id}
                    className="group relative rounded-xl border border-border bg-surface-offset p-3 text-xs text-foreground shadow-[var(--shadow-sm)]"
                  >
                    <div className="mono-label mb-2 text-[10px] opacity-70">{formatTimestamp(note.timestamp)}</div>
                    <p className="whitespace-pre-wrap leading-relaxed">{note.content}</p>
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground group-hover:opacity-100"
                      aria-label="Delete note"
                    >
                      <FiTrash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-[var(--sidebar-border)] p-3">
              {!confirmClear ? (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="w-full rounded-xl border border-border bg-surface-offset px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-background"
                >
                  Clear all
                </button>
              ) : (
                <div className="rounded-xl border border-border bg-surface-offset p-3 text-xs text-foreground">
                  <p className="mb-3">Are you sure?</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        clearNotes();
                        setConfirmClear(false);
                      }}
                      className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground"
                    >
                      No
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

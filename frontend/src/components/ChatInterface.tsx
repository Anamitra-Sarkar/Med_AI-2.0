"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiSend, FiPaperclip, FiX, FiMessageCircle } from "react-icons/fi";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import {
  chat,
  analyzeImage,
  createChatSession,
  appendChatMessage,
  getChatSession,
  type ChatMessage,
} from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  image?: string;
}

interface ChatInterfaceProps {
  /** When set, load this session from MongoDB instead of starting fresh */
  activeSessionId?: string | null;
  /** Called after a new session is created so the sidebar can refresh */
  onSessionCreated?: (sessionId: string) => void;
}

export default function ChatInterface({
  activeSessionId,
  onSessionCreated,
}: ChatInterfaceProps) {
  const { user, userProfile } = useAuth();
  const canPersist = Boolean(user && !user.isGuest);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isMounted = useRef(true);
  // Track whether welcome has already been shown to prevent re-firing
  const welcomeShownRef = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Build the welcome message string
  const buildWelcome = useCallback((): Message => {
    const displayName = userProfile?.name || user?.displayName || "Guest";
    return {
      role: "assistant",
      content: `Hello, ${displayName}! I'm Valeon, your AI health companion. I can help you with health questions, analyze medical images, and more. How can I assist you today?`,
    };
  }, [user, userProfile]);

  // Single authoritative effect: handles both fresh start and session restore.
  // Runs when activeSessionId changes OR when the user object becomes available.
  useEffect(() => {
    if (activeSessionId && canPersist && user) {
      // --- Restore an existing session from MongoDB ---
      welcomeShownRef.current = false; // reset so next fresh chat shows welcome
      (async () => {
        try {
          const session = await getChatSession(user.uid, activeSessionId);
          if (!isMounted.current) return;
          setSessionId(activeSessionId);
          const loaded: Message[] = (session.messages ?? []).map((m: ChatMessage) => ({
            role: m.role,
            content: m.content,
          }));
          setMessages(loaded.length > 0 ? loaded : [buildWelcome()]);
        } catch {
          toast.error("Could not load chat session.");
          setMessages([buildWelcome()]);
        }
      })();
      return;
    }

    // --- Fresh chat: show welcome once, never again until a new fresh start ---
    if (!welcomeShownRef.current) {
      welcomeShownRef.current = true;
      setSessionId(null);
      setMessages([buildWelcome()]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, canPersist, user]);
  // NOTE: buildWelcome intentionally omitted from deps — it changes when
  // userProfile loads, but we do NOT want to re-run this effect (and wipe
  // an in-progress conversation) just because the profile resolved.
  // The welcome text will still be correct because buildWelcome() is called
  // at the moment the effect runs (after auth + profile have settled).

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.size > 10 * 1024 * 1024) { toast.error("File must be under 10 MB"); return; }
    setFile(selected);
    const reader = new FileReader();
    reader.onload = () => setFilePreview(reader.result as string);
    reader.readAsDataURL(selected);
  }

  function clearFile() {
    setFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSend() {
    if ((!input.trim() && !file) || streaming) return;
    const userMsg: Message = {
      role: "user",
      content: input.trim(),
      ...(filePreview && { image: filePreview }),
    };
    setMessages((prev) => [...prev, userMsg]);
    let messageToSend = input.trim();
    const currentFile = file;
    setInput("");
    clearFile();
    setStreaming(true);

    // Ensure we have a session in MongoDB
    let currentSessionId = sessionId;
    if (!currentSessionId && canPersist && user) {
      try {
        const session = await createChatSession(user.uid);
        currentSessionId = session.id;
        setSessionId(session.id);
        onSessionCreated?.(session.id);
      } catch {
        // continue without persistence
      }
    }

    if (currentFile) {
      try {
        const result = await analyzeImage(currentFile, messageToSend);
        if (result.analysis) messageToSend = `[Image uploaded] ${result.analysis}\n\n${messageToSend}`;
      } catch { /* continue */ }
    }

    // Persist user message
    if (currentSessionId && canPersist && user) {
      appendChatMessage(user.uid, currentSessionId, { role: "user", content: userMsg.content }).catch(() => {});
    }

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    const controller = new AbortController();
    abortRef.current = controller;
    let assistantContent = "";

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      await chat(
        messageToSend,
        (chunk) => {
          assistantContent += chunk;
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = { ...last, content: last.content + chunk };
            }
            return updated;
          });
        },
        controller.signal,
        history,
        userProfile
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const fallback = "I'm sorry, I couldn't process your request right now. Please try again.";
        assistantContent = fallback;
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant" && !last.content) {
            updated[updated.length - 1] = { ...last, content: fallback };
          }
          return updated;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      // Persist assistant reply
      if (currentSessionId && canPersist && user && assistantContent) {
        appendChatMessage(user.uid, currentSessionId, { role: "assistant", content: assistantContent }).catch(() => {});
      }
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background text-foreground">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: msg.role === "user" ? 30 : -30, y: 10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={`message-enter flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" ? (
                <div className="flex max-w-[85%] items-end gap-3 sm:max-w-[70%]">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--primary)_12%,var(--surface-1))] text-primary">
                    <FiMessageCircle size={12} />
                  </div>
                  <div className="rounded-[16px_16px_16px_4px] border border-border bg-surface-1 px-4 py-3 text-sm leading-relaxed text-foreground shadow-[var(--shadow-sm)]">
                    {msg.image && (
                      <img src={msg.image} alt="Uploaded" className="mb-2 max-h-48 rounded-xl object-cover" />
                    )}
                    {msg.content ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="flex items-center gap-1.5 py-1 px-1">
                        {[0, 1, 2].map((dot) => (
                          <motion.div
                            key={dot}
                            className="h-2 w-2 rounded-full bg-primary"
                            animate={{ opacity: [0.35, 1, 0.35], y: [0, -4, 0] }}
                            transition={{ duration: 0.8, repeat: Infinity, delay: dot * 0.15, ease: "easeInOut" }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="max-w-[85%] rounded-[16px_16px_4px_16px] bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-[var(--shadow-sm)] sm:max-w-[70%]">
                  {msg.image && (
                    <img src={msg.image} alt="Uploaded" className="mb-2 max-h-48 rounded-xl object-cover" />
                  )}
                  {msg.content ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : null}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Image preview strip */}
      <AnimatePresence>
        {filePreview && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/30 px-4 pt-3 pb-1"
          >
            <div className="relative inline-block">
              <img src={filePreview} alt="Preview" className="h-20 rounded-xl object-cover shadow-md" />
              <motion.button onClick={clearFile} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-md">
                <FiX size={10} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="border-t border-border bg-background">
        <div className="mx-auto w-full max-w-[720px] px-4 py-4">
        <div className="flex items-end gap-2 rounded-[14px] border border-border bg-surface-1 px-3 py-3 shadow-[var(--shadow-sm)] transition-all focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_15%,transparent),var(--shadow-sm)] sm:px-4">
          <button onClick={() => fileInputRef.current?.click()}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-surface-offset hover:text-foreground"
            aria-label="Attach file">
            <FiPaperclip size={18} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask Valeon anything about health..."
            className="min-w-0 flex-1 resize-none bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
          />
          <motion.button onClick={handleSend} disabled={streaming || (!input.trim() && !file)}
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            className="btn-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-0 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message">
            <FiSend size={16} />
          </motion.button>
        </div>
        </div>
      </div>
    </div>
  );
}

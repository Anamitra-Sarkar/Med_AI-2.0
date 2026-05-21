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
  const welcomeShownRef = useRef(false);
  const isWelcomeState = messages.length === 1 && messages[0]?.role === "assistant";

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const buildWelcome = useCallback((): Message => {
    const displayName = userProfile?.name || user?.displayName || "Guest";
    return {
      role: "assistant",
      content: `Hello, ${displayName}! I'm Valeon, your AI health companion. I can help you with health questions, analyze medical images, and more. How can I assist you today?`,
    };
  }, [user, userProfile]);

  useEffect(() => {
    if (activeSessionId && canPersist && user) {
      welcomeShownRef.current = false;
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

    if (!welcomeShownRef.current) {
      welcomeShownRef.current = true;
      setSessionId(null);
      setMessages([buildWelcome()]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, canPersist, user]);

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
      } catch {
        // continue
      }
    }

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
      if (currentSessionId && canPersist && user && assistantContent) {
        appendChatMessage(user.uid, currentSessionId, { role: "assistant", content: assistantContent }).catch(() => {});
      }
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background text-foreground">
      <div className="relative flex-1 overflow-y-auto px-4 py-6">
        <div className="absolute inset-0 grid-pattern opacity-20 pointer-events-none" />
        <div className="relative mx-auto flex w-full max-w-[720px] flex-col gap-4">
          {isWelcomeState ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-1 ring-1 ring-border shadow-[var(--shadow-md)]">
                <FiMessageCircle size={22} className="text-primary" />
              </div>
              <div>
                <h3 className="hero-type text-2xl text-foreground">Ask Valeon anything</h3>
                <p className="mt-1 text-sm text-muted-foreground">Health questions, image analysis, nearby care</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {["What are symptoms of anemia?", "Explain my MRI results", "Find nearby clinics"].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="rounded-full border border-border bg-surface-1 px-3.5 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground hover:shadow-[var(--shadow-sm)]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
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
                    <div className="flex max-w-[85%] items-start gap-3 sm:max-w-[72%]">
                      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-offset text-primary ring-1 ring-border">
                        <FiMessageCircle size={13} />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="mono-label">Valeon</span>
                        <div className="rounded-[4px_16px_16px_16px] border border-border bg-surface-1 px-4 py-3 text-sm leading-relaxed text-foreground shadow-[var(--shadow-sm)]">
                          {msg.image && (
                            <img src={msg.image} alt="Uploaded" className="mb-2 max-h-48 rounded-xl object-cover" />
                          )}
                          {msg.content ? (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          ) : (
                            <div className="flex items-center gap-1.5 px-1 py-1">
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
                    </div>
                  ) : (
                    <div className="flex max-w-[85%] flex-col items-end gap-1 sm:max-w-[72%]">
                      <span className="mono-label pr-1">You</span>
                      <div className="rounded-[16px_4px_16px_16px] bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-[var(--shadow-sm)]">
                        {msg.image && (
                          <img src={msg.image} alt="Uploaded" className="mb-2 max-h-48 rounded-xl object-cover" />
                        )}
                        {msg.content ? <p className="whitespace-pre-wrap">{msg.content}</p> : null}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <AnimatePresence>
        {filePreview && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/30 px-4 pb-1 pt-3"
          >
            <div className="relative inline-block">
              <img src={filePreview} alt="Preview" className="h-20 rounded-xl object-cover shadow-md" />
              <motion.button
                onClick={clearFile}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-md"
              >
                <FiX size={10} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="border-t border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-[720px] px-4 py-4">
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface-1 px-4 py-3 shadow-[var(--shadow-sm)] transition-all focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_12%,transparent),var(--shadow-sm)]">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-surface-offset hover:text-foreground"
              aria-label="Attach file"
            >
              <FiPaperclip size={18} />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask Valeon anything about health..."
              className="min-w-0 flex-1 resize-none bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
            />
            <motion.button
              onClick={handleSend}
              disabled={streaming || (!input.trim() && !file)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="btn-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-0 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send message"
            >
              <FiSend size={16} />
            </motion.button>
          </div>
          <p className="mt-2 text-center mono-label opacity-60">Valeon can make mistakes — verify important health information</p>
        </div>
      </div>
    </div>
  );
}

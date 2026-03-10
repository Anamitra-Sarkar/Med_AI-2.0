"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiSend, FiPaperclip, FiX } from "react-icons/fi";
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

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Welcome message
  const setWelcome = useCallback(() => {
    if (!user) return;
    const displayName = userProfile?.name || user.displayName || null;
    setMessages([{
      role: "assistant",
      content: `Hello${
        displayName ? `, ${displayName}` : ""
      }! I'm Valeon, your AI health companion. I can help you with health questions, analyze medical images, and more. How can I assist you today?`,
    }]);
  }, [user, userProfile]);

  // Load a previous session when activeSessionId changes
  useEffect(() => {
    if (!user || !activeSessionId) {
      // No session requested — show welcome and create fresh on first send
      if (!activeSessionId) {
        setSessionId(null);
        setWelcome();
      }
      return;
    }
    (async () => {
      try {
        const session = await getChatSession(user.uid, activeSessionId);
        if (!isMounted.current) return;
        setSessionId(activeSessionId);
        const loaded: Message[] = (session.messages ?? []).map((m: ChatMessage) => ({
          role: m.role,
          content: m.content,
        }));
        // Prepend welcome only if session is empty
        if (loaded.length === 0) {
          setWelcome();
        } else {
          setMessages(loaded);
        }
      } catch {
        toast.error("Could not load chat session.");
        setWelcome();
      }
    })();
  }, [activeSessionId, user, setWelcome]);

  // Initial welcome on first load (no activeSessionId)
  useEffect(() => {
    if (!activeSessionId) setWelcome();
  }, [user, userProfile, setWelcome, activeSessionId]);

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
    if (!currentSessionId && user) {
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
    if (currentSessionId && user) {
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
      if (currentSessionId && user && assistantContent) {
        appendChatMessage(user.uid, currentSessionId, { role: "assistant", content: assistantContent }).catch(() => {});
      }
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: msg.role === "user" ? 30 : -30, y: 10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[75%] ${
                msg.role === "user"
                  ? "bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg shadow-teal-500/20"
                  : "glass-card text-card-foreground"
              }`}>
                {msg.image && (
                  <img src={msg.image} alt="Uploaded" className="mb-2 max-h-48 rounded-xl object-cover" />
                )}
                {msg.content ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="flex items-center gap-1.5 py-1 px-1">
                    {[0, 1, 2].map((dot) => (
                      <motion.div
                        key={dot}
                        className="h-2 w-2 rounded-full bg-teal-400"
                        animate={{ y: [0, -8, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: dot * 0.15, ease: "easeInOut" }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
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
      <div className="border-t border-border/30 p-3 sm:p-4">
        <div className="flex items-center gap-2 rounded-2xl border border-border/50 bg-card/50 px-3 py-2.5 backdrop-blur-sm transition-all focus-within:border-primary/50 focus-within:shadow-[0_0_12px_rgba(20,184,166,0.15)] sm:px-4 sm:py-3">
          <button onClick={() => fileInputRef.current?.click()}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            aria-label="Attach file">
            <FiPaperclip size={18} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          <input
            type="text" value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask Valeon anything about health..."
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <motion.button onClick={handleSend} disabled={streaming || (!input.trim() && !file)}
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            className="shrink-0 rounded-full bg-gradient-to-r from-teal-500 to-blue-600 p-2 text-white shadow-md transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Send message">
            <FiSend size={16} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}

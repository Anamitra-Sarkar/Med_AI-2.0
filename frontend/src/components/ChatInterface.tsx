"use client";

  import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
  import { motion, AnimatePresence } from "framer-motion";
  import { FiBookmark, FiCheck, FiCopy, FiPaperclip, FiSquare, FiVolume2, FiX } from "react-icons/fi";
  import toast from "react-hot-toast";
  import { useAuth } from "@/context/AuthContext";
  import { buildHealthProfileContext, useWorkspace } from "@/context/WorkspaceContext";
  import {
    chat,
    analyzeImage,
    createChatSession,
    appendChatMessage,
    getChatSession,
    type ChatMessage,
    type UserProfile,
  } from "@/lib/api";

  interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    image?: string;
  }

  interface ChatInterfaceProps {
    activeSessionId?: string | null;
    onSessionCreated?: (sessionId: string) => void;
    prefillPrompt?: string;
    prefillVersion?: number;
  }

  function makeMessageId(suffix: string) {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${suffix}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function MarkdownMessage({ content }: { content: string }) {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let bulletItems: string[] = [];
    let orderedItems: string[] = [];

    function inlineFormat(text: string): string {
      return text
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, '<code class="rounded bg-surface-offset px-1 py-0.5 text-[0.8em] font-mono">$1</code>');
    }

    function flushLists() {
      if (bulletItems.length > 0) {
        elements.push(
          <ul key={`ul-${elements.length}`} className="my-2 space-y-1 pl-4">
            {bulletItems.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
              </li>
            ))}
          </ul>
        );
        bulletItems = [];
      }
      if (orderedItems.length > 0) {
        elements.push(
          <ol key={`ol-${elements.length}`} className="my-2 space-y-1 pl-4">
            {orderedItems.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <span className="shrink-0 font-medium text-primary">{i + 1}.</span>
                <span dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
              </li>
            ))}
          </ol>
        );
        orderedItems = [];
      }
    }

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (/^-+\s+/.test(trimmed) || /^\*\s+/.test(trimmed)) {
        flushLists();
        bulletItems.push(trimmed.replace(/^(-+|\*)\s+/, ""));
        return;
      }
      if (/^\d+\.\s+/.test(trimmed)) {
        if (bulletItems.length > 0) flushLists();
        orderedItems.push(trimmed.replace(/^\d+\.\s+/, ""));
        return;
      }
      if (/^###\s/.test(trimmed)) {
        flushLists();
        elements.push(
          <h4
            key={i}
            className="mt-3 mb-1 text-sm font-semibold text-foreground"
            dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.replace(/^###\s/, "")) }}
          />
        );
        return;
      }
      if (/^##\s/.test(trimmed)) {
        flushLists();
        elements.push(
          <h3
            key={i}
            className="mt-3 mb-1 text-base font-semibold text-foreground"
            dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.replace(/^##\s/, "")) }}
          />
        );
        return;
      }
      if (trimmed === "") {
        flushLists();
        elements.push(<div key={i} className="h-2" />);
        return;
      }
      flushLists();
      elements.push(
        <p key={i} className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed) }} />
      );
    });
    flushLists();

    return <div className="space-y-0.5">{elements}</div>;
  }

  function FollowUpSuggestions({ content, onSelect }: { content: string; onSelect: (q: string) => void }) {
    const suggestions = React.useMemo(() => {
      const lower = content.toLowerCase();
      if (lower.includes("anemia") || lower.includes("hemoglobin") || lower.includes("red blood cell")) return ["What foods help with anemia?", "How is anemia diagnosed?", "Can anemia be cured?"];
      if (lower.includes("diabetes") || lower.includes("blood sugar") || lower.includes("insulin")) return ["What are early signs of diabetes?", "Best diet for diabetics?", "How to monitor blood sugar?"];
      if (lower.includes("blood pressure") || lower.includes("hypertension")) return ["What foods lower blood pressure?", "Can stress cause high BP?", "When is BP considered dangerous?"];
      if (lower.includes("cataract") || lower.includes("eye") || lower.includes("vision")) return ["How is cataract surgery done?", "Can cataracts be prevented?", "Find nearby eye clinics"];
      if (lower.includes("skin") || lower.includes("rash") || lower.includes("dermat")) return ["What causes skin rashes?", "When to see a dermatologist?", "How to care for sensitive skin?"];
      if (lower.includes("heart") || lower.includes("cardiac") || lower.includes("chest")) return ["What are heart attack warning signs?", "How to improve heart health?", "What is normal heart rate?"];
      if (lower.includes("kidney") || lower.includes("renal")) return ["What are early kidney disease signs?", "Best diet for kidney health?", "How to stay hydrated properly?"];
      return ["Tell me more about this", "Find nearby specialists", "What should I watch out for?"];
    }, [content]);

    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }} className="mt-2 flex flex-wrap gap-1.5">
        {suggestions.map((q) => (
          <button
            key={q}
            onClick={() => onSelect(q)}
            className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground hover:shadow-[var(--shadow-sm)]"
          >
            {q}
          </button>
        ))}
      </motion.div>
    );
  }

  function MessageToolbar({
    messageId,
    text,
    supportsSpeech,
    isCopied,
    isSpeaking,
    onCopy,
    onSpeak,
    onSave,
  }: {
    messageId: string;
    text: string;
    supportsSpeech: boolean;
    isCopied: boolean;
    isSpeaking: boolean;
    onCopy: (messageId: string, text: string) => void;
    onSpeak: (messageId: string, text: string) => void;
    onSave: (text: string) => void;
  }) {
    return (
      <div className="pointer-events-none absolute right-2 top-2 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
        <div className="flex gap-1 rounded-lg border border-border bg-surface-1 p-1 shadow-[var(--shadow-md)]">
          <button onClick={() => onCopy(messageId, text)} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-offset hover:text-foreground" aria-label="Copy message" title="Copy">
            {isCopied ? <FiCheck size={12} /> : <FiCopy size={12} />}
          </button>
          {supportsSpeech && (
            <button onClick={() => onSpeak(messageId, text)} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-offset hover:text-foreground" aria-label={isSpeaking ? "Stop reading" : "Read aloud"} title={isSpeaking ? "Stop" : "Read aloud"}>
              {isSpeaking ? <FiSquare size={12} /> : <FiVolume2 size={12} />}
            </button>
          )}
          <button onClick={() => onSave(text)} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-offset hover:text-foreground" aria-label="Save to notes" title="Save to notes">
            <FiBookmark size={12} />
          </button>
        </div>
      </div>
    );
  }

  export default function ChatInterface({ activeSessionId, onSessionCreated, prefillPrompt, prefillVersion }: ChatInterfaceProps) {
    const { user, userProfile } = useAuth();
    const { healthProfile, addNote } = useWorkspace();
    const healthContext = useMemo(() => buildHealthProfileContext(healthProfile), [healthProfile]);
    const augmentedProfile = useMemo<UserProfile | null>(() => {
      if (!userProfile || !healthContext) return userProfile;
      return {
        ...userProfile,
        diseases: [userProfile.diseases, healthContext].filter(Boolean).join(" | "),
      };
    }, [userProfile, healthContext]);
    const canPersist = Boolean(user && !user.isGuest);
    const [messages, setMessages] = useState<Message[]>([]);
    const [hasStarted, setHasStarted] = useState(false);
    const [input, setInput] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);
    const [streaming, setStreaming] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [typingSpeed, setTypingSpeed] = useState<"instant" | "normal" | "slow">("instant");
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
    const [speechSupported, setSpeechSupported] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const isMounted = useRef(true);
    const copyTimeoutRef = useRef<number | null>(null);
    const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const assistantMessageIdRef = useRef<string | null>(null);
    const assistantRawRef = useRef("");
    const streamPendingRef = useRef("");
    const slowQueueRef = useRef("");
    const normalFlushRef = useRef<number | null>(null);
    const slowRafRef = useRef<number | null>(null);
    const streamActiveRef = useRef(false);

    useEffect(() => {
      isMounted.current = true;
      setSpeechSupported(typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
      return () => {
        isMounted.current = false;
        if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
        if (window.speechSynthesis) window.speechSynthesis.cancel();
      };
    }, []);

    const scrollToBottom = useCallback(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
      scrollToBottom();
    }, [messages, scrollToBottom]);

    useEffect(() => {
      if (prefillPrompt?.trim()) setInput(prefillPrompt);
    }, [prefillPrompt, prefillVersion]);

    useEffect(() => {
      if (activeSessionId && canPersist && user) {
        setHasStarted(true);
        (async () => {
          try {
            const session = await getChatSession(user.uid, activeSessionId);
            if (!isMounted.current) return;
            setSessionId(activeSessionId);
            const loaded: Message[] = (session.messages ?? []).map((m: ChatMessage, i: number) => ({
              id: m.ts || `${activeSessionId}-${i}`,
              role: m.role,
              content: m.content,
            }));
            setMessages(loaded.length > 0 ? loaded : []);
            setHasStarted(loaded.length > 0);
          } catch {
            toast.error("Could not load chat session.");
            setMessages([]);
            setHasStarted(false);
          }
        })();
        return;
      }
      setMessages([]);
      setHasStarted(false);
      setSessionId(null);
    }, [activeSessionId, canPersist, user]);

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
      const selected = e.target.files?.[0];
      if (!selected) return;
      if (selected.size > 10 * 1024 * 1024) {
        toast.error("File must be under 10 MB");
        return;
      }
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

    const appendAssistantText = useCallback((chunk: string) => {
      const assistantId = assistantMessageIdRef.current;
      if (!assistantId || !chunk) return;
      setMessages((prev) => prev.map((message) => (message.id === assistantId ? { ...message, content: message.content + chunk } : message)));
    }, []);

    const stopNormalFlush = useCallback(() => {
      if (normalFlushRef.current !== null) {
        window.clearInterval(normalFlushRef.current);
        normalFlushRef.current = null;
      }
    }, []);

    const stopSlowFlush = useCallback(() => {
      if (slowRafRef.current !== null) {
        window.cancelAnimationFrame(slowRafRef.current);
        slowRafRef.current = null;
      }
    }, []);

    const flushBufferedOutput = useCallback(() => {
      const remainder = `${streamPendingRef.current}${slowQueueRef.current}`;
      if (remainder) appendAssistantText(remainder);
      streamPendingRef.current = "";
      slowQueueRef.current = "";
      stopNormalFlush();
      stopSlowFlush();
      streamActiveRef.current = false;
    }, [appendAssistantText, stopNormalFlush, stopSlowFlush]);

    const scheduleNormalFlush = useCallback(() => {
      if (normalFlushRef.current !== null) return;
      normalFlushRef.current = window.setInterval(() => {
        if (streamPendingRef.current) {
          const chunk = streamPendingRef.current;
          streamPendingRef.current = "";
          appendAssistantText(chunk);
        }
        if (!streamActiveRef.current && !streamPendingRef.current) {
          stopNormalFlush();
        }
      }, 40);
    }, [appendAssistantText, stopNormalFlush]);

    const scheduleSlowFlush = useCallback(() => {
      if (slowRafRef.current !== null) return;
      const tick = () => {
        if (!slowQueueRef.current.length && streamPendingRef.current.length) {
          slowQueueRef.current += streamPendingRef.current;
          streamPendingRef.current = "";
        }
        if (slowQueueRef.current.length > 0) {
          appendAssistantText(slowQueueRef.current[0]);
          slowQueueRef.current = slowQueueRef.current.slice(1);
        }
        if (streamActiveRef.current || streamPendingRef.current.length || slowQueueRef.current.length) {
          slowRafRef.current = window.requestAnimationFrame(tick);
        } else {
          slowRafRef.current = null;
        }
      };
      slowRafRef.current = window.requestAnimationFrame(tick);
    }, [appendAssistantText]);

    const handleChunk = useCallback((chunk: string) => {
      assistantRawRef.current += chunk;
      if (typingSpeed === "instant") {
        appendAssistantText(chunk);
        return;
      }
      streamPendingRef.current += chunk;
      if (typingSpeed === "normal") scheduleNormalFlush();
      else scheduleSlowFlush();
    }, [appendAssistantText, scheduleNormalFlush, scheduleSlowFlush, typingSpeed]);

    const handleCopyMessage = useCallback(async (messageId: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedMessageId(messageId);
        if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = window.setTimeout(() => setCopiedMessageId(null), 1500);
      } catch {
        toast.error("Could not copy message.");
      }
    }, []);

    const stopSpeaking = useCallback(() => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      speechUtteranceRef.current = null;
      setSpeakingMessageId(null);
    }, []);

    const handleToggleSpeech = useCallback((messageId: string, text: string) => {
      if (!speechSupported || typeof window === "undefined") return;
      if (speakingMessageId === messageId && window.speechSynthesis.speaking) {
        stopSpeaking();
        return;
      }
      stopSpeaking();
      const utterance = new SpeechSynthesisUtterance(text);
      speechUtteranceRef.current = utterance;
      utterance.onend = () => {
        if (speechUtteranceRef.current === utterance) {
          speechUtteranceRef.current = null;
          setSpeakingMessageId(null);
        }
      };
      utterance.onerror = () => {
        if (speechUtteranceRef.current === utterance) {
          speechUtteranceRef.current = null;
          setSpeakingMessageId(null);
        }
      };
      setSpeakingMessageId(messageId);
      window.speechSynthesis.speak(utterance);
    }, [speechSupported, speakingMessageId, stopSpeaking]);

    const handleSaveNote = useCallback((text: string) => {
      addNote(text);
      toast.success("Saved to notes");
    }, [addNote]);

    async function handleSend() {
      if ((!input.trim() && !file) || streaming) return;
      setHasStarted(true);
      const userContent = input.trim();
      const userMsg: Message = {
        id: makeMessageId("user"),
        role: "user",
        content: userContent,
        ...(filePreview && { image: filePreview }),
      };
      setMessages((prev) => [...prev, userMsg]);
      let messageToSend = userContent;
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
          if (result.analysis) messageToSend = `[Image uploaded] ${result.analysis}

${messageToSend}`;
        } catch {
          // continue
        }
      }

      if (currentSessionId && canPersist && user) {
        appendChatMessage(user.uid, currentSessionId, { role: "user", content: userMsg.content }).catch(() => {});
      }

      const assistantId = makeMessageId("assistant");
      assistantMessageIdRef.current = assistantId;
      assistantRawRef.current = "";
      streamPendingRef.current = "";
      slowQueueRef.current = "";
      streamActiveRef.current = true;
      stopNormalFlush();
      stopSlowFlush();
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        const apiHistory = healthContext ? [{ role: "system", content: healthContext }, ...history] : history;
        const apiMessage = healthContext ? `${healthContext}

${messageToSend}` : messageToSend;

        await chat(apiMessage, handleChunk, controller.signal, apiHistory, augmentedProfile);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const fallback = "I'm sorry, I couldn't process your request right now. Please try again.";
          assistantRawRef.current = fallback;
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "assistant" && !last.content) {
              updated[updated.length - 1] = { ...last, content: fallback };
            }
            return updated;
          });
        }
      } finally {
        flushBufferedOutput();
        setStreaming(false);
        abortRef.current = null;
        assistantMessageIdRef.current = null;
        if (currentSessionId && canPersist && user && assistantRawRef.current) {
          appendChatMessage(user.uid, currentSessionId, { role: "assistant", content: assistantRawRef.current }).catch(() => {});
        }
      }
    }

    return (
      <div className="flex flex-1 flex-col overflow-hidden bg-background text-foreground">
        <div className="medfield-bg relative flex flex-1 min-h-0 flex-col overflow-y-auto">
          {!hasStarted && (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center" style={{ minHeight: 'calc(100vh - 180px)' }}>
              <div className="fade-up relative">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-1 ring-1 ring-border shadow-[var(--shadow-lg)]">
                  <svg viewBox="0 0 32 32" fill="none" className="h-8 w-8" aria-hidden>
                    <path d="M16 5L27 23H5L16 5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="text-primary" />
                    <circle cx="16" cy="19" r="1.75" fill="currentColor" className="text-primary" />
                  </svg>
                </div>
                <div className="absolute inset-0 rounded-2xl ring-1 ring-primary/20 animate-ping" style={{ animationDuration: '3s' }} />
              </div>
              <div className="fade-up-delay-1 flex flex-col gap-2">
                <h2 className="hero-type text-[clamp(2rem,5vw,3rem)] leading-tight text-foreground">Ask Valeon anything</h2>
                <p className="mono-label">Health questions, image analysis, nearby care</p>
              </div>
              <div className="fade-up-delay-2 flex max-w-md flex-wrap justify-center gap-2">
                {[
                  'What are symptoms of anemia?',
                  'Explain my MRI results',
                  'Find nearby clinics',
                  'Is high blood pressure dangerous?',
                  'Analyze my eye scan',
                  'What causes diabetes?',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="rounded-full border border-border bg-surface-1 px-3.5 py-1.5 text-xs text-muted-foreground shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground hover:shadow-[var(--shadow-md)]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasStarted && (
            <div className="relative z-10 mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-6">
              <AnimatePresence initial={false}>
                {messages.map((msg, i) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, x: msg.role === 'user' ? 30 : -30, y: 10 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="group relative flex max-w-[85%] items-start gap-3 sm:max-w-[72%]">
                        {msg.content.trim() && (
                          <MessageToolbar
                            messageId={msg.id}
                            text={msg.content}
                            supportsSpeech={speechSupported}
                            isCopied={copiedMessageId === msg.id}
                            isSpeaking={speakingMessageId === msg.id}
                            onCopy={handleCopyMessage}
                            onSpeak={handleToggleSpeech}
                            onSave={handleSaveNote}
                          />
                        )}
                        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-offset text-primary ring-1 ring-border">
                          <svg viewBox="0 0 32 32" fill="none" className="h-4 w-4" aria-hidden>
                            <path d="M16 5L27 23H5L16 5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="mono-label">Valeon</span>
                          <div className="relative rounded-[4px_16px_16px_16px] border border-border bg-surface-1 px-4 py-3 pr-12 text-sm leading-relaxed text-foreground shadow-[var(--shadow-sm)]">
                            {msg.image && <img src={msg.image} alt="Uploaded" className="mb-3 max-h-48 rounded-xl object-cover" />}
                            {msg.content ? (
                              <>
                                <MarkdownMessage content={msg.content} />
                                {i === messages.length - 1 && !streaming && <FollowUpSuggestions content={msg.content} onSelect={(q) => setInput(q)} />}
                              </>
                            ) : (
                              <div className="flex items-center gap-1.5 px-1 py-1">
                                <div className="dot-1 h-2 w-2 rounded-full bg-primary" />
                                <div className="dot-2 h-2 w-2 rounded-full bg-primary" />
                                <div className="dot-3 h-2 w-2 rounded-full bg-primary" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex max-w-[85%] flex-col items-end gap-1 sm:max-w-[72%]">
                        <span className="mono-label pr-1">You</span>
                        <div className="rounded-[16px_4px_16px_16px] bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-[var(--shadow-sm)]">
                          {msg.image && <img src={msg.image} alt="Uploaded" className="mb-2 max-h-48 rounded-xl object-cover" />}
                          {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <AnimatePresence>
          {filePreview && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
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
              <button onClick={() => fileInputRef.current?.click()} className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-surface-offset hover:text-foreground" aria-label="Attach file">
                <FiPaperclip size={18} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
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
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                className={`btn-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-0 disabled:cursor-not-allowed disabled:opacity-40 ${input.trim() || file ? 'btn-breathe' : ''}`}
                aria-label="Send message"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </motion.button>
            </div>
            <div className="mt-2 flex flex-col items-center gap-2 text-[var(--text-xs)]">
              <div className="flex items-center gap-2">
                <span className="mono-label">Typing speed</span>
                <div className="flex gap-1 rounded-full border border-border bg-surface-1 p-1">
                  {(['instant', 'normal', 'slow'] as const).map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setTypingSpeed(speed)}
                      className={`rounded-full px-2.5 py-1 text-[var(--text-xs)] transition-colors ${typingSpeed === speed ? 'bg-surface-offset text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {speed.charAt(0).toUpperCase() + speed.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-center mono-label opacity-60">Valeon can make mistakes — verify important health information</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

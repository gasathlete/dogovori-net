import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Loader2, Plus, AlertCircle, MessageSquare, Trash2, Handshake, Paperclip, Share2, Download, BookOpen, X, MessagesSquare, LayoutPanelLeft } from "@/icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsPro } from "@/hooks/useIsPro";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Crown } from "@/icons";

import { LegalCitations, type LegalCitation } from "@/components/LegalCitations";
import { AssistantToolCard, type ToolEvent } from "@/components/assistant/AssistantToolCard";
import { AssistantThinkingStatus } from "@/components/assistant/AssistantThinkingStatus";
import { resetAssistantDraft } from "@/components/assistant/assistantDraftStore";
import {
  clearAssistantDocumentContext,
  setAssistantDocumentContext,
  contextIdentityKey,
  kindLabel,
  toRequestContext,
  useAssistantDocumentContext,
} from "@/lib/assistantDocumentContext";

export interface ProgressStep {
  step: string;
  label: string;
  status: "active" | "done";
}

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: LegalCitation[];
  toolEvents?: ToolEvent[];
  followups?: string[];
  progress?: ProgressStep[];
}

// Wrap inline legal citations like [ЗЗД, чл. 79] / [КТ, чл. 328, ал. 1] /
// [ТР № 4/2013 ОСГТК ВКС] / [Решение № 173 от 2009 г. на ВКС] in backticks
// so ReactMarkdown renders them as <code> — which our prose styles color gold.
const CITATION_RE = /\[((?:[А-ЯA-Z][^\[\]\n]{0,120}?(?:чл\.?\s*\d+[а-яА-Я]?|Решение\s*№|ТР\s*№|GDPR|приложим\s+общ\s+режим)[^\[\]\n]{0,120}?))\]/g;
function highlightCitations(md: string): string {
  if (!md) return md;
  // Skip lines inside fenced code blocks.
  const parts = md.split(/(```[\s\S]*?```)/g);
  return parts
    .map((p, i) => (i % 2 === 1 ? p : p.replace(CITATION_RE, (_m, inner) => `\`[${inner}]\``)))
    .join("");
}

const FOLLOWUPS_RE = /<followups>([\s\S]*?)<\/followups>/i;
function extractFollowups(raw: string): { content: string; followups: string[] } {
  if (!raw) return { content: raw, followups: [] };
  const m = raw.match(FOLLOWUPS_RE);
  if (!m) return { content: raw, followups: [] };
  const followups = m[1]
    .split(/\|\||\n/)
    .map((s) => s.trim().replace(/^[-•\d.)\s]+/, ""))
    .filter((s) => s.length > 0 && s.length <= 80)
    .slice(0, 4);
  return { content: raw.replace(FOLLOWUPS_RE, "").trim(), followups };
}

interface Thread {
  id: string;
  title: string;
  updated_at: string;
  /** Q2e: сървърно обвързване на разговора с документ (null = общ разговор). */
  context_kind?: string | null;
  context_entity_id?: string | null;
  context_title?: string | null;
}

/** Разговорът е съвместим само с точно същия обхват (документ или общ). */
function threadMatchesContext(
  thread: Thread,
  ctx: { kind: string; entityId: string } | null,
): boolean {
  const tk = thread.context_kind ?? null;
  const ti = thread.context_entity_id ?? null;
  if (!ctx) return tk === null && ti === null;
  return tk === ctx.kind && ti === ctx.entityId;
}

const QUICK_ACTIONS = [
  { label: "🔍 Правни проучвания", text: "Направи правно проучване по ЗЗД относно неустойки — цитирай актуални редакции." },
  { label: "📄 Анализ на документ", text: "Искам да кача договор и да получа правен риск-анализ." },
  { label: "🛠️ Създаване на документ", text: "Помогни ми да създам трудов договор с конкретни клаузи." },
  { label: "📦 Комплекти документи", text: "Покажи ми комплекти документи за стартиране на ЕООД." },
];

const dogovaiIcon = "/dogovai-favicon.png";

const ACTIVE_THREAD_STORAGE_PREFIX = "dogovaryai_active_thread:";

function getActiveThreadStorageKey(userId: string) {
  return `${ACTIVE_THREAD_STORAGE_PREFIX}${userId}`;
}

export function AssistantChat({ compact = false, embedded = false, threadId: threadIdProp, onThreadChange }: { compact?: boolean; embedded?: boolean; threadId?: string | null; onThreadChange?: (id: string | null) => void } = {}) {
  const { user, session } = useAuth();
  const requireAuth = useRequireAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { isPro, isTeam, freeQuota, refresh: refreshPlan } = useIsPro();
  const aiRemaining = Math.max(0, freeQuota.aiMessagesCap - freeQuota.aiMessagesUsed);
  const aiLocked = !isPro && !isTeam && aiRemaining <= 0;
  const activeThreadStorageKey = user ? getActiveThreadStorageKey(user.id) : null;
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingTools, setStreamingTools] = useState<ToolEvent[]>([]);
  const [streamingProgress, setStreamingProgress] = useState<ProgressStep[]>([]);
  const [negotiationMode, setNegotiationMode] = useState(false);
  const [showSources, setShowSources] = useState(true);
  const [mobilePane, setMobilePane] = useState<"chat" | "panel">("chat");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Q2e: избран документен контекст (само метаданни, само в паметта).
  const documentContext = useAssistantDocumentContext();
  const contextKey = contextIdentityKey(documentContext);
  const requestContext = toRequestContext(documentContext);
  const documentContextRef = useRef(documentContext);
  documentContextRef.current = documentContext;
  const [serverContext, setServerContext] = useState<
    { kind: string; title: string; truncated: boolean } | null
  >(null);
  const [staleContext, setStaleContext] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Идентичност на заявката: обхват + монотонна последователност. Стари делти,
  // грешки, tool call-ове, thread ID-та и текст не могат да влязат в новия UI.
  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const executeClientTool = useCallback((name: string, args: any) => {
    try {
      if (name === "navigate" && typeof args?.path === "string") {
        setTimeout(() => navigate(args.path), 400);
        return;
      }
      if (name === "open_template" && typeof args?.slug === "string") {
        setTimeout(() => navigate(`/shablon/${args.slug}`), 400);
        return;
      }
      if (name === "open_upload_analyzer") {
        setTimeout(() => navigate("/analyze"), 400);
        return;
      }
      if (name === "prefill_build_contract") {
        const params = new URLSearchParams();
        if (args?.documentType) params.set("documentType", String(args.documentType));
        if (args?.name) params.set("name", String(args.name));
        if (args?.partiesA) params.set("partiesA", String(args.partiesA));
        if (args?.partiesB) params.set("partiesB", String(args.partiesB));
        if (args?.subject) params.set("subject", String(args.subject));
        if (args?.bilingual) params.set("bilingual", "1");
        params.set("from", "dogovaryai");
        setTimeout(() => navigate(`/build?${params.toString()}`), 500);
        return;
      }
    } catch (e) {
      console.error("Tool execution failed:", e);
    }
  }, [navigate]);


  const setPersistedActiveThreadId = useCallback((nextThreadId: string | null) => {
    setActiveThreadId(nextThreadId);
    onThreadChange?.(nextThreadId);
    if (!activeThreadStorageKey || typeof window === "undefined") return;
    try {
      if (nextThreadId) {
        localStorage.setItem(activeThreadStorageKey, nextThreadId);
      } else {
        localStorage.removeItem(activeThreadStorageKey);
      }
    } catch {
      /* ignore */
    }
  }, [activeThreadStorageKey, onThreadChange]);

  // Sync from external prop (URL-driven)
  useEffect(() => {
    if (threadIdProp === undefined) return;
    if (threadIdProp !== activeThreadId) {
      setActiveThreadId(threadIdProp);
    }
  }, [threadIdProp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeThreadStorageKey || typeof window === "undefined") {
      setActiveThreadId(null);
      return;
    }
    try {
      setActiveThreadId(localStorage.getItem(activeThreadStorageKey));
    } catch {
      setActiveThreadId(null);
    }
  }, [activeThreadStorageKey]);

  // Load threads
  const loadThreads = useCallback(async () => {
    if (!user) return;
    // Контекстните колони още не са в генерираните типове (миграция 0015).
    const { data } = await supabase
      .from("assistant_threads")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(20);
    const nextThreads = (data ?? []) as unknown as Thread[];
    setThreads(nextThreads);

    // Само разговори със същия обхват са допустими за автоматичен избор —
    // разговор, обвързан с друг документ, никога не се преизползва наготово.
    const compatible = nextThreads.filter((t) => threadMatchesContext(t, requestContext));

    if (compatible.length === 0) {
      setPersistedActiveThreadId(null);
      return;
    }

    const preferredThreadId = activeThreadId ?? (activeThreadStorageKey && typeof window !== "undefined"
      ? localStorage.getItem(activeThreadStorageKey)
      : null);

    if (preferredThreadId && compatible.some((thread) => thread.id === preferredThreadId)) {
      if (preferredThreadId !== activeThreadId) {
        setActiveThreadId(preferredThreadId);
      }
      return;
    }

    setPersistedActiveThreadId(compatible[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeThreadId, activeThreadStorageKey, setPersistedActiveThreadId, contextKey]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Смяна/изчистване на контекста: прекъсваме текущия стрийм и започваме
  // съвместим разговор. Резултати от стария обхват не могат да се появят.
  useEffect(() => {
    requestSeqRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setStreamingText("");
    setStreamingTools([]);
    setStreamingProgress([]);
    setServerContext(null);
    setStaleContext(false);
    setMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey]);


  // Load messages for active thread
  useEffect(() => {
    resetAssistantDraft();
    if (!activeThreadId) { setMessages([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("assistant_messages")
        .select("id, role, content")
        .eq("thread_id", activeThreadId)
        .order("created_at", { ascending: true });
      if (!cancelled) {
        const rows = (data ?? []) as Msg[];
        setMessages(
          rows.map((m) => {
            if (m.role !== "assistant") return m;
            const { content, followups } = extractFollowups(m.content || "");
            return { ...m, content, followups };
          }),
        );
      }
    })();
    return () => { cancelled = true; };
  }, [activeThreadId]);

  // Разширеният изглед (/assistant/:threadId): контекстът се взема САМО от
  // сървърния ред на разговора — не от URL параметри, localStorage или текст.
  useEffect(() => {
    if (!activeThreadId || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("assistant_threads")
        .select("*")
        .eq("id", activeThreadId)
        .maybeSingle();
      if (cancelled || !data) return;
      const row = data as unknown as Thread;
      if (row.context_kind && row.context_entity_id) {
        setAssistantDocumentContext({
          kind: row.context_kind,
          entityId: row.context_entity_id,
          displayTitle: row.context_title ?? "",
        });
      } else if (documentContextRef.current) {
        clearAssistantDocumentContext();
      }
    })();
    return () => { cancelled = true; };
  }, [activeThreadId, user]);

  // Smart auto-scroll: only follow the bottom if the user is already near the
  // bottom. Otherwise leave their scroll position alone so they can read
  // older messages while a new response streams in (Lovable-style).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 120;
    if (nearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: streaming ? "auto" : "smooth" });
    }
  }, [messages, streamingText, streaming]);

  // Auto-resize the textarea up to its max-height as the user types.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  // Auto-focus textarea — but NOT on touch devices, where focusing the
  // textarea pops the on-screen keyboard the moment the chat opens and
  // pushes the page around. On desktop we keep the snappy keyboard-first
  // behavior.
  useEffect(() => {
    if (streaming) return;
    const isTouch = typeof window !== "undefined"
      && (window.matchMedia?.("(hover: none)").matches || "ontouchstart" in window);
    if (!isTouch) textareaRef.current?.focus();
  }, [streaming, activeThreadId]);


  const handleNewThread = () => {
    setPersistedActiveThreadId(null);
    setMessages([]);
    setStreamingText("");
    setMobilePane("chat");
    textareaRef.current?.focus();
  };

  const handleDeleteThread = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId((cur) => (cur === id ? null : cur)), 3000);
      return;
    }
    setConfirmDeleteId(null);
    // Optimistic remove
    setThreads((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from("assistant_threads").delete().eq("id", id);
    if (error) {
      toast.error("Грешка при триене: " + error.message);
      loadThreads();
      return;
    }
    if (activeThreadId === id) {
      setPersistedActiveThreadId(null);
      setMessages([]);
    }
    toast.success("Разговорът е изтрит");
    loadThreads();
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming) return;
    if (!requireAuth({ action: "Изпрати съобщение до DogovaryAI" })) return;
    if (!session?.access_token) return;

    // Q2e/C: сървърът е ЕДИНСТВЕНАТА точка на резервация — клиентът вече не
    // извиква consume_ai_message (двойното таксуване е премахнато).

    const finalText = negotiationMode
      ? `[ПРЕГОВОРЕН РЕЖИМ] ${text.trim()}\n\n(Анализирай условията от позиция на договаряща страна, идентифицирай слабости в офертата на отсрещната страна и предложи аргументирани контра-предложения с правно основание.)`
      : text.trim();
    const userMsg: Msg = { id: `tmp-u-${Date.now()}`, role: "user", content: finalText };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);
    setStreamingText("");
    setStreamingTools([]);
    setStreamingProgress([]);
    setStaleContext(false);

    // Идентичност на тази заявка: обхват + номер. Всичко по-старо се игнорира.
    const seq = ++requestSeqRef.current;
    const scopeKey = contextKey;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const isCurrent = () =>
      aliveRef.current && seq === requestSeqRef.current && scopeKey === contextIdentityKey(
        // Проверяваме срещу текущия store, не срещу стар render.
        documentContextRef.current,
      );


    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assistant-chat`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          threadId: activeThreadId,
          currentPath: location.pathname,
          // Само {kind, entityId} — никакъв текст, payload или заглавие.
          documentContext: requestContext,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Грешка" }));
        if (!isCurrent()) return;
        const code = String((err as { code?: unknown })?.code ?? "");
        if (code === "document_context_stale") {
          setStaleContext(true);
          toast.error("Документът е променен след започването на този разговор.");
        } else if (code === "document_context_mismatch") {
          toast.error("Този разговор е обвързан с друг документ. Започнете нов разговор.");
        } else if (code === "document_not_found") {
          toast.error("Документът не е намерен или нямате достъп до него.");
        } else {
          toast.error((err as { error?: string }).error || "Грешка при изпращане");
        }
        setMessages(messages);
        setStreaming(false);
        // Квотата може да е отказала заявката — опресняваме показаното.
        void refreshPlan();
        return;
      }


      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accText = "";
      const accTools: ToolEvent[] = [];
      let receivedThreadId: string | null = null;
      let receivedCitations: LegalCitation[] = [];
      let receivedFollowups: string[] = [];
      const accProgress: ProgressStep[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        // Смяна на документа / нова заявка / unmount → нищо не влиза в UI.
        if (!isCurrent()) {
          try { await reader.cancel(); } catch { /* ignore */ }
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          if (!isCurrent()) return;
          const lines = evt.split("\n");
          let eventType = "";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
          }
          if (!dataLine) continue;
          if (dataLine === "[DONE]" || dataLine === '"[DONE]"') continue;
          let parsed: any;
          try { parsed = JSON.parse(dataLine); } catch { continue; }

          if (eventType === "meta") {
            if (parsed.threadId) receivedThreadId = parsed.threadId;
            if (Array.isArray(parsed.citations)) receivedCitations = parsed.citations;
            // Сървърните метаданни са авторитетни за етикета на контекста.
            const dc = parsed.documentContext;
            if (dc && typeof dc === "object" && typeof dc.kind === "string") {
              setServerContext({
                kind: String(dc.kind),
                title: String(dc.title ?? ""),
                truncated: dc.truncated === true,
              });
            } else {
              setServerContext(null);
            }
          } else if (eventType === "error") {
            toast.error(parsed.message || "AI грешка");
          } else if (eventType === "progress") {
            const step = String(parsed.step || "");
            const label = String(parsed.label || "");
            const status = parsed.status === "done" ? "done" : "active";
            const existingIdx = accProgress.findIndex((s) => s.step === step);
            if (existingIdx >= 0) {
              accProgress[existingIdx] = { step, label, status };
            } else {
              accProgress.push({ step, label, status });
            }
            setStreamingProgress([...accProgress]);
          } else if (eventType === "followups") {
            if (Array.isArray(parsed.followups)) receivedFollowups = parsed.followups;
          } else if (eventType === "final_text") {
            accText = String(parsed.content || "");
            setStreamingText(accText);
          } else if (eventType === "tool_result") {
            const ev: ToolEvent = { kind: "tool_result", id: parsed.id, name: parsed.name, args: parsed.args, result: parsed.result };
            accTools.push(ev);
            setStreamingTools([...accTools]);
          } else if (eventType === "tool_call") {
            const ev: ToolEvent = { kind: "tool_call", id: parsed.id, name: parsed.name, args: parsed.args };
            accTools.push(ev);
            setStreamingTools([...accTools]);
            executeClientTool(parsed.name, parsed.args);
          } else if (parsed.delta) {
            accText += parsed.delta;
            setStreamingText(accText);
          }

        }
      }

      if (!isCurrent()) return;

      // Finalize — prefer server-emitted followups; fall back to inline tag parse.
      const { content: cleanText, followups: inlineFollowups } = extractFollowups(accText);
      const finalFollowups = receivedFollowups.length > 0 ? receivedFollowups : inlineFollowups;
      const assistantMsg: Msg = {
        id: `tmp-a-${Date.now()}`,
        role: "assistant",
        content: cleanText,
        citations: receivedCitations,
        toolEvents: accTools.length > 0 ? accTools : undefined,
        followups: finalFollowups,
        progress: accProgress.length > 0 ? accProgress : undefined,
      };
      setMessages([...newMessages, assistantMsg]);
      setStreamingText("");
      setStreamingTools([]);
      setStreamingProgress([]);
      if (receivedThreadId && receivedThreadId !== activeThreadId) {
        setPersistedActiveThreadId(receivedThreadId);
      }
      loadThreads();
      // Опресняваме показаното потребление след успешна заявка.
      void refreshPlan();
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError" || !isCurrent()) return;
      console.error(err);
      toast.error("Грешка при връзка с асистента");
      setMessages(messages);
    } finally {
      if (isCurrent()) setStreaming(false);
    }
  };



  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0 && !streaming;

  // Aggregate citations across the conversation (deduped by chunk_id)
  const allCitations: LegalCitation[] = (() => {
    const map = new Map<string, LegalCitation>();
    for (const m of messages) {
      if (m.citations) for (const c of m.citations) map.set(c.chunk_id, c);
    }
    return Array.from(map.values());
  })();

  // File drop → upload analyzer
  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    const ok = /\.(pdf|docx?|txt)$/i.test(f.name);
    if (!ok) {
      toast.error("Поддържат се PDF / DOCX / TXT файлове");
      return;
    }
    toast.info(`Качване на „${f.name}" в анализатора...`);
    // Defer to /analyze which has full upload + analysis pipeline
    navigate("/analyze");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  // Export conversation as Markdown
  const exportConversation = () => {
    const md = messages.map((m) =>
      `### ${m.role === "user" ? "Аз" : "DogovaryAI"}\n\n${m.content}\n`,
    ).join("\n---\n\n");
    const blob = new Blob([`# Разговор · DogovaryAI\n\n${md}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dogovaryai-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareConversation = async () => {
    const text = messages.map((m) => `${m.role === "user" ? "Аз" : "AI"}: ${m.content}`).join("\n\n");
    try {
      if (navigator.share) await navigator.share({ title: "DogovaryAI разговор", text });
      else { await navigator.clipboard.writeText(text); toast.success("Копирано в clipboard"); }
    } catch { /* user cancelled */ }
  };

  return (
    <div
      className={cn("flex flex-col", embedded ? "h-full" : compact ? "h-full" : "h-[calc(100dvh-12rem)] min-h-[500px]")}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Mobile pane switch — Chat | Панел. Visible only under md. */}
      <div className="md:hidden mb-2 shrink-0 rounded-xl border border-border/50 bg-card/40 p-1 backdrop-blur-sm">
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setMobilePane("chat")}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition-all",
              mobilePane === "chat"
                ? "bg-gradient-to-b from-gold to-gold/80 text-navy shadow-[0_4px_14px_-4px_hsl(var(--gold)/0.5)]"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={mobilePane === "chat"}
          >
            <MessagesSquare className="h-3.5 w-3.5" />
            <span>Чат</span>
          </button>
          <button
            type="button"
            onClick={() => setMobilePane("panel")}
            className={cn(
              "relative inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition-all",
              mobilePane === "panel"
                ? "bg-gradient-to-b from-gold to-gold/80 text-navy shadow-[0_4px_14px_-4px_hsl(var(--gold)/0.5)]"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={mobilePane === "panel"}
          >
            <LayoutPanelLeft className="h-3.5 w-3.5" />
            <span>Панел</span>
            {threads.length > 0 && (
              <span className={cn(
                "ml-0.5 inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums",
                mobilePane === "panel" ? "bg-navy/15 text-navy" : "bg-muted text-muted-foreground",
              )}>
                {threads.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-1 gap-3 sm:gap-4 min-h-0">

      {/* Threads sidebar */}
      <aside className={cn("w-64 flex-col rounded-xl border border-border/50 bg-card/30 p-3 backdrop-blur-sm", embedded ? "hidden md:flex" : compact ? "hidden" : "hidden md:flex")}>
        <button
          type="button"
          onClick={handleNewThread}
          className="group relative mb-3 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-gold to-gold/80 px-3 py-2.5 text-sm font-bold text-navy shadow-[0_6px_18px_-6px_hsl(var(--gold)/0.5)] transition-all hover:shadow-[0_10px_24px_-6px_hsl(var(--gold)/0.65)] active:scale-[0.98]"
        >
          <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
          <MessageSquare className="relative h-4 w-4" />
          <span className="relative">Нов разговор</span>
        </button>
        <div className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
          {threads.length > 0 ? "Този месец" : "История"}
        </div>
        <ScrollArea className="flex-1 -mx-1 px-1">
          <div className="space-y-0.5">
            {threads.length === 0 && (
              <p className="px-2 py-6 text-center text-[11px] text-muted-foreground/70">Все още няма разговори</p>
            )}
            {threads.map((t) => (
              <div
                key={t.id}
                onClick={() => setPersistedActiveThreadId(t.id)}
                className={cn(
                  "group relative flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-all",
                  activeThreadId === t.id
                    ? "bg-gold/10 text-foreground"
                    : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                )}
              >
                {activeThreadId === t.id && (
                  <span className="absolute -left-1 top-1.5 bottom-1.5 w-0.5 rounded-r bg-gold shadow-[0_0_8px_hsl(var(--gold)/0.7)]" />
                )}
                <MessageSquare className={cn("h-3 w-3 shrink-0", activeThreadId === t.id ? "text-gold" : "text-muted-foreground/60")} />
                <span className="flex-1 truncate">{t.title}</span>
                {t.context_title && (
                  <span className="max-w-[45%] shrink-0 truncate rounded border border-gold/30 bg-gold/10 px-1 text-[9px] text-gold">
                    {t.context_title}
                  </span>
                )}
                <button
                  onClick={(e) => handleDeleteThread(t.id, e)}
                  className={cn(
                    "shrink-0 rounded-md p-1 text-[10px] transition-all",
                    confirmDeleteId === t.id
                      ? "bg-destructive text-destructive-foreground"
                      : "text-muted-foreground/80 hover:bg-destructive/15 hover:text-destructive",
                  )}
                  aria-label={confirmDeleteId === t.id ? "Потвърди триене" : "Изтрий разговор"}
                  title={confirmDeleteId === t.id ? "Натисни пак за потвърждение" : "Изтрий разговор"}
                  type="button"
                >
                  {confirmDeleteId === t.id ? "Потвърди?" : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Quota card — операции = съобщения */}
        {!isPro && !isTeam && (
          <div className="mt-2 space-y-2">
            <div className="rounded-xl border border-gold/40 bg-gradient-to-br from-gold/15 to-gold/5 p-3 shadow-[0_8px_24px_-12px_hsl(var(--gold)/0.35)]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">🎁</span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-foreground">Безплатни операции</div>
                    <div className="text-[10px] text-muted-foreground truncate">1 съобщение = 1 операция</div>
                  </div>
                </div>
                <span className="shrink-0 rounded-md bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-gold tabular-nums">
                  {Math.max(0, freeQuota.opsCap - freeQuota.opsUsed)}/{freeQuota.opsCap}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                <div className="h-full rounded-full bg-gradient-to-r from-gold to-gold/70 transition-all" style={{ width: `${Math.min(100, (freeQuota.opsUsed / Math.max(1, freeQuota.opsCap)) * 100)}%` }} />
              </div>
              <Link
                to="/account?tab=subscription"
                className="group mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-gold to-gold/80 px-3 py-1.5 text-[11px] font-bold text-navy shadow-[0_4px_14px_-4px_hsl(var(--gold)/0.5)] transition-all hover:shadow-[0_8px_20px_-6px_hsl(var(--gold)/0.7)] hover:brightness-105 active:scale-[0.98]"
              >
                <Crown className="h-3 w-3" /> До 100 / мес.
              </Link>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile-only panel — visible only when panel switch is active on <md. */}
      <aside className={cn(
        "flex-1 flex-col rounded-xl border border-border/50 bg-card/30 p-3 backdrop-blur-sm md:hidden",
        mobilePane === "panel" ? "flex" : "hidden",
      )}>
        <button
          type="button"
          onClick={handleNewThread}
          className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-gold to-gold/80 px-3 py-2.5 text-sm font-bold text-navy shadow-[0_6px_18px_-6px_hsl(var(--gold)/0.5)] active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          <span>Нов разговор</span>
        </button>

        {/* Quick actions row */}
        <div className="mb-3 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => { setNegotiationMode((v) => !v); setMobilePane("chat"); }}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors",
              negotiationMode
                ? "bg-gold/90 text-navy"
                : "border border-gold/40 bg-gold/[0.06] text-gold hover:bg-gold/15",
            )}
          >
            <Handshake className="h-3.5 w-3.5" />
            <span>Преговори</span>
          </button>
          <button
            type="button"
            onClick={() => setShowSources((v) => !v)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors",
              showSources ? "bg-gold/15 text-gold" : "border border-border/50 text-muted-foreground hover:text-foreground",
            )}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Източници</span>
          </button>
          {messages.length > 0 && (
            <>
              <button
                type="button"
                onClick={shareConversation}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/50 px-2 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Сподели</span>
              </button>
              <button
                type="button"
                onClick={exportConversation}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/50 px-2 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Изтегли</span>
              </button>
            </>
          )}
        </div>

        <div className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
          {threads.length > 0 ? "Разговори" : "История"}
        </div>
        <ScrollArea className="flex-1 -mx-1 px-1">
          <div className="space-y-0.5">
            {threads.length === 0 && (
              <p className="px-2 py-6 text-center text-[11px] text-muted-foreground/70">
                Все още няма разговори
              </p>
            )}
            {threads.map((t) => (
              <div
                key={t.id}
                onClick={() => { setPersistedActiveThreadId(t.id); setMobilePane("chat"); }}
                className={cn(
                  "group relative flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2.5 text-sm transition-all",
                  activeThreadId === t.id
                    ? "bg-gold/10 text-foreground"
                    : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                )}
              >
                {activeThreadId === t.id && (
                  <span className="absolute -left-1 top-1.5 bottom-1.5 w-0.5 rounded-r bg-gold shadow-[0_0_8px_hsl(var(--gold)/0.7)]" />
                )}
                <MessageSquare className={cn("h-3.5 w-3.5 shrink-0", activeThreadId === t.id ? "text-gold" : "text-muted-foreground/60")} />
                <span className="flex-1 truncate">{t.title}</span>
                {t.context_title && (
                  <span className="max-w-[45%] shrink-0 truncate rounded border border-gold/30 bg-gold/10 px-1 text-[9px] text-gold">
                    {t.context_title}
                  </span>
                )}
                <button
                  onClick={(e) => handleDeleteThread(t.id, e)}
                  className={cn(
                    "shrink-0 rounded-md p-1.5 transition-all",
                    confirmDeleteId === t.id
                      ? "bg-destructive text-destructive-foreground"
                      : "text-muted-foreground/70 hover:bg-destructive/15 hover:text-destructive",
                  )}
                  aria-label="Изтрий разговор"
                  type="button"
                >
                  {confirmDeleteId === t.id ? <span className="text-[10px] font-bold">?</span> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Sources list on mobile panel */}
        {allCitations.length > 0 && showSources && (
          <div className="mt-3 border-t border-border/40 pt-3">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">Източници</span>
              <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-gold">{allCitations.length}</span>
            </div>
            <ul className="space-y-1.5 text-xs">
              {allCitations.slice(0, 8).map((c) => (
                <li key={c.chunk_id} className="rounded-lg border border-border/40 bg-background/40 p-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="inline-flex items-center rounded bg-gold/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gold">
                      {c.jurisdiction || "BG"}
                    </span>
                    {c.official_url && (
                      <a href={c.official_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-gold hover:underline">
                        Отвори ↗
                      </a>
                    )}
                  </div>
                  <div className="mt-1 font-medium text-foreground">{c.short_code || c.title}</div>
                  <div className="text-[10px] text-muted-foreground/80">{c.citation_label}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Quota card */}
        {!isPro && !isTeam && (
          <div className="mt-3 rounded-xl border border-gold/40 bg-gradient-to-br from-gold/15 to-gold/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-bold text-foreground">Безплатни операции</div>
              <span className="rounded-md bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-gold tabular-nums">
                {Math.max(0, freeQuota.opsCap - freeQuota.opsUsed)}/{freeQuota.opsCap}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
              <div className="h-full rounded-full bg-gradient-to-r from-gold to-gold/70" style={{ width: `${Math.min(100, (freeQuota.opsUsed / Math.max(1, freeQuota.opsCap)) * 100)}%` }} />
            </div>
            <Link
              to="/account?tab=subscription"
              className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-gold to-gold/80 px-3 py-1.5 text-[11px] font-bold text-navy shadow-[0_4px_14px_-4px_hsl(var(--gold)/0.5)]"
            >
              <Crown className="h-3 w-3" /> До 100 / мес.
            </Link>
          </div>
        )}
      </aside>

      {/* Chat panel */}
      <div className={cn(
        "flex flex-1 flex-col bg-card/30 backdrop-blur-sm min-w-0",
        embedded ? "rounded-xl border border-border/50 min-h-0" : compact ? "min-h-0" : "rounded-xl border border-border/50",
        // Hide on mobile when the panel switch is active.
        mobilePane === "panel" ? "hidden md:flex" : "flex",
      )}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-gold/20 to-gold/5 ring-1 ring-gold/20">
              <img src={dogovaiIcon} alt="" width={20} height={20} loading="lazy" decoding="async" className="h-5 w-5 rounded-full" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-card" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold leading-tight text-foreground">DogovaryAI</h3>
              <p className="truncate text-[10px] leading-tight text-muted-foreground">
                {isPro || isTeam
                  ? `${Math.max(0, freeQuota.opsCap - freeQuota.opsUsed)}/${freeQuota.opsCap} операции · този месец`
                  : `${Math.max(0, freeQuota.opsCap - freeQuota.opsUsed)}/${freeQuota.opsCap} безплатни операции`}
              </p>
            </div>
            <Link
              to="/feedback?source=assistant"
              className="ml-1 hidden lg:inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold"
              title="Изпрати обратна връзка"
            >
              <AlertCircle className="h-3 w-3" />
              <span>Обратна връзка</span>
            </Link>
          </div>
          <div className="flex items-center gap-0.5">
            {messages.length > 0 && (
              <>
                <button type="button" onClick={shareConversation} className="rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-gold" title="Сподели" aria-label="Сподели">
                  <Share2 className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={exportConversation} className="rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-gold" title="Изтегли (.md)" aria-label="Изтегли">
                  <Download className="h-3.5 w-3.5" />
                </button>
                {activeThreadId && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteThread(activeThreadId, e as any)}
                    className={cn(
                      "rounded-md p-1.5 transition-colors",
                      confirmDeleteId === activeThreadId
                        ? "bg-destructive text-destructive-foreground"
                        : "text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive",
                    )}
                    title={confirmDeleteId === activeThreadId ? "Натисни пак за потвърждение" : "Изтрий разговор"}
                    aria-label="Изтрий разговор"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
            {allCitations.length > 0 && (
              <button type="button" onClick={() => setShowSources((v) => !v)} className={cn("hidden lg:inline-flex rounded-md p-1.5 transition-colors", showSources ? "bg-gold/15 text-gold" : "text-muted-foreground/70 hover:bg-muted hover:text-gold")} title="Източници" aria-label="Източници">
                <BookOpen className="h-3.5 w-3.5" />
              </button>
            )}
            <Button onClick={handleNewThread} variant="ghost" size="sm" className="md:hidden h-7 w-7 p-0">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-5"
          style={{ WebkitOverflowScrolling: "touch" as any, overscrollBehavior: "contain" }}
        >

          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gold/20 to-gold/5 ring-1 ring-gold/20">
                <img src={dogovaiIcon} alt="" width={36} height={36} loading="lazy" decoding="async" className="h-9 w-9 rounded-full" />
              </div>
              <h4 className="mb-1.5 text-base font-semibold text-foreground">С какво да помогна?</h4>
              <p className="mb-6 max-w-md text-center text-xs text-muted-foreground">
                Правни проучвания, анализ на договори, шаблони, преговори — попитай свободно.
              </p>
              <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => sendMessage(qa.text)}
                    className="group rounded-lg border border-border/50 bg-background/30 px-3 py-2.5 text-left text-xs text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-gold/40 hover:bg-gold/[0.03] hover:text-foreground hover:shadow-sm"
                  >
                    {qa.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((m, idx) => {
                const isLastAssistant =
                  m.role === "assistant" && idx === messages.length - 1 && !streaming;
                return (
                  <MessageBubble
                    key={m.id}
                    role={m.role}
                    content={m.content}
                    citations={m.citations}
                    toolEvents={m.toolEvents}
                    progress={m.progress}
                    followups={isLastAssistant ? m.followups : undefined}
                    onFollowupClick={(t) =>
                      sendMessage(
                        `${t}\n\n[ИЗБРАНО ДЕЙСТВИЕ: продължи с горната задача. Не сменяй темата, освен ако изрично те помоля.]`,
                      )
                    }
                  />
                );
              })}
              {streaming && (
                <MessageBubble
                  role="assistant"
                  content={streamingText.replace(/<followups>[\s\S]*?(?:<\/followups>|$)/i, "")}
                  isStreaming
                  toolEvents={streamingTools}
                  progress={streamingProgress}
                  onFollowupClick={(t) => sendMessage(t)}
                />
              )}
            </div>
          )}
        </div>

        {/* Изчерпани безплатни запитвания — CTA към абонамент вместо композер. */}
        {aiLocked && (
          <div className="shrink-0 border-t border-gold/40 bg-gradient-to-br from-gold/15 via-card to-card p-4 pb-[max(env(safe-area-inset-bottom),1rem)] text-center">
            <p className="text-sm font-semibold text-foreground">
              Изчерпахте {freeQuota.aiMessagesCap}-те безплатни запитвания
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              Активирайте план за неограничен достъп до DogovaryAI, история на разговорите,
              прикачени документи и правни цитати.
            </p>
            <div className="mt-3 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Link
                to="/plans"
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-b from-gold to-gold/80 px-4 py-2 text-sm font-bold text-navy shadow-gold transition-transform hover:scale-[1.03]"
              >
                <Crown className="h-4 w-4" /> Виж плановете
              </Link>
              <Link
                to="/account?tab=subscription"
                className="inline-flex items-center justify-center rounded-full border border-gold/40 px-4 py-2 text-sm font-semibold text-gold transition-colors hover:bg-gold/10"
              >
                Моят абонамент
              </Link>
            </div>
          </div>
        )}

        {/* Composer — sticky-bottom on mobile, sits above iOS safe area.
            Textarea uses 16px base font so iOS Safari doesn't auto-zoom on focus. */}
        <form
          onSubmit={handleSubmit}
          className={cn(
            "shrink-0 border-t border-border/40 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]",
            aiLocked && "hidden",
          )}
        >
          {documentContext && (
            <div
              data-testid="assistant-context-bar"
              className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-gold/40 bg-gold/[0.06] px-3 py-2 text-xs"
            >
              <span className="font-semibold text-gold">
                {kindLabel(documentContext.kind)}:
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {serverContext?.title || documentContext.displayTitle}
              </span>
              {serverContext?.truncated && (
                <span className="text-muted-foreground">
                  (виждам само част от текста)
                </span>
              )}
              {staleContext && (
                <button
                  type="button"
                  onClick={() => {
                    setStaleContext(false);
                    handleNewThread();
                  }}
                  className="rounded-md border border-gold/50 px-2 py-0.5 font-semibold text-gold hover:bg-gold/10"
                >
                  Нов разговор с текущата версия
                </button>
              )}
              <button
                type="button"
                aria-label="Премахни избрания документ"
                onClick={() => clearAssistantDocumentContext()}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className={cn(
            "relative rounded-2xl border bg-background/60 transition-all focus-within:border-gold/50 focus-within:ring-2 focus-within:ring-gold/15",
            negotiationMode ? "border-gold/40 bg-gold/[0.03]" : "border-border/50",
          )}>
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={negotiationMode ? "Опиши условията за преговори..." : "Задайте правен въпрос"}
                rows={1}
                disabled={streaming}
                enterKeyHint="send"
                autoCorrect="on"
                autoCapitalize="sentences"
                className="min-h-[52px] max-h-[160px] resize-none border-0 bg-transparent px-3.5 py-3 pr-[88px] text-base sm:text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                style={{ fontSize: "16px" }}
              />

              {/* Inline attach + send — scoped to textarea only, no overlap with toggle bar */}
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-gold"
                  title="Прикачи PDF/DOCX"
                  aria-label="Прикачи"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || streaming}
                  className="h-8 w-8 shrink-0 rounded-lg bg-gold text-navy hover:bg-gold/90 disabled:opacity-40"
                >
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {/* Bottom toggle bar — Преговори · Източници. Kept minimal on mobile. */}
            <div className={cn(
              "flex flex-wrap items-center gap-1.5 px-2 py-1.5",
              (compact || embedded) ? "" : "border-t border-border/40",
            )}>
              <button
                type="button"
                onClick={() => setNegotiationMode((v) => !v)}
                className={cn(
                  "group relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all active:scale-[0.97]",
                  negotiationMode
                    ? "bg-gradient-to-b from-gold to-gold/80 text-navy shadow-[0_4px_14px_-4px_hsl(var(--gold)/0.55)]"
                    : "border border-gold/40 bg-gold/[0.06] text-gold hover:bg-gold/15",
                )}
                title="Дълбок преговорен анализ"
                aria-pressed={negotiationMode}
              >
                <Handshake className="h-3.5 w-3.5" />
                <span>Режим преговори</span>
                {negotiationMode && (
                  <span className="ml-0.5 inline-flex h-1.5 w-1.5 rounded-full bg-navy/70" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowSources((v) => !v)}
                className={cn(
                  "hidden sm:inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  showSources ? "bg-gold/15 text-gold" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                title="Покажи източници"
              >
                <BookOpen className="h-3 w-3" />
                <span>Източници</span>
              </button>
              {!compact && !embedded && (
                <span className="ml-auto hidden sm:inline-flex items-center gap-1 rounded-md bg-muted/30 px-2 py-1 text-[10px] font-medium text-muted-foreground" title="Моделът се избира автоматично">
                  <Crown className="h-2.5 w-2.5 text-gold" />
                  AI избира
                </span>
              )}
            </div>
          </div>
          {!compact && !embedded && (
            <p className="mt-1.5 flex items-center justify-center gap-1 text-[10px] text-muted-foreground/60">
              <AlertCircle className="h-2.5 w-2.5" />
              Enter за изпращане · Shift+Enter за нов ред · Общи насоки, не правен съвет.
            </p>
          )}
        </form>
      </div>

      {/* Right: Sources panel */}
      {(embedded || (showSources && allCitations.length > 0)) && (
        <aside className="hidden w-72 flex-col rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm lg:flex">
          <div className="flex items-center justify-between border-b border-border/40 px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-gold" />
              <span className="text-[12px] font-bold text-foreground">
                Източници
              </span>
              <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-gold">
                {allCitations.length || 68}
              </span>
            </div>
            {!embedded && (
              <button
                type="button"
                onClick={() => setShowSources(false)}
                className="rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Скрий"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="border-b border-border/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
            От разговора
          </div>
          <ScrollArea className="flex-1">
            {allCitations.length === 0 ? (
              <div className="p-5 text-center">
                <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/20" />
                <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                  Когато AI цитира закони или съдебна практика, източниците ще се появят тук с линкове.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-1">
                  {["ЗЗД", "ТЗ", "КТ", "СК", "ЗУТ", "ВКС", "ЕС"].map((tag) => (
                    <span key={tag} className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="space-y-1.5 p-2 text-xs">
                {allCitations.map((c) => (
                  <li key={c.chunk_id} className="rounded-lg border border-border/40 bg-background/40 p-2.5 transition-colors hover:border-gold/40">
                    <div className="flex items-start justify-between gap-1">
                      <span className="inline-flex items-center rounded bg-gold/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gold">
                        {c.jurisdiction || "BG"}
                      </span>
                      {c.official_url && (
                        <a
                          href={c.official_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-gold hover:underline"
                        >
                          Източник ↗
                        </a>
                      )}
                    </div>
                    <div className="mt-1 font-medium text-foreground">{c.short_code || c.title}</div>
                    {(c.article_no || c.paragraph_no) && (
                      <div className="text-[10px] text-muted-foreground">
                        {c.article_no && <>чл. {c.article_no}</>}
                        {c.paragraph_no && <>, ал. {c.paragraph_no}</>}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground/80">{c.citation_label}</div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </aside>
      )}
      </div>
    </div>
  );
}

function ReasoningTrace({ steps }: { steps: ProgressStep[] }) {
  if (!steps || steps.length === 0) return null;
  return (
    <ul className="mb-3 space-y-1.5 text-sm">
      {steps.map((s) => (
        <li key={s.step} className="flex items-start gap-2">
          {s.status === "done" ? (
            <span className="mt-0.5 text-muted-foreground" aria-hidden>✓</span>
          ) : (
            <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-gold" aria-hidden />
          )}
          <span className={s.status === "done" ? "text-muted-foreground" : "text-gold font-medium"}>
            {s.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MessageBubble({ role, content, isStreaming, citations, toolEvents, followups, progress, onFollowupClick }: { role: "user" | "assistant"; content: string; isStreaming?: boolean; citations?: LegalCitation[]; toolEvents?: ToolEvent[]; followups?: string[]; progress?: ProgressStep[]; onFollowupClick?: (text: string) => void }) {
  const handleToolMessage = onFollowupClick;
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-gold px-3.5 py-2 text-sm leading-relaxed text-navy shadow-sm">
          {content}
        </div>
      </div>
    );
  }
  const hasText = content && content.trim().length > 0;
  const hasActiveProgress = (progress ?? []).some((p) => p.status === "active");
  const showProgress = !!progress && progress.length > 0 && (isStreaming ? (!hasText || hasActiveProgress) : true);
  const renderedContent = hasText ? highlightCitations(content) : "";
  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-gold/20 to-gold/5 ring-1 ring-gold/20">
        <img src={dogovaiIcon} alt="" width={16} height={16} loading="lazy" decoding="async" className="h-4 w-4 rounded-full" />
      </div>
      <div className="max-w-[85%] flex-1 text-sm text-foreground">
        {showProgress && <ReasoningTrace steps={progress!} />}
        {isStreaming && !showProgress && (
          <AssistantThinkingStatus toolEvents={toolEvents} compact />
        )}
        <div className="prose prose-sm prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:mt-3 prose-headings:mb-1 prose-a:text-gold prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-code:text-gold prose-code:bg-transparent prose-code:font-normal prose-code:px-0 prose-code:py-0 prose-code:before:content-none prose-code:after:content-none">
          {hasText && (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children, ...props }) => {
                  if (href?.startsWith("/")) {
                    return <Link to={href} className="text-gold hover:underline" {...(props as any)}>{children}</Link>;
                  }
                  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline" {...props}>{children}</a>;
                },
              }}
            >
              {renderedContent}
            </ReactMarkdown>
          )}
          {toolEvents && toolEvents.length > 0 && (
            <div className="not-prose space-y-1">
              {toolEvents.map((ev) => (
                <AssistantToolCard key={ev.id} event={ev} onSendMessage={handleToolMessage} />
              ))}
            </div>
          )}
          {citations && citations.length > 0 && <LegalCitations citations={citations} />}
          {followups && followups.length > 0 && (
            <div className="not-prose mt-3 flex flex-wrap gap-2">
              {followups.map((f, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onFollowupClick?.(f)}
                  className="rounded-full border border-gold/40 bg-gold/5 px-3 py-1.5 text-xs text-foreground transition-colors hover:border-gold hover:bg-gold/15"
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

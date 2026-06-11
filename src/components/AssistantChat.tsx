import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Loader2, Plus, Bird, AlertCircle, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsPro } from "@/hooks/useIsPro";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Crown } from "lucide-react";

import { LegalCitations, type LegalCitation } from "@/components/LegalCitations";
import { AssistantToolCard, type ToolEvent } from "@/components/assistant/AssistantToolCard";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: LegalCitation[];
  toolEvents?: ToolEvent[];
  followups?: string[];
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
}

const QUICK_ACTIONS = [
  { label: "Намери шаблон", text: "Помогни ми да намеря подходящ шаблон за договор за наем на офис." },
  { label: "Обясни клауза", text: "Какво означава клауза за неустойка и кога е валидна по ЗЗД?" },
  { label: "Електронен подпис", text: "Как мога да подпиша документ електронно през платформата?" },
  { label: "Проблем с плащане", text: "Имам въпрос относно моя абонамент и плащането." },
];

const ACTIVE_THREAD_STORAGE_PREFIX = "dogovaryai_active_thread:";

function getActiveThreadStorageKey(userId: string) {
  return `${ACTIVE_THREAD_STORAGE_PREFIX}${userId}`;
}

export function AssistantChat({ compact = false }: { compact?: boolean } = {}) {
  const { user, session } = useAuth();
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  }, [activeThreadStorageKey]);

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
    const { data } = await supabase
      .from("assistant_threads")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(20);
    const nextThreads = data ?? [];
    setThreads(nextThreads);

    if (nextThreads.length === 0) {
      setPersistedActiveThreadId(null);
      return;
    }

    const preferredThreadId = activeThreadId ?? (activeThreadStorageKey && typeof window !== "undefined"
      ? localStorage.getItem(activeThreadStorageKey)
      : null);

    if (preferredThreadId && nextThreads.some((thread) => thread.id === preferredThreadId)) {
      if (preferredThreadId !== activeThreadId) {
        setActiveThreadId(preferredThreadId);
      }
      return;
    }

    setPersistedActiveThreadId(nextThreads[0].id);
  }, [user, activeThreadId, activeThreadStorageKey, setPersistedActiveThreadId]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Load messages for active thread
  useEffect(() => {
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

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText]);

  // Auto-focus textarea
  useEffect(() => {
    if (!streaming) textareaRef.current?.focus();
  }, [streaming, activeThreadId]);

  const handleNewThread = () => {
    setPersistedActiveThreadId(null);
    setMessages([]);
    setStreamingText("");
    textareaRef.current?.focus();
  };

  const handleDeleteThread = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Изтрий този разговор?")) return;
    await supabase.from("assistant_threads").delete().eq("id", id);
    if (activeThreadId === id) {
      setPersistedActiveThreadId(null);
      setMessages([]);
    }
    loadThreads();
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming || !session?.access_token) return;

    // Gate: meter against monthly AI quota (5/mo Free, unlimited PRO/Team).
    const { data: gate, error: gateErr } = await supabase.rpc("consume_ai_message");
    if (gateErr) {
      toast.error("Грешка при проверка на квотата");
      return;
    }
    const g = gate as { ok: boolean; reason?: string; used?: number; cap?: number } | null;
    if (g && g.ok === false) {
      toast.error("Изчерпани са безплатните 5 съобщения за този месец. Активирай PRO за неограничен достъп.");
      await refreshPlan();
      return;
    }
    await refreshPlan();


    const userMsg: Msg = { id: `tmp-u-${Date.now()}`, role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);
    setStreamingText("");
    setStreamingTools([]);

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assistant-chat`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          threadId: activeThreadId,
          currentPath: location.pathname,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Грешка" }));
        toast.error(err.error || "Грешка при изпращане");
        setMessages(messages);
        setStreaming(false);
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

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
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
          } else if (eventType === "error") {
            toast.error(parsed.message || "AI грешка");
          } else if (eventType === "followups") {
            if (Array.isArray(parsed.followups)) receivedFollowups = parsed.followups;
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
      };
      setMessages([...newMessages, assistantMsg]);
      setStreamingText("");
      setStreamingTools([]);
      if (receivedThreadId && receivedThreadId !== activeThreadId) {
        setPersistedActiveThreadId(receivedThreadId);
      }
      loadThreads();
    } catch (err) {
      console.error(err);
      toast.error("Грешка при връзка с асистента");
      setMessages(messages);
    } finally {
      setStreaming(false);
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

  return (
    <div className={cn("flex gap-3 sm:gap-4", compact ? "h-full" : "h-[calc(100dvh-12rem)] min-h-[500px]")}>
      {/* Threads sidebar */}
      <aside className={cn("w-56 flex-col rounded-lg border border-border/60 bg-card/40 p-2", compact ? "hidden" : "hidden md:flex")}>
        <Button
          onClick={handleNewThread}
          variant="outline"
          size="sm"
          className="mb-2 justify-start gap-2 border-gold/40 text-gold hover:bg-gold/10"
        >
          <Plus className="h-4 w-4" /> Нов разговор
        </Button>
        <ScrollArea className="flex-1">
          <div className="space-y-1">
            {threads.length === 0 && (
              <p className="px-2 py-4 text-xs text-muted-foreground">Няма разговори</p>
            )}
            {threads.map((t) => (
              <div
                key={t.id}
                onClick={() => setPersistedActiveThreadId(t.id)}
                className={cn(
                  "group flex cursor-pointer items-center justify-between gap-1 rounded-md px-2 py-2 text-xs transition-colors",
                  activeThreadId === t.id ? "bg-gold/15 text-foreground" : "text-muted-foreground hover:bg-card/80",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <MessageSquare className="h-3 w-3 shrink-0" />
                  <span className="truncate">{t.title}</span>
                </span>
                <button
                  onClick={(e) => handleDeleteThread(t.id, e)}
                  className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  aria-label="Изтрий"
                  type="button"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Chat panel */}
      <div className={cn("flex flex-1 flex-col bg-card/40", compact ? "min-h-0" : "rounded-lg border border-border/60")}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/15">
              <Bird className="h-4 w-4 text-gold" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Правен AI Асистент</h3>
              <p className="text-[10px] text-muted-foreground">
                {isPro || isTeam
                  ? "24/7 поддръжка · неограничен достъп"
                  : `Безплатно: ${aiRemaining}/${freeQuota.aiMessagesCap} съобщения този месец`}
              </p>
            </div>
          </div>
          <Button onClick={handleNewThread} variant="ghost" size="sm" className="md:hidden">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold/10">
                <Bird className="h-6 w-6 text-gold" />
              </div>
              <h4 className="mb-1 text-sm font-semibold text-foreground">С какво да помогна?</h4>
              <p className="mb-6 max-w-md text-xs text-muted-foreground">
                Помагам с навигация, шаблони, правни въпроси (ЗЗД, ТЗ, КТ, СК, ЗУТ) и техническа поддръжка.
              </p>
              <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => sendMessage(qa.text)}
                    className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-gold/40 hover:text-foreground"
                  >
                    {qa.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
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
                    followups={isLastAssistant ? m.followups : undefined}
                    onFollowupClick={(t) => sendMessage(t)}
                  />
                );
              })}
              {streaming && (
                <MessageBubble
                  role="assistant"
                  content={streamingText.replace(/<followups>[\s\S]*?(?:<\/followups>|$)/i, "")}
                  isStreaming={!streamingText && streamingTools.length === 0}
                  toolEvents={streamingTools}
                />
              )}
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="border-t border-border/60 bg-background/40 px-4 py-1.5">
          <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <AlertCircle className="h-3 w-3" />
            AI асистент — общи насоки, не правен съвет. За конкретен казус се консултирайте с адвокат.
          </p>
        </div>

        {/* Composer */}
        <form onSubmit={handleSubmit} className="border-t border-border/60 p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Напиши съобщение..."
              rows={1}
              disabled={streaming}
              className="min-h-[44px] resize-none border-border/60 bg-background/60 text-sm"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || streaming}
              className="h-11 w-11 shrink-0 bg-gold text-navy hover:bg-gold/90"
            >
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ role, content, isStreaming, citations, toolEvents, followups, onFollowupClick }: { role: "user" | "assistant"; content: string; isStreaming?: boolean; citations?: LegalCitation[]; toolEvents?: ToolEvent[]; followups?: string[]; onFollowupClick?: (text: string) => void }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gold/15 px-4 py-2.5 text-sm text-foreground">
          {content}
        </div>
      </div>
    );
  }
  const hasText = content && content.trim().length > 0;
  return (
    <div className="flex gap-2">
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15">
        <Bird className="h-3 w-3 text-gold" />
      </div>
      <div className="max-w-[85%] flex-1 text-sm text-foreground">
        {isStreaming && !hasText ? (
          <div className="flex items-center gap-1.5 py-2 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-xs">Мисля...</span>
          </div>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:mt-3 prose-headings:mb-1 prose-a:text-gold prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-code:text-gold prose-code:bg-card/60 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
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
                {content}
              </ReactMarkdown>
            )}
            {toolEvents && toolEvents.length > 0 && (
              <div className="not-prose space-y-1">
                {toolEvents.map((ev) => (
                  <AssistantToolCard key={ev.id} event={ev} />
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
        )}
      </div>
    </div>
  );

}

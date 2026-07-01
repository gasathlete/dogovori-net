import { useEffect, useRef, useState } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { X, Send, Loader2, Sparkles, FileText, Briefcase, ShieldCheck, Scale, ExternalLink, Maximize2, MessageSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { AssistantChat } from "@/components/AssistantChat";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
const dogovaiIcon = "/dogovai-favicon.png";

const SIZE_PREF_KEY = "dogovai_size_pref"; // "small" | "full"

/**
 * DogovAI — small, branded, scroll-attached chatbot bubble visible globally.
 * - Anonymous users: 3 free messages + register CTA. Hard cap.
 * - Authenticated users: full AssistantChat experience.
 * - Conversation persists for 30 min after last message; reset thereafter.
 */

const HIDDEN_PREFIXES = ["/assistant", "/console", "/signing", "/share", "/checkout"];
const ANON_LIMIT = 5;
const IDLE_RESET_MS = 30 * 60 * 1000; // 30 minutes
const ANON_STORAGE_KEY = "dogovai_anon_chat_v2";
const LAST_ACTIVITY_KEY = "dogovai_last_activity_v2";
const LEGACY_KEYS = ["dogovai_anon_chat", "dogovai_anon_chat_v1", "dogovai_last_activity"];

// One-time wipe of any prior conversations across all profiles/browsers.
if (typeof window !== "undefined") {
  try {
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

type Citation = {
  chunk_id: string;
  citation_label: string;
  short_code: string;
  title: string;
  article_no: string | null;
  paragraph_no: string | null;
  official_url: string | null;
  jurisdiction: "BG" | "EU";
  similarity: number;
};
type AnonMsg = { role: "user" | "assistant"; content: string; citations?: Citation[] };

type AnonStored = { messages: AnonMsg[]; followups: string[]; updatedAt: number };

function loadAnonStored(): AnonStored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ANON_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnonStored;
    if (!parsed?.updatedAt || Date.now() - parsed.updatedAt > IDLE_RESET_MS) {
      localStorage.removeItem(ANON_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveAnonStored(s: AnonStored) {
  try {
    localStorage.setItem(ANON_STORAGE_KEY, JSON.stringify(s));
    localStorage.setItem(LAST_ACTIVITY_KEY, String(s.updatedAt));
  } catch { /* ignore */ }
}

const STARTERS: { icon: typeof FileText; label: string; prompt: string }[] = [
  { icon: FileText, label: "Намери ми шаблон", prompt: "Какъв шаблон да избера за договор за услуга?" },
  { icon: Briefcase, label: "Трудов договор", prompt: "Какво трябва да съдържа един трудов договор по КТ?" },
  { icon: ShieldCheck, label: "Какво е неустойка", prompt: "Какво е неустойка и кога се прилага?" },
  { icon: Scale, label: "Как работи сайтът", prompt: "Как мога да изготвя договор в dogovori.net?" },
];

function AnonChat({ resetKey }: { resetKey: number }) {
  const initial = resetKey === 0 ? loadAnonStored() : null;
  const [messages, setMessages] = useState<AnonMsg[]>(initial?.messages ?? []);
  const [followups, setFollowups] = useState<string[]>(initial?.followups ?? []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Wipe state when parent forces a reset (idle >30 min).
  useEffect(() => {
    if (resetKey === 0) return;
    setMessages([]);
    setFollowups([]);
    setInput("");
    setBusy(false);
    try { localStorage.removeItem(ANON_STORAGE_KEY); } catch { /* ignore */ }
  }, [resetKey]);

  const userTurns = messages.filter((m) => m.role === "user").length;
  const remaining = Math.max(0, ANON_LIMIT - userTurns);
  const limitReached = remaining <= 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, followups]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendText = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy || limitReached) return;
    const next: AnonMsg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setFollowups([]);
    setInput("");
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("assistant-chat-anon", {
        body: { messages: next },
      });
      if (error) throw error;
      const reply = (data as { reply?: string })?.reply ?? "Извинете, опитайте отново.";
      const fups = ((data as { followups?: string[] })?.followups ?? []).slice(0, 3);
      const cits = ((data as { citations?: Citation[] })?.citations ?? []).slice(0, 3);
      const finalMsgs: AnonMsg[] = [...next, { role: "assistant", content: reply, citations: cits }];
      setMessages(finalMsgs);
      setFollowups(fups);
      saveAnonStored({ messages: finalMsgs, followups: fups, updatedAt: Date.now() });
    } catch {
      const finalMsgs: AnonMsg[] = [
        ...next,
        { role: "assistant", content: "Грешка при връзка. Опитайте отново или се регистрирайте за пълен достъп." },
      ];
      setMessages(finalMsgs);
      setFollowups([]);
      saveAnonStored({ messages: finalMsgs, followups: [], updatedAt: Date.now() });
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-3 py-1.5 text-[11px]">
        <span className="text-muted-foreground">
          Безплатен тест · оставащи:{" "}
          <span className="font-semibold text-foreground">{remaining}</span>/{ANON_LIMIT}
        </span>
        <Link to="/auth" className="font-medium text-gold hover:underline">
          Регистрация
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <>
            <div className="rounded-xl border border-gold/30 bg-gradient-to-br from-gold/10 via-card to-card p-3 text-sm">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-gold">
                <Sparkles className="h-3.5 w-3.5" /> Здравейте, аз съм DogovaryAI
              </div>
              <p className="text-muted-foreground text-[13px] leading-relaxed">
                Имате <b className="text-foreground">{ANON_LIMIT} безплатни съобщения</b>.
                Изберете тема или питайте директно:
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => sendText(s.prompt)}
                  className="group flex items-start gap-2 rounded-xl border border-border/60 bg-card p-2.5 text-left text-[12px] leading-snug transition-all hover:border-gold/60 hover:bg-gold/5"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gold/15 text-gold">
                    <s.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="font-medium text-foreground">{s.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("space-y-1.5", m.role === "user" ? "ml-auto max-w-[88%]" : "mr-auto max-w-[92%]")}>
            <div
              className={cn(
                "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                m.role === "user"
                  ? "bg-gold/15 text-foreground whitespace-pre-wrap"
                  : "bg-muted/40 text-foreground prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-a:text-gold prose-a:underline prose-strong:text-foreground",
              )}
            >
              {m.role === "assistant" ? (
                <ReactMarkdown
                  components={{
                    a: ({ href, children }) => (
                      <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              ) : (
                m.content
              )}
            </div>
            {m.role === "assistant" && m.citations && m.citations.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground self-center">Източници:</span>
                {m.citations.map((c) => (
                  <a
                    key={c.chunk_id}
                    href={c.official_url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/5 px-2 py-0.5 text-[10px] text-foreground hover:bg-gold/15 hover:border-gold/70"
                    title={c.title}
                  >
                    {c.citation_label}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="mr-auto flex items-center gap-2 rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Пиша…
          </div>
        )}

        {/* Contextual follow-ups (after AI reply, based on conversation logic) */}
        {!busy && followups.length > 0 && !limitReached && (
          <div className="pt-1">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Продължете с:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {followups.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => sendText(q)}
                  className="rounded-full border border-gold/40 bg-gold/5 px-3 py-1 text-[12px] text-foreground transition-colors hover:bg-gold/15 hover:border-gold/70"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {limitReached ? (
        <div className="border-t border-gold/40 bg-gradient-to-br from-gold/15 via-card to-card p-4 text-center">
          <p className="mb-2 text-sm font-medium">
            Изчерпахте {ANON_LIMIT}-те безплатни съобщения.
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            Регистрирайте се и получете още 15 безплатни съобщения, шаблони и анализи.
          </p>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-gold px-4 py-2 text-sm font-semibold text-navy shadow-gold hover:scale-105 transition-transform"
          >
            <Sparkles className="h-4 w-4" /> Регистрация (безплатно)
          </Link>
        </div>
      ) : (
        <div className="border-t border-border/40 bg-card p-2">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendText(input);
                }
              }}
              rows={1}
              placeholder="Питайте DogovaryAI…"
              className="min-h-[36px] max-h-32 flex-1 resize-none rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-gold/60"
            />
            <button
              type="button"
              onClick={() => sendText(input)}
              disabled={busy || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-gold text-navy disabled:opacity-40"
              aria-label="Изпрати"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DogovAIBubble() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const goFullExperience = () => {
    setOpen(false);
    setChooserOpen(false);
    navigate(user ? "/console/assistant" : "/assistant");
  };

  const openSmall = () => {
    setChooserOpen(false);
    setOpen(true);
  };

  const handleBubbleClick = () => {
    if (open) { setOpen(false); return; }
    setChooserOpen(true);
  };

  // Reset only the anonymous trial chat after idle timeout.
  useEffect(() => {
    if (!open || user) return;
    let last = 0;
    try {
      const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
      last = raw ? Number(raw) : 0;
    } catch { /* ignore */ }
    if (!last || Date.now() - last > IDLE_RESET_MS) {
      try {
        localStorage.removeItem(ANON_STORAGE_KEY);
        localStorage.removeItem(LAST_ACTIVITY_KEY);
      } catch { /* ignore */ }
      setResetKey((k) => k + 1);
    }
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("dogovai:open", onOpen);
    return () => window.removeEventListener("dogovai:open", onOpen);
  }, []);

  if (loading) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <>
      {/* Bubble — translucent at rest, opaque on hover */}
      <button
        type="button"
        onClick={handleBubbleClick}
        aria-label={open ? "Затвори DogovaryAI" : "Отвори DogovaryAI чат"}
        title="DogovaryAI"
        className={cn(
          "fixed bottom-4 right-4 z-40 sm:bottom-5 sm:right-5",
          "group flex items-center gap-2 rounded-full",
          "h-11 pl-1.5 pr-3 sm:h-12 sm:pl-2 sm:pr-3.5",
          "bg-card/55 backdrop-blur-md text-foreground ring-1 ring-gold/30",
          "shadow-lg shadow-navy/10",
          "opacity-70 hover:opacity-100 hover:bg-card/90 hover:ring-gold/60 hover:shadow-gold",
          "transition-all hover:scale-[1.04] active:scale-95",
          open && "opacity-0 pointer-events-none translate-y-2",
        )}
      >
        <img
          src={dogovaiIcon}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          className="h-8 w-8 rounded-full sm:h-9 sm:w-9"
        />
        <span className="font-serif text-[13px] font-bold tracking-wide text-foreground sm:text-sm">
          DogovaryAI
        </span>
      </button>

      {/* Size chooser */}
      {chooserOpen && !open && (
        <div
          role="dialog"
          aria-label="Избери размер на DogovaryAI"
          className="fixed bottom-20 right-4 z-40 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-gold/30 bg-card p-3 shadow-2xl sm:bottom-24 sm:right-5"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold text-foreground">Как да отворя DogovaryAI?</div>
            <button
              type="button"
              onClick={() => setChooserOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Затвори"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Изберете режим. По-късно можете да преминете между двата.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={openSmall}
              className="flex flex-col items-start gap-1 rounded-lg border border-border/60 bg-background/60 p-3 text-left transition-colors hover:border-gold/60 hover:bg-gold/5"
            >
              <MessageSquare className="h-4 w-4 text-gold" />
              <span className="text-xs font-semibold">Малък чат</span>
              <span className="text-[10px] text-muted-foreground">Балонче в ъгъла</span>
            </button>
            <button
              type="button"
              onClick={goFullExperience}
              className="flex flex-col items-start gap-1 rounded-lg border border-gold/40 bg-gold/10 p-3 text-left transition-colors hover:border-gold hover:bg-gold/20"
            >
              <Maximize2 className="h-4 w-4 text-gold" />
              <span className="text-xs font-semibold">Цял екран</span>
              <span className="text-[10px] text-muted-foreground">Workspace</span>
            </button>
          </div>
        </div>
      )}

      {/* Panel */}
      <div
        role="dialog"
        aria-label="DogovaryAI чат"
        className={cn(
          "fixed z-40 bottom-4 right-4 sm:bottom-5 sm:right-5",
          "w-[min(380px,calc(100vw-2rem))] h-[min(580px,calc(100dvh-6rem))]",
          "origin-bottom-right rounded-2xl border border-gold/30 bg-card shadow-2xl",
          "transition-all duration-200",
          open
            ? "scale-100 opacity-100 pointer-events-auto"
            : "pointer-events-none scale-95 opacity-0",
        )}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-border/60 bg-gradient-to-r from-gold/15 via-card to-card px-3 py-2.5">
            <div className="flex items-center gap-2">
              <img
                src={dogovaiIcon}
                alt="DogovaryAI"
                width={28}
                height={28}
                loading="lazy"
                className="h-7 w-7 rounded-full"
              />
              <div className="leading-tight">
                <div className="font-serif text-sm font-bold">DogovaryAI</div>
                <div className="text-[10px] text-muted-foreground">
                  {user ? "AI правен асистент" : "Безплатен тест · 3 съобщения"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goFullExperience}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-gold"
                aria-label="Отвори на цял екран"
                title="Цял екран (full experience)"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Затвори"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {open && (user ? <AssistantChat compact key={resetKey} /> : <AnonChat resetKey={resetKey} />)}
          </div>
        </div>
      </div>
    </>
  );
}

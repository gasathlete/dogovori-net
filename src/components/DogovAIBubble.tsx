import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { X, Send, Loader2, Sparkles } from "lucide-react";
import { AssistantChat } from "@/components/AssistantChat";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
const dogovaiIcon = "/dogovai-favicon.png";

/**
 * DogovAI — small, branded, scroll-attached chatbot bubble visible globally.
 * - Anonymous users: get 3 free messages, then a register CTA. Hard cap.
 * - Authenticated users: full AssistantChat experience.
 */

const HIDDEN_PREFIXES = ["/assistant", "/signing", "/share", "/checkout"];
const ANON_LIMIT = 3;
const ANON_STORAGE = "dogovai_anon_msgs";

type AnonMsg = { role: "user" | "assistant"; content: string };

function loadAnonHistory(): AnonMsg[] {
  try {
    const raw = localStorage.getItem(ANON_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-12) : [];
  } catch {
    return [];
  }
}
function saveAnonHistory(msgs: AnonMsg[]) {
  try {
    localStorage.setItem(ANON_STORAGE, JSON.stringify(msgs.slice(-12)));
  } catch {
    /* ignore */
  }
}

function AnonChat() {
  const [messages, setMessages] = useState<AnonMsg[]>(() => loadAnonHistory());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const userTurns = messages.filter((m) => m.role === "user").length;
  const remaining = Math.max(0, ANON_LIMIT - userTurns);
  const limitReached = remaining <= 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || limitReached) return;
    const next: AnonMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    saveAnonHistory(next);
    setInput("");
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("assistant-chat-anon", {
        body: { messages: next },
      });
      if (error) throw error;
      const reply = (data as { reply?: string })?.reply ?? "Извинете, опитайте отново.";
      const withReply: AnonMsg[] = [...next, { role: "assistant", content: reply }];
      setMessages(withReply);
      saveAnonHistory(withReply);
    } catch {
      const withErr: AnonMsg[] = [
        ...next,
        { role: "assistant", content: "Грешка при връзка. Опитайте отново или се регистрирайте за пълен достъп." },
      ];
      setMessages(withErr);
      saveAnonHistory(withErr);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-3 py-1.5 text-[11px]">
        <span className="text-muted-foreground">
          Безплатен тест · оставащи съобщения:{" "}
          <span className="font-semibold text-foreground">{remaining}</span>/{ANON_LIMIT}
        </span>
        <Link to="/auth" className="font-medium text-gold hover:underline">
          Регистрация
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="rounded-lg bg-muted/30 p-3 text-sm">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-gold">
              <Sparkles className="h-3.5 w-3.5" /> DogovAI
            </div>
            <p className="text-muted-foreground">
              Здравейте! Аз съм DogovAI. Имате <b className="text-foreground">{ANON_LIMIT} безплатни съобщения</b>.
              Питайте за шаблони, договори или правни понятия.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
              m.role === "user"
                ? "ml-auto bg-gold/15 text-foreground"
                : "mr-auto bg-muted/40 text-foreground",
            )}
          >
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="mr-auto flex items-center gap-2 rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Пиша…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {limitReached ? (
        <div className="border-t border-gold/40 bg-gradient-to-br from-gold/15 via-card to-card p-4 text-center">
          <p className="mb-2 text-sm font-medium">
            Изчерпахте 3-те безплатни съобщения.
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            Регистрирайте се за пълен достъп до DogovAI, шаблони и анализи.
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
                  send();
                }
              }}
              rows={1}
              placeholder="Питайте DogovAI…"
              className="min-h-[36px] max-h-32 flex-1 resize-none rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-gold/60"
            />
            <button
              type="button"
              onClick={send}
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
  const [open, setOpen] = useState(false);

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
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Затвори DogovAI" : "Отвори DogovAI чат"}
        title="DogovAI"
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
          DogovAI
        </span>
      </button>

      {/* Panel */}
      <div
        role="dialog"
        aria-label="DogovAI чат"
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
                alt="DogovAI"
                width={28}
                height={28}
                loading="lazy"
                className="h-7 w-7 rounded-full"
              />
              <div className="leading-tight">
                <div className="font-serif text-sm font-bold">DogovAI</div>
                <div className="text-[10px] text-muted-foreground">
                  {user ? "AI правен асистент" : "Безплатен тест · 3 съобщения"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Затвори"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {open && (user ? <AssistantChat compact /> : <AnonChat />)}
          </div>
        </div>
      </div>
    </>
  );
}

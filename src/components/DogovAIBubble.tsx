import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { X, Send, Loader2, Sparkles, FileText, Scale, ExternalLink, Maximize2, MessageSquare } from "@/icons";
// react-markdown (~40KB gz) is only needed after the first assistant message renders.
const ReactMarkdown = lazy(() => import("react-markdown"));
// AssistantChat pulls in the full authenticated chat surface — load only when
// an authenticated user actually opens the bubble.
const AssistantChat = lazy(() =>
  import("@/components/AssistantChat").then((m) => ({ default: m.AssistantChat })),
);
import { AssistantThinkingStatus } from "@/components/assistant/AssistantThinkingStatus";
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
// Persist anonymous trial across close/re-open. Server enforces 5/24h per IP,
// so the client counter should not silently reset when the user closes the
// bubble — it caused confusion ("тестовете се рестартират").
const ANON_PERSIST_MS = 24 * 60 * 60 * 1000; // 24h — matches server IP limit
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
type AnonClarificationQuestion = {
  id: string;
  label: string;
  options: string[];
};
type AnonClarification = {
  contextSummary: string;
  questions: AnonClarificationQuestion[];
};
type AnonMsg = { role: "user" | "assistant"; content: string; citations?: Citation[]; clarification?: AnonClarification };

type AnonStored = { messages: AnonMsg[]; followups: string[]; updatedAt: number };

function loadAnonStored(): AnonStored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ANON_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnonStored;
    if (!parsed?.updatedAt || Date.now() - parsed.updatedAt > ANON_PERSIST_MS) {
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
  {
    icon: Scale,
    label: "Как работи Dogovori.Net",
    prompt: "Как работи Dogovori.Net? Разкажи ми накратко какво мога да правя тук и с какво да започна.",
  },
];

type AnonProgressStep = { step: string; label: string; status: "active" | "done" };

const ANON_PROGRESS_TEMPLATE: Array<{ step: string; label: string }> = [
  { step: "analyze", label: "Анализ на въпроса" },
  { step: "sources", label: "Проверка на приложими източници" },
  { step: "rank", label: "Подреждане на най-важните правни въпроси" },
  { step: "generate", label: "Генериране на структуриран отговор" },
];

function isAnonLegalCasePrompt(text: string) {
  return /(съди|съдят|заплашв|призовк|производств|обвин|разследв|жалба\s+срещу|подадена\s+жалба|нарушен|нападн|насил|развод|издръжк|запор|глоб|дискриминац|тормоз|мобинг|имам\s+ли\s+право|могат\s+ли\s+да|какво\s+да\s+правя|какви\s+са\s+ми\s+правата|какво\s+ми\s+грози|как\s+да\s+се\s+защит|заповед\s+за\s+защита|домашно\s+насилие)/i.test(text)
    && !/(изготв(и|ете)|направ(и|ете)|създа(й|йте)|попълн(и|ете)|шаблон|бланк)/i.test(text);
}

function buildAnonLegalClarification(text: string): AnonClarification {
  const lower = text.toLowerCase();
  if (/домашн|насил|заповед\s+за\s+защита|зздн|заплашв/.test(lower)) {
    return {
      contextSummary: "За да насоча правилно по ЗЗДН/НК, уточнете тези три неща:",
      questions: [
        { id: "official_action", label: "1. Има ли официално действие?", options: ["Само заплахи", "Подаден е сигнал", "Получих призовка", "Има заповед/молба"] },
        { id: "evidence", label: "2. Имате ли доказателства?", options: ["Съобщения", "Свидетели", "Медицински документ", "Нямам"] },
        { id: "urgency", label: "3. Има ли непосредствен риск?", options: ["Да", "Има риск, но не днес", "Не", "Не съм сигурен/сигурна"] },
      ],
    };
  }
  if (/уволн|работодател|работник|трудов|предизвест|дисциплинар|съкращ/.test(lower)) {
    return {
      contextSummary: "За да отговоря точно по трудов казус, уточнете:",
      questions: [
        { id: "document", label: "1. Връчен ли е документ?", options: ["Заповед/предизвестие", "Само устно", "Проект", "Не"] },
        { id: "ground", label: "2. Какво основание е посочено?", options: ["Съкращаване", "Дисциплинарно", "Взаимно съгласие", "Не е ясно"] },
        { id: "deadline", label: "3. Има ли срок за реакция?", options: ["До 7 дни", "До 1 месец", "Няма", "Не знам"] },
      ],
    };
  }
  return {
    contextSummary: "За да дам полезен правен отговор, уточнете:",
    questions: [
      { id: "stage", label: "1. На какъв етап е казусът?", options: ["Само спор", "Има документ", "Има жалба/иск", "Има орган/съд"] },
      { id: "goal", label: "2. Каква е целта Ви?", options: ["Да се защитя", "Да подам жалба", "Да отговоря писмено", "Да преценя риска"] },
      { id: "documents", label: "3. Имате ли доказателства?", options: ["Писмени", "Свидетели", "Само устно", "Не съм сигурен/сигурна"] },
    ],
  };
}

function AnonProgressTrace({ steps }: { steps: AnonProgressStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ul className="space-y-1 rounded-xl border border-gold/20 bg-gold/5 p-2 text-[11px]">
      {steps.map((s) => (
        <li key={s.step} className="flex items-start gap-1.5">
          {s.status === "done" ? <span className="text-muted-foreground">✓</span> : <Loader2 className="mt-0.5 h-3 w-3 animate-spin text-gold" />}
          <span className={s.status === "done" ? "text-muted-foreground" : "font-medium text-gold"}>{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

function AnonClarificationCard({ clarification, onSubmit }: { clarification: AnonClarification; onSubmit: (text: string) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const hasAnyAnswer = clarification.questions.some((q) => answers[q.id]);
  const submit = () => {
    if (!hasAnyAnswer) return;
    const lines = clarification.questions.map((q) => `- ${q.label.replace(/^\d+\.\s*/, "")}: ${answers[q.id] || "Неуточнено"}`);
    onSubmit(`Ето уточненията по казуса:\n${lines.join("\n")}\n\nПродължи с дълъг структуриран правен отговор с номерирани точки, **удебелени ключови термини**, практически стъпки и инлайн цитати в квадратни скоби след всяко правно твърдение.`);
  };
  return (
    <div className="not-prose mt-2 rounded-xl border border-gold/30 bg-gold/5 p-2.5">
      <p className="mb-2 text-xs text-muted-foreground">{clarification.contextSummary}</p>
      <div className="space-y-2">
        {clarification.questions.map((q) => {
          const currentValue = answers[q.id] ?? "";
          const isPickedOption = q.options.includes(currentValue);
          return (
            <div key={q.id}>
              <div className="mb-1 text-[11px] font-semibold text-foreground">{q.label}</div>
              <div className="flex flex-wrap gap-1">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                    className={cn(
                      "rounded-full border px-2 py-1 text-[10px] transition-colors",
                      currentValue === opt ? "border-gold bg-gold/15 text-foreground" : "border-border/60 bg-background/40 text-muted-foreground hover:border-gold/50",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={isPickedOption ? "" : currentValue}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="Или свой отговор…"
                className="mt-1.5 w-full rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/70 focus:border-gold focus:outline-none"
              />
            </div>
          );
        })}
      </div>
      <button
        type="button"
        disabled={!hasAnyAnswer}
        onClick={submit}
        className="mt-3 rounded-md bg-gold px-3 py-1.5 text-[11px] font-semibold text-navy disabled:opacity-40"
      >
        Изпрати и получи отговор
      </button>
    </div>
  );
}

function AnonChat({ resetKey }: { resetKey: number }) {
  const initial = resetKey === 0 ? loadAnonStored() : null;
  const [messages, setMessages] = useState<AnonMsg[]>(initial?.messages ?? []);
  const [followups, setFollowups] = useState<string[]>(initial?.followups ?? []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [progressSteps, setProgressSteps] = useState<AnonProgressStep[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);

  // Wipe state when parent forces a reset (idle >24h).
  useEffect(() => {
    if (resetKey === 0) return;
    setMessages([]);
    setFollowups([]);
    setInput("");
    setBusy(false);
    setTyping(false);
    setProgressSteps([]);
    if (typingTimerRef.current) window.clearInterval(typingTimerRef.current);
    try { localStorage.removeItem(ANON_STORAGE_KEY); } catch { /* ignore */ }
  }, [resetKey]);

  const userTurns = messages.filter((m) => m.role === "user").length;
  const remaining = Math.max(0, ANON_LIMIT - userTurns);
  const limitReached = remaining <= 0;

  // Smart auto-scroll — follow the writing when the user is already near
  // the bottom; leave them alone if they scrolled up to re-read something.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 100) {
      el.scrollTo({ top: el.scrollHeight, behavior: typing ? "auto" : "smooth" });
    }
  }, [messages, busy, followups, typing]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) window.clearInterval(typingTimerRef.current);
    };
  }, []);

  // Reveal the assistant reply as if it's being typed — Lovable-style so the
  // user follows the writing instead of getting a wall of text at once.
  const streamAssistantReply = (
    baseMsgs: AnonMsg[],
    fullReply: string,
    cits: Citation[],
    fups: string[],
  ) => {
    setTyping(true);
    // Insert placeholder assistant bubble that will grow.
    setMessages([...baseMsgs, { role: "assistant", content: "", citations: cits }]);
    // ~12ms per character = ~80 chars/s. Cap at 30ms per tick with adaptive chunk.
    const total = fullReply.length;
    const startAt = performance.now();
    const durationMs = Math.min(4500, Math.max(600, total * 12));
    if (typingTimerRef.current) window.clearInterval(typingTimerRef.current);
    typingTimerRef.current = window.setInterval(() => {
      const pct = Math.min(1, (performance.now() - startAt) / durationMs);
      const cut = Math.max(1, Math.floor(total * pct));
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant") {
          copy[copy.length - 1] = { ...last, content: fullReply.slice(0, cut) };
        }
        return copy;
      });
      if (pct >= 1) {
        if (typingTimerRef.current) window.clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
        const finalMsgs: AnonMsg[] = [
          ...baseMsgs,
          { role: "assistant", content: fullReply, citations: cits },
        ];
        setFollowups(fups);
        setTyping(false);
        saveAnonStored({ messages: finalMsgs, followups: fups, updatedAt: Date.now() });
      }
    }, 30);
  };

  const sendText = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy || typing || limitReached) return;
    const next: AnonMsg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setFollowups([]);
    setInput("");

    const alreadyAskedClarification = messages.some((m) => m.role === "assistant" && !!m.clarification)
      || /^Ето\s+уточненията\s+по\s+казуса/i.test(trimmed);
    if (isAnonLegalCasePrompt(trimmed) && !alreadyAskedClarification) {
      const clarification = buildAnonLegalClarification(trimmed);
      const assistant: AnonMsg = {
        role: "assistant",
        content: "Преди да дам правен отговор, трябва да уточним няколко факта. Те променят приложимия режим, сроковете и това дали говорим за превенция, защита или вече започнала процедура.",
        clarification,
      };
      const finalMsgs = [...next, assistant];
      setMessages(finalMsgs);
      saveAnonStored({ messages: finalMsgs, followups: [], updatedAt: Date.now() });
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    setBusy(true);
    setProgressSteps([]);
    ANON_PROGRESS_TEMPLATE.forEach((step, index) => {
      window.setTimeout(() => {
        setProgressSteps((prev) => {
          const without = prev.filter((p) => p.step !== step.step);
          return [...without, { ...step, status: "active" }];
        });
      }, index * 220);
      window.setTimeout(() => {
        setProgressSteps((prev) => prev.map((p) => p.step === step.step ? { ...p, status: "done" } : p));
      }, index * 220 + 180);
    });
    try {
      const { data, error } = await supabase.functions.invoke("assistant-chat-anon", {
        body: { messages: next },
      });
      if (error) throw error;
      const reply = (data as { reply?: string })?.reply ?? "Извинете, опитайте отново.";
      const fups = ((data as { followups?: string[] })?.followups ?? []).slice(0, 3);
      const cits = ((data as { citations?: Citation[] })?.citations ?? []).slice(0, 3);
      streamAssistantReply(next, reply, cits, fups);
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
      setProgressSteps([]);
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

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <>
            <div className="rounded-xl border border-gold/30 bg-gradient-to-br from-gold/10 via-card to-card p-3 text-sm">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-gold">
                <Sparkles className="h-3.5 w-3.5" /> Здравейте, аз съм DogovaryAI
              </div>
              <p className="text-muted-foreground text-[13px] leading-relaxed">
                Имате <b className="text-foreground">{ANON_LIMIT} безплатни съобщения</b>.
                Питайте директно или започнете с това:
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2">
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
                  <span className="font-medium text-gold group-hover:underline">{s.label}</span>
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
                <Suspense fallback={<span className="whitespace-pre-wrap">{m.content}</span>}>
                  <ReactMarkdown
                    components={{
                      a: ({ href, children }) => {
                        const isExternal = href?.startsWith("http");
                        const className = "text-gold underline-offset-4 hover:underline";
                        if (isExternal) {
                          return (
                            <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
                              {children}
                            </a>
                          );
                        }
                        return (
                          <Link to={href ?? "#"} className={className}>
                            {children}
                          </Link>
                        );
                      },
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                  {m.clarification && (
                    <AnonClarificationCard clarification={m.clarification} onSubmit={sendText} />
                  )}
                </Suspense>
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
          <div className="mr-auto max-w-[92%] space-y-2 rounded-2xl px-1 py-1 text-sm text-muted-foreground">
            <AnonProgressTrace steps={progressSteps} />
            <AssistantThinkingStatus compact />
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
                  className="rounded-full border border-gold/40 bg-gold/5 px-3 py-1 text-[12px] text-gold transition-colors hover:bg-gold/15 hover:border-gold/70 hover:underline"
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
            Регистрирайте се и получавайте <b className="text-foreground">5 + 2 безплатни съобщения всеки месец</b>, шаблони и анализи.
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

  // Anonymous trial persists for 24h (matches server-side per-IP rate limit).
  // Closing and re-opening the bubble no longer wipes remaining messages —
  // that behavior confused users into thinking the counter was buggy.
  useEffect(() => {
    if (!open || user) return;
    let last = 0;
    try {
      const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
      last = raw ? Number(raw) : 0;
    } catch { /* ignore */ }
    if (last && Date.now() - last > ANON_PERSIST_MS) {
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

  // Center at the bottom only inside the wizard fill-in flow on mobile.
  // Everywhere else (and on desktop) keep the original bottom-right position.
  const isWizardRoute = pathname.startsWith("/wizard");
  const bubblePosition = isWizardRoute
    ? "fixed bottom-20 left-1/2 -translate-x-1/2 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0"
    : "fixed bottom-6 right-6";
  const chooserPosition = isWizardRoute
    ? "fixed bottom-32 left-1/2 -translate-x-1/2 sm:bottom-20 sm:left-auto sm:right-6 sm:translate-x-0"
    : "fixed bottom-20 right-6";

  return (
    <>
      {/* Bubble — translucent at rest, opaque on hover */}
      <button
        type="button"
        onClick={handleBubbleClick}
        aria-label={open ? "Затвори DogovaryAI" : "Отвори DogovaryAI чат"}
        title="DogovaryAI"
        className={cn(
          bubblePosition,
          "z-40",
          "group flex items-center gap-2 rounded-full",
          "h-11 w-11 justify-center p-0 sm:h-12 sm:w-auto sm:justify-start sm:pl-2 sm:pr-3.5",
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
        <span className="hidden font-serif text-[13px] font-bold tracking-wide text-foreground sm:inline sm:text-sm">
          DogovaryAI
        </span>
      </button>

      {/* Size chooser */}
      {chooserOpen && !open && (
        <div
          role="dialog"
          aria-label="Избери размер на DogovaryAI"
          className={cn(
            chooserPosition,
            "z-40 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-gold/30 bg-card p-3 shadow-2xl",
          )}
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
              className="group flex flex-col items-start gap-1 rounded-lg border border-border/60 bg-background/60 p-3 text-left transition-colors hover:border-gold/60 hover:bg-gold/5"
            >
              <MessageSquare className="h-4 w-4 text-gold" />
              <span className="text-xs font-semibold text-gold group-hover:underline">Малък чат</span>
              <span className="text-[10px] text-muted-foreground">Балонче в ъгъла</span>
            </button>
            <button
              type="button"
              onClick={goFullExperience}
              className="group flex flex-col items-start gap-1 rounded-lg border border-gold/40 bg-gold/10 p-3 text-left transition-colors hover:border-gold hover:bg-gold/20"
            >
              <Maximize2 className="h-4 w-4 text-gold" />
              <span className="text-xs font-semibold text-gold group-hover:underline">Цял екран</span>
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
                  {user ? "AI правен асистент" : `Безплатен тест · ${ANON_LIMIT} съобщения`}
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
            {open && (
              user ? (
                <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gold" /></div>}>
                  <AssistantChat compact key={resetKey} />
                </Suspense>
              ) : (
                <AnonChat resetKey={resetKey} />
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}

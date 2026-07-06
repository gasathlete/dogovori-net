import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { markFunnelStep } from "@/lib/funnel";
import { Link } from "react-router-dom";
import { ShieldCheck, Bird, FileText, Search, FileSignature, Command, ArrowRight, FileUp, Wand2, Bot, ShieldAlert, Languages, Package, ChevronRight } from "lucide-react";
const logoImg = "/logo-dogovori-hero.webp";
import { scrollToHash } from "@/lib/scrollToHash";
import type { BusinessQuote } from "@/lib/businessQuotes";
import { useMagneticHover } from "@/hooks/useMagneticHover";
import { HeroBackdrop } from "@/components/HeroBackdrop";
import { ConversationalHeroInput } from "@/components/funnel/ConversationalHeroInput";
import { useAuth } from "@/hooks/useAuth";

const TeaserDialog = lazy(() => import("@/components/TeaserDialog").then((m) => ({ default: m.TeaserDialog })));

export function Hero({ onStart: _onStart }: { onStart: () => void }) {
  const { user } = useAuth();
  const tooltipId = useId();
  const [quote, setQuote] = useState<BusinessQuote | null>(null);
  const [visible, setVisible] = useState(false);
  const [teaserOpen, setTeaserOpen] = useState(false);
  const lastIdxRef = useRef<number | undefined>(undefined);
  const magneticRef = useMagneticHover<HTMLButtonElement>(6);

  useEffect(() => { markFunnelStep(1); }, []);

  const showQuote = async () => {
    const { pickRandomQuote } = await import("@/lib/businessQuotes");
    const { quote: q, index } = pickRandomQuote(lastIdxRef.current);
    lastIdxRef.current = index;
    setQuote(q);
    setVisible(true);
  };
  const hideQuote = () => setVisible(false);

  const openCommand = () => {
    window.dispatchEvent(new CustomEvent("dogovori:open-command"));
  };

  return (
    <section className="relative overflow-hidden border-b border-border/60 lg:flex lg:min-h-[min(calc(100svh-4rem),620px)] lg:items-center">
      <div className="absolute inset-0 bg-gradient-hero opacity-95" />
      <HeroBackdrop />

      {/* Corner filigree */}
      <svg aria-hidden="true" width="0" height="0" className="absolute" style={{ position: "absolute" }}>
        <defs>
          <symbol id="hero-corner" viewBox="0 0 60 60">
            <g fill="none" stroke="currentColor" strokeWidth="0.7">
              <path d="M0 22 L0 0 L22 0" />
              <path d="M0 32 L9 32" />
              <path d="M32 0 L32 9" />
            </g>
            <circle cx="14" cy="14" r="1.1" fill="currentColor" />
          </symbol>
        </defs>
      </svg>
      {[
        "top-5 left-5 rotate-0",
        "top-5 right-5 rotate-90",
        "bottom-5 right-5 rotate-180",
        "bottom-5 left-5 -rotate-90",
      ].map((cls) => (
        <svg
          key={cls}
          aria-hidden="true"
          className={`pointer-events-none absolute hidden h-10 w-10 text-gold/40 sm:block ${cls}`}
        >
          <use href="#hero-corner" />
        </svg>
      ))}

      <div className="absolute inset-x-0 top-0 hairline-x" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"
      >
        <div className="h-2 w-2 rotate-45 border border-gold/60 bg-background" />
      </div>

      <div className="container relative w-full pt-3 pb-8 sm:pt-4 sm:pb-10 md:pt-4 md:pb-10 lg:pt-4 lg:pb-8">
        <div className="relative mx-auto max-w-3xl text-center px-0 my-0">
          <div
            className="anim-rise mx-auto mb-1.5 hidden items-center justify-center sm:mb-2 sm:flex"
            style={{ animationDelay: "0ms" }}
          >
            <div
              className="relative flex h-12 w-12 items-center justify-center sm:h-14 sm:w-14 md:h-16 md:w-16"
              onMouseEnter={showQuote}
              onMouseLeave={hideQuote}
              aria-describedby={visible ? tooltipId : undefined}
            >
              <div className="absolute inset-[-10%] rounded-full border border-dashed border-gold/20" />
              <div className="absolute inset-0 rounded-full border border-gold/40 bg-card/60" />
              {[0, 90, 180, 270].map((deg) => (
                <span
                  key={deg}
                  aria-hidden="true"
                  className="absolute left-1/2 top-1/2 block h-1.5 w-px bg-gold/50"
                  style={{ transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-58%)` }}
                />
              ))}
              <img
                src={logoImg}
                alt="Dogovori.net лого"
                width={112}
                height={112}
                loading="eager"
                {...({ fetchpriority: "high" } as any)}
                decoding="async"
                className="relative h-[64%] w-[64%] object-contain"
              />
              {quote && (
                <div
                  id={tooltipId}
                  role="tooltip"
                  className={`pointer-events-none absolute right-full top-1/2 z-30 mr-4 hidden w-[240px] -translate-y-1/2 rounded-md border border-gold/30 bg-card/95 px-4 py-3 text-center shadow-elegant backdrop-blur-sm transition-all duration-300 ease-out sm:w-[300px] md:block ${
                    visible ? "translate-x-0 opacity-100" : "translate-x-1 opacity-0"
                  }`}
                >
                  <p className="font-serif text-[13px] italic leading-snug text-muted-foreground">
                    <span className="text-gold">«</span> {quote.text} <span className="text-gold">»</span>
                  </p>
                  <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold/80">
                    — {quote.author}
                  </p>
                </div>
              )}
            </div>
          </div>

          <h1
            className="anim-rise mx-auto max-w-3xl font-serif text-[26px] font-bold leading-[1.1] text-balance sm:text-3xl md:text-4xl lg:text-[42px] lg:leading-[1.05]"
            style={{ animationDelay: "0ms" }}
          >
            Договори, които{" "}
            <em className="not-italic font-serif italic text-gold">намират</em>{" "}
            Вашите интереси
          </h1>

          {/* Eyebrow chips */}
          <div
            className="anim-rise mt-2"
            style={{ animationDelay: "80ms" }}
          >
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-gold"><ShieldCheck className="h-3.5 w-3.5" /> ЗЗД · ТЗ · ЗУТ</span>
              <span className="h-3 w-px bg-gold/30" />
              <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-gold" /> &gt;600 ШАБЛОНА</span>
              <span className="h-3 w-px bg-gold/30" />
              <span className="inline-flex items-center gap-1.5"><Bird className="h-3.5 w-3.5 text-gold" /> АНАЛИЗ НА РИСКА</span>
              <span className="h-3 w-px bg-gold/30" />
              <span className="inline-flex items-center gap-1.5"><FileSignature className="h-3.5 w-3.5 text-gold" /> Е-ПОДПИС</span>
            </div>
          </div>


          {/* CTA — visible immediately */}
          <div
            className="anim-rise mt-3 flex flex-col items-center justify-center gap-2"
            style={{ animationDelay: "120ms" }}
          >
            {user ? (
              <div className="mx-auto w-full max-w-[460px] space-y-2.5">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
                  <Link
                    to="/catalog"
                    className="btn-gold btn-press w-full normal-case tracking-normal text-[14px] px-5 py-3"
                  >
                    <Search className="h-[16px] w-[16px]" />
                    Намери документ
                  </Link>
                  <Link
                    to="/build"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gold/50 bg-card/60 px-5 py-3 text-[14px] font-semibold text-gold transition-colors hover:bg-gold/10"
                  >
                    <Wand2 className="h-[16px] w-[16px]" />
                    Изготви документ
                  </Link>
                </div>
                <Link
                  to="/account?tab=documents&action=upload"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gold/50 bg-card/60 px-5 py-3 text-[14px] font-semibold text-gold transition-colors hover:bg-gold/10"
                >
                  <FileUp className="h-[16px] w-[16px]" />
                  Качи документ за анализ
                </Link>
              </div>
            ) : (
              <div className="flex w-full flex-col items-center gap-3">
                <ConversationalHeroInput />
                <div className="relative w-full sm:w-auto">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-2 rounded-xl bg-gradient-to-r from-gold/0 via-gold/30 to-gold/0 opacity-50 blur-xl"
                  />
                  <button
                    ref={magneticRef as any}
                    type="button"
                    onClick={() => {
                      try { (window as any).plausible?.("funnel_cta_click", { props: { step: 1, label: "Започни безплатно", trigger: "story" } }); } catch {}
                      import("@/components/funnel/StartStoryOverlay").then((m) => m.openStartStory());
                    }}
                    className="btn-gold btn-sheen btn-press relative w-full sm:w-auto normal-case tracking-normal text-[16px] sm:text-[17px] px-8 py-4 sm:px-10 sm:py-4 rounded-xl font-bold shadow-gold will-change-transform"
                    style={{ transition: "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 200ms, background 200ms" }}
                  >
                    Започни безплатно
                    <ArrowRight className="h-[16px] w-[16px] transition-transform duration-300 group-hover:translate-x-1" />
                  </button>
                </div>
              </div>
            )}

            {/* Micro-trust line directly under primary CTA — converts on hesitation */}
            {!user && (
              <p className="mt-1 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-emerald-500" />
                Без карта · 10 безплатни операции · GDPR
              </p>
            )}
          </div>

          <p
            className="anim-rise mx-auto mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-gold/80"
            style={{ animationDelay: "160ms" }}
          >
            ДОГОВАРЯЙ · СЪЗДАЙ · ПРЕЦИЗИРАЙ · ПОДПИШИ
          </p>

          <ul
            className="anim-rise mx-auto mt-3 grid max-w-3xl grid-cols-2 gap-2 md:grid-cols-3 md:mt-4"
            style={{ animationDelay: "200ms" }}
          >
            {([
              { icon: Bot, action: "assistant", label: "Правен AI-асистент", desc: "Преговаря най-добрите условия. Обучен модел." },
              { icon: FileText, to: "/catalog", label: "Над 600 шаблона", desc: "бизнес, имоти, трудови правоотношения, услуги." },
              { icon: ShieldAlert, to: "/demo/risk-analysis", label: "Анализирай Документ", desc: "за клопки, неравноправни клаузи и други полезни." },
              { icon: Languages, to: "/demo/bilingual", label: "Двуезични договори", desc: "BG / EN / DE / FR." },
              { icon: FileSignature, to: "/demo/e-signature", label: "Електронен подпис", desc: "чрез dogovori.net" },
              { icon: Package, action: "kits", label: "Комплекти", desc: "\u00a0Решения за чести казуси." },
            ] as Array<{ icon: any; to?: string; action?: "assistant" | "kits"; label: string; desc: string }>).map((item) => {
              const Icon = item.icon;
              const cls =
                "group flex h-full w-full items-start gap-2 rounded-lg border border-gold/15 bg-card/40 px-2.5 py-2 text-left backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-[0_8px_24px_-12px_hsl(var(--gold)/0.45)] sm:gap-2.5 sm:px-3.5 sm:py-2.5";
              const inner = (
                <>
                  <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <span className="min-w-0 flex-1 leading-snug">
                    <span className="block text-[13px] font-semibold text-foreground sm:text-sm">{item.label}</span>
                    <span className="hidden text-xs text-muted-foreground sm:block">{item.desc}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold/60 transition-transform group-hover:translate-x-0.5" />
                </>
              );
              if (item.action) {
                const onClick = () => {
                  if (item.action === "assistant") {
                    window.dispatchEvent(new CustomEvent("dogovori:open-assistant"));
                  } else if (item.action === "kits") {
                    scrollToHash("scenarios");
                    setTimeout(() => {
                      const sec = document.getElementById("scenarios");
                      if (!sec) return;
                      sec.classList.add("hero-kits-pulse");
                      setTimeout(() => sec.classList.remove("hero-kits-pulse"), 1600);
                    }, 350);
                  }
                };
                return (
                  <li key={item.label}>
                    <button type="button" onClick={onClick} aria-label={`${item.label} — ${item.desc}`} className={cls}>
                      {inner}
                    </button>
                  </li>
                );
              }
              return (
                <li key={item.label}>
                  <Link to={item.to!} aria-label={`${item.label} — ${item.desc}`} className={cls}>
                    {inner}
                  </Link>
                </li>
              );
            })}
          </ul>


          {/* ⌘K hint pill */}
          <button
            type="button"
            onClick={openCommand}
            className="anim-rise mt-3 hidden items-center gap-2 rounded-full border border-gold/25 bg-card/40 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold sm:inline-flex"
            style={{ animationDelay: "260ms" }}
            aria-label="Отвори бързо търсене"
          >
            <Command className="h-3 w-3" />
            Натисни
            <kbd className="rounded border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[10px]">ТУК</kbd>
            за бързо търсене
          </button>

          <p
            className="anim-rise mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
            style={{ animationDelay: "300ms" }}
          >
            Промокод <span className="font-semibold text-gold">FIRST100</span> → −30% за нови клиенти · без карта
          </p>

        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 hairline-x opacity-60" />
      {teaserOpen && (
        <Suspense fallback={null}>
          <TeaserDialog open={teaserOpen} onOpenChange={setTeaserOpen} />
        </Suspense>
      )}
    </section>
  );
}

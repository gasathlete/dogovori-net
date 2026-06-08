import { useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Bird, FileText, Search, FileSignature, Command, ArrowRight } from "lucide-react";
const logoImg = "/logo-dogovori-hero.webp";
import { scrollToHash } from "@/lib/scrollToHash";
import type { BusinessQuote } from "@/lib/businessQuotes";
import { useMagneticHover } from "@/hooks/useMagneticHover";
import { TeaserDialog } from "@/components/TeaserDialog";

export function Hero({ onStart: _onStart }: { onStart: () => void }) {
  const tooltipId = useId();
  const [quote, setQuote] = useState<BusinessQuote | null>(null);
  const [visible, setVisible] = useState(false);
  const lastIdxRef = useRef<number | undefined>(undefined);
  const magneticRef = useMagneticHover<HTMLAnchorElement>(6);

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
    <section className="relative overflow-hidden border-b border-border/60 lg:flex lg:min-h-[calc(100svh-4rem)] lg:items-center">
      <div className="absolute inset-0 bg-gradient-hero opacity-95" />

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
          className={`pointer-events-none absolute h-10 w-10 text-gold/40 ${cls}`}
        >
          <use href="#hero-corner" />
        </svg>
      ))}

      <div className="absolute inset-x-0 top-0 hairline-x" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"
      >
        <div className="h-2 w-2 rotate-45 border border-gold/60 bg-navy" />
      </div>

      <div className="container relative w-full pt-4 pb-10 sm:pt-6 sm:pb-12 md:pt-6 md:pb-12 lg:pt-6 lg:pb-10">
        <div className="relative mx-auto max-w-3xl text-center px-0 my-0">
          <div
            className="anim-rise mx-auto mb-3 flex items-center justify-center sm:mb-4 lg:mb-5"
            style={{ animationDelay: "0ms" }}
          >
            <div
              className="relative flex h-16 w-16 items-center justify-center sm:h-20 sm:w-20 md:h-24 md:w-24"
              onMouseEnter={showQuote}
              onMouseLeave={hideQuote}
              aria-describedby={visible ? tooltipId : undefined}
            >
              <div className="absolute inset-[-10%] rounded-full border border-dashed border-gold/20" />
              <div className="absolute inset-0 rounded-full border border-gold/40 bg-navy-light/40" />
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
                  className={`pointer-events-none absolute right-full top-1/2 z-30 mr-4 hidden w-[240px] -translate-y-1/2 rounded-md border border-gold/30 bg-navy/95 px-4 py-3 text-center shadow-elegant backdrop-blur-sm transition-all duration-300 ease-out sm:w-[300px] md:block ${
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
            className="anim-rise font-serif text-[28px] font-bold leading-[1.1] text-balance sm:text-4xl md:text-5xl lg:text-5xl xl:text-[52px] lg:leading-[1.1]"
            style={{ animationDelay: "0ms" }}
          >
            Договори, които{" "}
            <span className="text-gold whitespace-nowrap">търсят и намират</span>{" "}
            Вашите интереси
          </h1>

          <div
            className="anim-rise mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:text-[11px]"
            style={{ animationDelay: "80ms" }}
          >
            <span className="inline-flex items-center gap-1.5 text-gold"><ShieldCheck className="h-3.5 w-3.5" /> ЗЗД · ТЗ · ЗУТ</span>
            <span className="h-3 w-px bg-gold/30" />
            <span className="inline-flex items-center gap-1.5"><Bird className="h-3.5 w-3.5 text-gold" /> АНАЛИЗ НА РИСКА</span>
            <span className="h-3 w-px bg-gold/30" />
            <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-gold" /> &gt;600 ШАБЛОНА</span>
            <span className="h-3 w-px bg-gold/30" />
            <span className="inline-flex items-center gap-1.5"><FileSignature className="h-3.5 w-3.5 text-gold" /> Е-ПОДПИС</span>
          </div>

          <p
            className="anim-rise mx-auto mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base md:mt-4 md:text-base md:leading-[1.6]"
            style={{ animationDelay: "160ms" }}
          >
            Индивидуални документи, съобразени със ЗЗД, ТЗ и ЗУТ — с пълен правен риск-анализ.<br />
            Вътрешен AI-асистент от ново поколение.
          </p>

          {/* Single primary CTA + discreet secondary link */}
          <div
            className="anim-rise mt-6 flex flex-col items-center justify-center gap-3 sm:mt-7"
            style={{ animationDelay: "240ms" }}
          >
            <Link
              ref={magneticRef}
              to="/auth"
              className="btn-gold btn-press w-full sm:w-auto normal-case tracking-normal text-[15px] px-8 py-4 will-change-transform"
              style={{ transition: "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 200ms, background 200ms" }}
            >
              <Search className="h-[18px] w-[18px]" />
              Започни безплатно
              <ArrowRight className="h-[16px] w-[16px] opacity-70" />
            </Link>

            <button
              type="button"
              onClick={(e) => { e.preventDefault(); scrollToHash("process"); }}
              className="story-link text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-gold"
            >
              Виж демо ↓
            </button>
          </div>

          {/* ⌘K hint pill */}
          <button
            type="button"
            onClick={openCommand}
            className="anim-rise mt-5 inline-flex items-center gap-2 rounded-full border border-gold/25 bg-card/40 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold"
            style={{ animationDelay: "300ms" }}
            aria-label="Отвори бързо търсене"
          >
            <Command className="h-3 w-3" />
            Натисни
            <kbd className="rounded border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[10px]">ТУК</kbd>
            за бързо търсене
          </button>

          <p
            className="anim-rise mt-4 text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
            style={{ animationDelay: "340ms" }}
          >
            БЕЗ ДОБАВЯНЕ НА КАРТА · ПРЕДПРИЕМАЧ 12.90 €/МЕС. · ПРОМОКОД <span className="text-gold">FIRST100</span> → −30%
          </p>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 hairline-x opacity-60" />
    </section>
  );
}

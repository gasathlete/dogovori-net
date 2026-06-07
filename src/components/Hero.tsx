import { useId, useRef, useState } from "react";
import { ShieldCheck, Bird, FileText, ArrowRight, Search, FileSignature, ChevronDown } from "lucide-react";
const logoImg = "/logo-dogovori-hero.webp";
import { scrollToHash } from "@/lib/scrollToHash";
import type { BusinessQuote } from "@/lib/businessQuotes";

export function Hero({ onStart }: { onStart: () => void }) {
  const tooltipId = useId();
  const [quote, setQuote] = useState<BusinessQuote | null>(null);
  const [visible, setVisible] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const lastIdxRef = useRef<number | undefined>(undefined);

  const showQuote = async () => {
    // Lazy-load quotes module on first hover to keep it out of the Index entry bundle.
    const { pickRandomQuote } = await import("@/lib/businessQuotes");
    const { quote: q, index } = pickRandomQuote(lastIdxRef.current);
    lastIdxRef.current = index;
    setQuote(q);
    setVisible(true);
  };
  const hideQuote = () => setVisible(false);

  return (
    <section className="relative overflow-hidden border-b border-border/60 lg:flex lg:min-h-[calc(100svh-4rem)] lg:items-center">
      {/* Base navy gradient */}
      <div className="absolute inset-0 bg-gradient-hero opacity-95" />

      {/* Corner filigree — four delicate ornaments */}
      {[
        { pos: "top-5 left-5", rot: "rotate-0" },
        { pos: "top-5 right-5", rot: "rotate-90" },
        { pos: "bottom-5 right-5", rot: "rotate-180" },
        { pos: "bottom-5 left-5", rot: "-rotate-90" },
      ].map(({ pos, rot }) => (
        <svg
          key={pos}
          aria-hidden="true"
          viewBox="0 0 60 60"
          className={`pointer-events-none absolute h-10 w-10 text-gold/40 ${pos} ${rot}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.7"
        >
          <path d="M0 22 L0 0 L22 0" />
          <path d="M0 32 L9 32" />
          <path d="M32 0 L32 9" />
          <circle cx="14" cy="14" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      ))}

      {/* Top gold hairline + center diamond accent */}
      <div className="absolute inset-x-0 top-0 hairline-x" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"
      >
        <div className="h-2 w-2 rotate-45 border border-gold/60 bg-navy" />
      </div>

      <div className="container relative w-full pt-4 pb-10 sm:pt-6 sm:pb-12 md:pt-6 md:pb-12 lg:pt-6 lg:pb-10">
        <div className="relative mx-auto max-w-3xl text-center px-0 my-0">
          {/* Centered hero medallion — visible, doesn't overlap content */}
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
                  style={{
                    transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-58%)`,
                  }}
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

              {/* Hover tooltip — business quote, floats to the left of the medallion */}
              {quote && (
                <div
                  id={tooltipId}
                  role="tooltip"
                  className={`pointer-events-none absolute right-full top-1/2 z-30 mr-4 hidden w-[240px] -translate-y-1/2 rounded-md border border-gold/30 bg-navy/95 px-4 py-3 text-center shadow-elegant backdrop-blur-sm transition-all duration-300 ease-out sm:w-[300px] md:block ${
                    visible ? "translate-x-0 opacity-100" : "translate-x-1 opacity-0"
                  }`}
                >
                  <p className="font-serif text-[13px] italic leading-snug text-muted-foreground">
                    <span className="text-gold">«</span> {quote.text}{" "}
                    <span className="text-gold">»</span>
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
            <span className="inline-flex items-center gap-1.5"><Bird className="h-3.5 w-3.5 text-gold" /> АНАЛИЗ НА РИСКА</span>
            <span className="h-3 w-px bg-gold/30" />
            <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-gold" /> &gt;600 ШАБЛОНА</span>
            <span className="h-3 w-px bg-gold/30" />
            <span className="inline-flex items-center gap-1.5"><FileSignature className="h-3.5 w-3.5 text-gold" /> Електронен подпис</span>
          </div>
          <p
            className="anim-rise mx-auto mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base md:mt-4 md:text-base md:leading-[1.6]"

            style={{ animationDelay: "160ms" }}
          >
            Индивидуални договори, съобразени със ЗЗД, ТЗ и ЗУТ — с пълен правен риск-анализ.
          </p>
          <div
            className="anim-rise mx-auto mt-2 max-w-2xl text-center"
            style={{ animationDelay: "200ms" }}
          >
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold/80 transition-colors hover:text-gold"
            >
              {moreOpen ? "Скрий" : "Виж повече"}
              <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${moreOpen ? "rotate-180" : ""}`} />
            </button>
            <div
              className="grid transition-[grid-template-rows] duration-500 ease-out motion-reduce:transition-none"
              style={{ gridTemplateRows: moreOpen ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <p className={`pt-3 text-pretty text-sm leading-relaxed text-muted-foreground transition-opacity duration-300 ${moreOpen ? "opacity-100" : "opacity-0"}`}>
                  Освен шаблони и бланки, сайтът предлага разработка на собствен документ с правна подкрепа от Нашата Система. Стратегически въпроси, които напътстват Вашата сделка стъпка по стъпка.
                </p>
              </div>
            </div>
          </div>
          <div
            className="anim-rise mt-5 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5"
            style={{ animationDelay: "240ms" }}
          >
            <button
              onClick={onStart}
              className="btn-gold w-full sm:w-auto normal-case tracking-normal text-[15px] px-7 py-3.5"
            >
              <Search className="h-[18px] w-[18px]" /> Намери документ
            </button>
            <a
              href="/build"
              className="btn-gold-inverse w-full sm:w-auto normal-case tracking-normal text-[15px] px-7 py-3.5"
            >
              <ArrowRight className="h-[18px] w-[18px]" /> Изготви документ
            </a>
          </div>
          <p
            className="anim-rise mt-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground"

            style={{ animationDelay: "300ms" }}
          >
            5 безплатни операции · Pro 9.90 €/мес · Промокод <span className="text-gold">FIRST100</span> → −30%
          </p>
          <div className="anim-rise mt-2 text-center" style={{ animationDelay: "340ms" }}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                scrollToHash("process");
              }}
              className="pulse-arrow inline-flex flex-col items-center gap-1 text-xs uppercase tracking-[0.18em] text-amber-100/80 transition-colors hover:text-gold focus-visible:text-gold my-1 px-[10px] py-2"
            >
              <span>Как работи системата</span>
              <span aria-hidden="true" className="text-gold">↓</span>
            </button>
          </div>


        </div>
      </div>

      {/* Bottom hairline */}
      <div className="absolute inset-x-0 bottom-0 hairline-x opacity-60" />
    </section>
  );
}

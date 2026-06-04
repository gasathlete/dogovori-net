import { ShieldCheck, Bird, FileText, ArrowRight, Search, FileSignature } from "lucide-react";
import logoImg from "@/assets/logo-dogovori-hero.webp";
import { scrollToHash } from "@/lib/scrollToHash";

export function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
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

      <div className="container relative pt-4 pb-10 sm:pt-6 sm:pb-16 md:pt-10 md:pb-24 lg:pt-12 lg:pb-28">
        <div className="relative mx-auto max-w-3xl text-center">
          {/* Centered hero medallion — visible, doesn't overlap content */}
          <div
            className="anim-rise mx-auto mb-6 flex items-center justify-center sm:mb-8"
            style={{ animationDelay: "0ms" }}
          >
            <div className="relative flex h-20 w-20 items-center justify-center sm:h-24 sm:w-24 md:h-28 md:w-28">
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
                alt="Dogovori.net"
                width={112}
                height={112}
                loading="eager"
                {...({ fetchpriority: "high" } as any)}
                decoding="async"
                className="relative h-[64%] w-[64%] object-contain"
              />
            </div>
          </div>

          <h1
            className="anim-rise font-serif text-[28px] font-bold leading-[1.1] text-balance sm:text-4xl md:text-5xl lg:text-[58px] lg:leading-[1.05]"
            style={{ animationDelay: "0ms" }}
          >
            Договори, които{" "}
            <span className="text-gold">търсят и намират</span>{" "}
            Вашите интереси
          </h1>
          <div
            className="anim-rise mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:text-[11px]"
            style={{ animationDelay: "80ms" }}
          >
            <span className="inline-flex items-center gap-1.5 text-gold"><ShieldCheck className="h-3.5 w-3.5" /> ЗЗД · ТЗ · ЗУТ</span>
            <span className="h-3 w-px bg-gold/30" />
            <span className="inline-flex items-center gap-1.5"><Bird className="h-3.5 w-3.5 text-gold" /> АНАЛИЗ НА РИСКА</span>
            <span className="h-3 w-px bg-gold/30" />
            <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-gold" /> &gt;590 шаблона</span>
            <span className="h-3 w-px bg-gold/30" />
            <span className="inline-flex items-center gap-1.5"><FileSignature className="h-3.5 w-3.5 text-gold" /> Електронен подпис</span>
          </div>
          <p
            className="anim-rise mx-auto mt-5 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base md:mt-6 md:text-lg md:leading-[1.7]"
            style={{ animationDelay: "160ms" }}
          >
            Освен шаблони и бланки, сайтът предлага разработка на собствен документ, с правна подкрепа от Нашата Система. Стратегически въпроси, които да напътстват Вашата сделка. Dogovori.net изгражда индивидуални договори и документи, съобразени със ЗЗД, ТЗ и ЗУТ, придружени от пълен правен риск-анализ.
          </p>
          <div
            className="anim-rise mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5"
            style={{ animationDelay: "240ms" }}
          >
            <button
              onClick={onStart}
              className="btn-gold w-full sm:w-auto normal-case tracking-normal text-base px-8 py-4"
            >
              <Search className="h-[18px] w-[18px]" /> Намери документ
            </button>
            <a
              href="/build"
              className="btn-gold-inverse w-full sm:w-auto normal-case tracking-normal text-base px-8 py-4"
            >
              <ArrowRight className="h-[18px] w-[18px]" /> Изготви документ
            </a>
          </div>
          <p
            className="anim-rise mt-4 text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
            style={{ animationDelay: "300ms" }}
          >
            &gt;590 шаблона · Предприемач - 9.90 €/мес · без скрити такси
          </p>
          <div className="anim-rise mt-3 text-center" style={{ animationDelay: "340ms" }}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                scrollToHash("process");
              }}
              className="text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-gold focus-visible:text-gold"
            >
              Как работи процесът ↓
            </button>
          </div>

          <div
            className="anim-rise mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:mt-14 sm:grid-cols-3 md:mt-16"
            style={{ animationDelay: "400ms" }}
          >
            {[
              { icon: FileText, label: "категории в каталога", metric: "Над  20 ", value: "ЗЗД · ТЗ · ЗУТ" },
              { icon: Bird, label: "До готов документ", metric: "<2 мин", value: "Автоматизиран стратегически въпросник" },
              { icon: ShieldCheck, label: "Правно съответствие", metric: "100%", value: "GDPR · eIDAS · ЗЕДЕУУ" },
            ].map((item) => (
              <div
                key={item.label}
                className="group relative bg-card/70 p-5 text-left backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-card/90 sm:p-6"
              >
                <item.icon
                  className="mb-3 h-5 w-5 text-gold transition-transform duration-300 group-hover:scale-110"
                  strokeWidth={1.6}
                />
                <div className="metric-number text-2xl sm:text-3xl">{item.metric}</div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground/80 sm:text-sm">
                  {item.value}
                </div>
                <span className="pointer-events-none absolute left-2 top-2 h-2.5 w-2.5 border-l border-t border-gold/0 transition-colors duration-300 group-hover:border-gold/60" />
                <span className="pointer-events-none absolute bottom-2 right-2 h-2.5 w-2.5 border-b border-r border-gold/0 transition-colors duration-300 group-hover:border-gold/60" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom hairline */}
      <div className="absolute inset-x-0 bottom-0 hairline-x opacity-60" />
    </section>
  );
}

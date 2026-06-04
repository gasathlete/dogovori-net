import { ShieldCheck, Bird, FileText, ArrowRight, Search, Sparkles, FileSignature } from "lucide-react";
import logoImg from "@/assets/logo-dogovori-hero.webp";
import { scrollToHash } from "@/lib/scrollToHash";

export function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div className="absolute inset-0 bg-gradient-hero opacity-90" />
      <div className="absolute inset-0 bg-fine-grid opacity-60" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <img
          src={logoImg}
          alt=""
          width={256}
          height={256}
          loading="eager"
          {...({ fetchpriority: "high" } as any)}
          decoding="async"
          className="h-[80%] max-h-[680px] w-auto -rotate-[4deg] opacity-[0.08] md:opacity-[0.12]"
        />
      </div>
      {/* Top gold hairline */}
      <div className="absolute inset-x-0 top-0 hairline-x" />

      <div className="container relative py-10 sm:py-16 md:py-24 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <div
            className="anim-rise mb-5 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold sm:px-3.5 sm:text-[11px]"
            style={{ animationDelay: "0ms" }}
          >
            <Bird className="h-3.5 w-3.5" />
            Професионален юридически помощник
          </div>
          <h1
            className="anim-rise font-serif text-[28px] font-bold leading-[1.1] text-balance sm:text-4xl md:text-5xl lg:text-[58px] lg:leading-[1.05]"
            style={{ animationDelay: "80ms" }}
          >
            Договори, които{" "}
            <span className="gold-shimmer">търсят и намират</span>{" "}
            Вашите интереси
          </h1>
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
              className="btn-gold btn-sheen w-full sm:w-auto normal-case tracking-normal text-base px-8 py-4"
            >
              <Search className="h-[18px] w-[18px]" /> Намери документ
            </button>
            <a
              href="/build"
              className="btn-gold-inverse btn-sheen w-full sm:w-auto normal-case tracking-normal text-base px-8 py-4"
            >
              <ArrowRight className="h-[18px] w-[18px]" /> Изготви документ
            </a>
          </div>
          <div className="anim-rise mt-3 text-center" style={{ animationDelay: "320ms" }}>
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
              { icon: ShieldCheck, label: "Правно съответствие", value: "ЗЗД · ТЗ · ЗУТ" },
              { icon: Bird, label: "Оценка на риска", value: "Набюдавайте проблем" },
              { icon: FileText, label: "Експорт", value: "PDF + DOCX + ЕЛЕКТРОНЕН ПОДПИС" },
            ].map((item) => (
              <div
                key={item.label}
                className="group relative bg-card/70 p-5 text-left backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-card/90 sm:p-6"
              >
                <item.icon
                  className="mb-3 h-5 w-5 text-gold transition-transform duration-300 group-hover:scale-110"
                  strokeWidth={1.6}
                />
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-1.5 font-serif text-base text-foreground sm:text-lg mx-[6px]">
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

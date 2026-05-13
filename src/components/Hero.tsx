import { ShieldCheck, Bird, FileText, ArrowRight, Search } from "lucide-react";
import logoImg from "@/assets/logo-dogovori-hero.png";
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
          decoding="async"
          className="h-[80%] max-h-[680px] w-auto opacity-[0.12] md:opacity-[0.16]"
        />
      </div>
      {/* Top gold hairline */}
      <div className="absolute inset-x-0 top-0 hairline-x" />

      <div className="container relative py-10 sm:py-16 md:py-24 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold sm:px-3.5 sm:text-[11px] sm:tracking-[0.22em]">
            <Bird className="h-3.5 w-3.5" />
            Професионален юридически помощник
          </div>
          <h1 className="font-serif text-[28px] font-bold leading-[1.1] text-balance sm:text-4xl md:text-5xl lg:text-[58px] lg:leading-[1.05]">
            Договори, които{" "}
            <span className="gold-gradient-text">търсят и намират</span>{" "}
            Вашите интереси
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base md:mt-6 md:text-lg md:leading-[1.7]">
            Освен шаблони и бланки, сайтът предлага разработка на собствен документ, с правна подкрепа от Нашата Система. Стратегически въпроси, които да напътстват Вашата сделка. Dogovori.net изгражда индивидуални договори и документи, съобразени със ЗЗД, ТЗ и ЗУТ, придружени от пълен правен риск-анализ.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
            <button onClick={onStart} className="btn-gold w-full sm:w-auto normal-case tracking-normal text-base px-8 py-4">
              <Search className="h-[18px] w-[18px]" /> Намери договор
            </button>
            <a href="/build" className="btn-gold-inverse w-full sm:w-auto normal-case tracking-normal text-base px-8 py-4">
              <ArrowRight className="h-[18px] w-[18px]" /> Изготви договор
            </a>
          </div>
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                scrollToHash("process");
              }}
              className="text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-gold"
            >
              Как работи процесът ↓
            </button>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:mt-14 sm:grid-cols-3 md:mt-16">
            {[
              { icon: ShieldCheck, label: "Правно съответствие", value: "ЗЗД · ТЗ · ЗУТ" },
              { icon: Bird, label: "Оценка на риска", value: "Набюдавайте проблем" },
              { icon: FileText, label: "Експорт", value: "PDF + DOCX + ЕЛЕКТРОНЕН ПОДПИС" },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-card/70 p-5 text-left backdrop-blur-sm sm:p-6"
              >
                <item.icon className="mb-3 h-5 w-5 text-gold" strokeWidth={1.6} />
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-1.5 font-serif text-base text-foreground sm:text-lg mx-[6px]">{item.value}</div>
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

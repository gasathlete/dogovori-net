import { PRICING_PLANS, monthlyLabel, opsLabel } from "@/lib/pricing";
import { X, Check, FileUp, FileSignature, ArrowRight } from "@/icons";
import { Link } from "react-router-dom";

const PAINS = [
  "150–400 € на адвокат за стандартен договор",
  "Готовите шаблони без анализ Ви излагат на риск",
  "Една грешна/остаряла клауза = загубена сделка",
];

const GAINS = [
  `От ${monthlyLabel("professional")} — ${opsLabel("professional")} (${PRICING_PLANS.professional.name}) или ${monthlyLabel("entrepreneur")} — ${opsLabel("entrepreneur")} (${PRICING_PLANS.entrepreneur.name}) без скрити такси`,
  "AI риск-анализ, към днешна дата преди да подпишете",
  "Професионален документ, готов за електронен подпис >2 минути",
];


export function PainSolution() {
  return (
    <section className="container py-12 sm:py-16 md:py-20">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <div className="eyebrow mb-3 justify-center">
          <span className="section-number font-serif text-base font-normal tracking-normal text-gold/60">08</span>
          <span className="h-px w-6 bg-gold/40" />
          РЕШЕНИЕ
        </div>
        <h2 className="font-serif text-3xl font-bold leading-tight text-balance sm:text-4xl md:text-5xl">
          Не прави компромиси. Договори своите правила.
        </h2>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Един абонамент гарантира достъп до актуален набор от висококачествени,&nbsp; персонализирани договори и документи, елимириайки риска от безплатните PDF сайтове и старите бланки.
        </p>
      </div>

      <div className="relative mx-auto grid max-w-5xl gap-6 md:grid-cols-2 md:gap-0 lg:max-w-6xl">
        {/* Vertical center hairline + diamond accent (desktop only) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-6 hidden h-[calc(100%-3rem)] -translate-x-1/2 md:block"
        >
          <div className="h-full w-px bg-gradient-to-b from-transparent via-gold/30 to-transparent" />
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-gold/60 bg-navy" />
        </div>

        {/* Pain column */}
        <div className="rounded-xl border border-border/60 bg-card/40 p-6 sm:p-8 md:rounded-r-none md:border-r-0">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Без Договори.нет
          </p>
          <ul className="space-y-4">
            {PAINS.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
                  <X className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{p}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Solution column */}
        <div
          className="rounded-xl border border-gold/30 bg-card/60 p-6 sm:p-8 md:rounded-l-none"
          style={{ boxShadow: "var(--shadow-inset-line)" }}
        >
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
            С Договори.нет
          </p>
          <ul className="space-y-4">
            {GAINS.map((g) => (
              <li key={g} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-500">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm leading-relaxed text-foreground sm:text-[15px]">{g}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>


      {/* Dual CTA — try without registration, login required for downloads / applying changes */}
      <div className="mx-auto mt-10 max-w-3xl">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/account?action=upload"
            className="group inline-flex items-center justify-center gap-2 rounded-md bg-gradient-gold px-5 py-3.5 text-sm font-semibold uppercase tracking-[0.14em] text-navy shadow-gold transition-transform hover:-translate-y-0.5"
          >
            <FileUp className="h-4 w-4" />
            Качи документ за анализ
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/build"
            className="group inline-flex items-center justify-center gap-2 rounded-md border border-gold/50 bg-card/60 px-5 py-3.5 text-sm font-semibold uppercase tracking-[0.14em] text-gold transition-colors hover:bg-gold/10"
          >
            <FileSignature className="h-4 w-4" />
            Изготви документ
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Можете да започнете без регистрация. Вход/регистрация се изискват само при сваляне или прилагане на промени — прогресът Ви се запазва автоматично.
        </p>
      </div>
    </section>
  );
}

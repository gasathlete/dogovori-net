import { X, Check } from "lucide-react";

const PAINS = [
  "150–400 € на адвокат за стандартен договор",
  "Готовите шаблони без анализ Ви излагат на риск",
  "Една грешна/остаряла клауза = загубена сделка",
];

const GAINS = [
  "12.90 €/мес. за 100 операции — без скрити такси",
  "AI риск-анализ, към днешна дата преди да подпишете",
  "Професионален документ, готов за електронен подпис >2 минути",
];

export function PainSolution() {
  return (
    <section className="container py-14 sm:py-16 md:py-20">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <div className="eyebrow mb-3 justify-center">Проблем · Решение</div>
        <h2 className="font-serif text-2xl font-bold leading-tight text-balance sm:text-3xl md:text-4xl">
          Спрете да губите време и пари за документи
        </h2>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Един абонамент заменя адвокат за стандартни договори, безплатните PDF сайтове и риска от грешка.
        </p>
      </div>

      <div className="relative mx-auto grid max-w-5xl gap-6 md:grid-cols-2 md:gap-0">
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
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/15 text-gold">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm leading-relaxed text-foreground sm:text-[15px]">{g}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

import { useState } from "react";
import * as Icons from "lucide-react";
import { ArrowRight, Compass, ChevronDown } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { LIFE_SCENARIOS } from "@/data/lifeScenarios";
import { getKit } from "@/data/documentKits";

const INITIAL_COUNT = 8;

/**
 * "What do you want to accomplish?" — real-life scenarios entry point.
 * Each scenario links to a curated document kit (/komplekti/:slug).
 */
export function LifeScenarios() {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? LIFE_SCENARIOS : LIFE_SCENARIOS.slice(0, INITIAL_COUNT);
  const hiddenCount = LIFE_SCENARIOS.length - INITIAL_COUNT;

  return (
    <section
      id="scenarios"
      aria-labelledby="scenarios-heading"
      className="container py-12 sm:py-14 md:py-20"
    >
      <div className="mb-8 max-w-2xl md:mb-10">
        <div className="eyebrow mb-3">
          <Compass className="h-3 w-3" />
          Готови комплекти
        </div>
        <h2
          id="scenarios-heading"
          className="font-serif text-2xl font-bold leading-[1.15] text-balance sm:text-3xl md:text-4xl lg:text-[40px]"
        >
          Какво искате да постигнете?
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Изберете ситуация от ежедневието — ще получите комплект от всички нужни документи.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
        {visible.map((s) => {
          const Icon = (Icons as any)[s.icon] ?? Icons.FileText;
          const kit = s.kitId ? getKit(s.kitId) : undefined;
          const to = s.href ?? (kit ? `/komplekti/${kit.id}` : "/komplekti");
          const meta = kit ? `${kit.items.length} документа` : "Всички комплекти";
          return (
            <li key={s.id} className="card-contain">
              <Link
                to={to}
                className="group flex h-full items-start gap-3 rounded-xl border border-hairline bg-card/60 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/45 hover:bg-card sm:p-4"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold transition-colors group-hover:border-gold/55 group-hover:bg-gold/15 sm:h-11 sm:w-11">
                  <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" strokeWidth={1.6} />
                </span>
                <span className="flex flex-1 flex-col gap-1 min-w-0">
                  <span className="text-[13px] font-medium leading-snug text-foreground sm:text-sm break-words">
                    {s.label}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold/70">
                    {meta}
                  </span>
                </span>
                <ArrowRight
                  className="mt-1 h-3.5 w-3.5 shrink-0 text-gold/0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-gold"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold transition-colors hover:bg-gold/20"
            aria-expanded={expanded}
          >
            {expanded ? "Виж по-малко" : `Виж още ${hiddenCount} ситуации`}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        )}
        <Link to="/komplekti" className="btn-ghost-gold normal-case tracking-normal">
          Преглед на всички комплекти <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

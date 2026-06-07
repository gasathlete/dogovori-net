import * as Icons from "lucide-react";
import { ArrowRight, Compass } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { LIFE_SCENARIOS } from "@/data/lifeScenarios";

/**
 * "What do you want to accomplish?" — real-life scenarios entry point.
 * Inspired by LawDepot, restyled in our navy + gold system. Goes between
 * the Hero and PlatformShowcase to capture intent early.
 */
export function LifeScenarios() {
  return (
    <section
      id="scenarios"
      aria-labelledby="scenarios-heading"
      className="container py-12 sm:py-14 md:py-20"
    >
      <div className="mb-8 max-w-2xl md:mb-10">
        <div className="eyebrow mb-3">
          <Compass className="h-3 w-3" />
          Започнете оттук
        </div>
        <h2
          id="scenarios-heading"
          className="font-serif text-2xl font-bold leading-[1.15] text-balance sm:text-3xl md:text-4xl lg:text-[40px]"
        >
          Какво искате да постигнете?
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Изберете житейска ситуация — ще ви отведем директно до правилния шаблон.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
        {LIFE_SCENARIOS.map((s) => {
          const Icon = (Icons as any)[s.icon] ?? Icons.FileText;
          return (
            <li key={s.id}>
              <Link
                to={s.href}
                className="group flex h-full items-center gap-3 rounded-xl border border-hairline bg-card/60 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/45 hover:bg-card sm:p-4"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold transition-colors group-hover:border-gold/55 group-hover:bg-gold/15 sm:h-11 sm:w-11">
                  <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" strokeWidth={1.6} />
                </span>
                <span className="flex-1 text-[13px] font-medium leading-snug text-foreground sm:text-sm">
                  {s.label}
                </span>
                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0 text-gold/0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-gold"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex justify-center">
        <Link
          to="/catalog"
          className="btn-ghost-gold normal-case tracking-normal"
        >
          Разгледайте всички 600+ шаблона <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

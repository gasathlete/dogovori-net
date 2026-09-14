import { useState } from "react";
import * as Icons from "@/icons";
import { ArrowRight, Compass, ChevronDown } from "@/icons";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { LIFE_SCENARIOS } from "@/data/lifeScenarios";
import { getKit, type DocumentKit } from "@/data/documentKits";
import kitCorporate from "@/assets/kits/kit-corporate.jpg";
import kitRealEstate from "@/assets/kits/kit-real-estate.jpg";
import kitEmployment from "@/assets/kits/kit-employment.jpg";
import kitDigital from "@/assets/kits/kit-digital.jpg";
import kitIp from "@/assets/kits/kit-ip.jpg";
import kitFamily from "@/assets/kits/kit-family.jpg";
import kitOther from "@/assets/kits/kit-other.jpg";

/** По едно изображение за всяка категория комплект. */
const KIT_GROUP_IMAGE: Record<DocumentKit["group"], string> = {
  corporate: kitCorporate,
  real_estate: kitRealEstate,
  employment: kitEmployment,
  digital: kitDigital,
  ip: kitIp,
  family: kitFamily,
  other: kitOther,
};

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
      className="container py-12 sm:py-16 md:py-20"
    >
      <div className="mb-8 max-w-2xl md:mb-10">
        <div className="eyebrow mb-3">
          <span className="section-number font-serif text-base font-normal tracking-normal text-gold/60">03</span>
          <span className="h-px w-6 bg-gold/40" />
          <Compass className="h-3 w-3" />
          Готови комплекти
        </div>
        <h2
          id="scenarios-heading"
          className="font-serif text-2xl font-bold leading-[1.15] text-balance sm:text-3xl md:text-4xl lg:text-[40px]"
        >
          Какво имате нужда, да се догов<span className="text-accent-gradient stress-accent">о</span>ри ?&nbsp;
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
                className="group flex h-full flex-col overflow-hidden rounded-xl border border-hairline bg-card/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/45 hover:bg-card"
              >
                <span className="relative block aspect-[16/9] w-full overflow-hidden bg-navy-deep/60">
                  <img
                    src={KIT_GROUP_IMAGE[kit?.group ?? "other"]}
                    alt={kit ? `Комплект „${kit.title}“ — ${kit.groupLabel}` : "Всички комплекти документи"}
                    loading="lazy"
                    width={768}
                    height={512}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/20 to-transparent" />
                  <span className="absolute bottom-2 left-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gold/30 bg-background/80 text-gold">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
                  </span>
                </span>
                <span className="flex flex-1 flex-col gap-1 min-w-0 p-3.5 sm:p-4">
                  <span className="text-[13px] font-medium leading-snug text-foreground sm:text-sm break-words">
                    {s.label}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold/70">
                    {meta}
                  </span>
                </span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[11px] font-semibold text-gold/80">
                    Вижте комплекта
                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
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

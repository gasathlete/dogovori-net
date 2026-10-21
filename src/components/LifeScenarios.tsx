import { useState } from "react";
import * as Icons from "@/icons";
import { ArrowRight, Compass, ChevronDown } from "@/icons";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { LIFE_SCENARIOS } from "@/data/lifeScenarios";
import { getKit } from "@/data/documentKits";
import { Button } from "@/components/ui/button";
import { LaunchPurchaseBanner } from "@/components/prelaunch/LaunchPurchaseBanner";
import rentOutImage from "@/assets/scenarios/sc-rent-out.jpg";
import buySellRealEstateImage from "@/assets/scenarios/sc-buy-sell-re.jpg";
import startBusinessImage from "@/assets/scenarios/sc-start-biz.jpg";
import investmentImage from "@/assets/scenarios/sc-invest.jpg";
import hireImage from "@/assets/scenarios/sc-hire.jpg";
import terminateImage from "@/assets/scenarios/sc-terminate.jpg";
import freelanceImage from "@/assets/scenarios/sc-freelance.jpg";
import digitalImage from "@/assets/scenarios/sc-digital.jpg";
import ecommerceImage from "@/assets/scenarios/sc-ecommerce.jpg";
import vehicleImage from "@/assets/scenarios/sc-vehicle.jpg";
import powerOfAttorneyImage from "@/assets/scenarios/sc-poa.jpg";
import ndaImage from "@/assets/scenarios/sc-nda.jpg";
import gdprImage from "@/assets/scenarios/sc-gdpr.jpg";
import familyImage from "@/assets/scenarios/sc-family.jpg";
import inheritanceImage from "@/assets/scenarios/sc-inheritance.jpg";
import loanImage from "@/assets/scenarios/sc-loan.jpg";
import collectionImage from "@/assets/scenarios/sc-collect.jpg";
import declarationImage from "@/assets/scenarios/sc-declaration.jpg";
import unsureImage from "@/assets/scenarios/sc-unsure.jpg";

/** Уникална реалистична сцена за всяка житейска ситуация. */
const SCENARIO_IMAGE: Record<string, string> = {
  "rent-out": rentOutImage,
  "buy-sell-re": buySellRealEstateImage,
  "start-biz": startBusinessImage,
  invest: investmentImage,
  hire: hireImage,
  terminate: terminateImage,
  freelance: freelanceImage,
  digital: digitalImage,
  ecommerce: ecommerceImage,
  vehicle: vehicleImage,
  poa: powerOfAttorneyImage,
  nda: ndaImage,
  gdpr: gdprImage,
  family: familyImage,
  inheritance: inheritanceImage,
  loan: loanImage,
  collect: collectionImage,
  declaration: declarationImage,
  unsure: unsureImage,
};

const FEATURED_IDS = ["rent-out", "freelance", "digital", "hire", "buy-sell-re", "vehicle"] as const;
const FEATURED = FEATURED_IDS.map((id) => LIFE_SCENARIOS.find((scenario) => scenario.id === id)).filter((scenario): scenario is (typeof LIFE_SCENARIOS)[number] => Boolean(scenario));

/**
 * "What do you want to accomplish?" — real-life scenarios entry point.
 * Each scenario links to a curated document kit (/komplekti/:slug).
 */
export function LifeScenarios() {
  const [expanded, setExpanded] = useState(false);
  const remaining = LIFE_SCENARIOS.filter((scenario) => !FEATURED_IDS.includes(scenario.id as (typeof FEATURED_IDS)[number]));
  const visible = expanded ? [...FEATURED, ...remaining] : FEATURED;
  const hiddenCount = remaining.length;

  return (
    <section
      id="scenarios"
      aria-labelledby="scenarios-heading"
      className="container py-12 sm:py-16 md:py-20"
    >
      <div className="mb-8 max-w-2xl md:mb-10">
        <div className="eyebrow mb-3">
          <span className="h-px w-6 bg-gold/40" />
          <Compass className="h-3 w-3" />
          Готови комплекти
        </div>
        <h2
          id="scenarios-heading"
          className="font-serif text-2xl font-bold leading-[1.15] text-balance sm:text-3xl md:text-4xl lg:text-[40px]"
        >
          Комплекти за конкретна ситуация
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Следвайте подредените етапи и разгледайте наличните документи. Обхватът зависи от конкретния случай.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
        {visible.map((s) => {
          const Icon = (Icons as any)[s.icon] ?? Icons.FileText;
          const kit = s.kitId ? getKit(s.kitId) : undefined;
          const to = s.href ?? (kit ? `/komplekti/${kit.id}` : "/komplekti");
           const meta = kit ? `${kit.items.length} документа в каталога` : "Всички комплекти";
          return (
            <li key={s.id} className="card-contain">
              <Link
                to={to}
                className="group flex h-full flex-row items-start gap-4 overflow-hidden p-4 rounded-xl border border-border bg-card transition-colors hover:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <span className="relative block size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                  <img
                    src={SCENARIO_IMAGE[s.id]}
                    alt={`${s.label} — комплект документи`}
                    loading="lazy"
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                </span>
                <span className="flex flex-1 flex-col gap-1 min-w-0">
                  <span className="text-base font-semibold leading-snug text-foreground break-words">
                    {s.label}
                  </span>
                  <span className="text-xs font-semibold text-gold">
                    {meta}
                  </span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold text-gold">
                    Вижте комплекта
                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <LaunchPurchaseBanner className="mt-6" source="kit_catalog" productId="kit_catalog" />

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        {hiddenCount > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setExpanded((v) => !v)}
            className="min-h-11 border-gold/40 bg-gold/10 text-xs font-semibold text-gold hover:bg-gold/20"
            aria-expanded={expanded}
          >
            {expanded ? "Виж по-малко" : `Виж още ${hiddenCount} ситуации`}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </Button>
        )}
        <Link to="/komplekti" className="btn-ghost-gold normal-case tracking-normal">
          Преглед на всички комплекти <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

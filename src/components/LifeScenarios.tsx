import { BrowseShelf } from "@/components/home/BrowseShelf";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ArrowRight, ChevronDown } from "@/icons";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { LIFE_SCENARIOS } from "@/data/lifeScenarios";
import { getKit } from "@/data/documentKits";
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

const FEATURED_IDS = ["rent-out", "freelance", "digital", "hire", "buy-sell-re", "vehicle", "start-biz", "ecommerce", "nda", "gdpr", "inheritance", "collect"] as const;
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
    <section id="scenarios" aria-labelledby="scenarios-heading" className="home-situations border-b border-border bg-card">
      <div className="container py-14 sm:py-20">
        <div className="max-w-2xl">
          <h2 id="scenarios-heading" className="font-serif text-3xl font-bold leading-tight sm:text-4xl">
            Комплекти за конкретна ситуация
          </h2>
          <p className="mt-3 max-w-[56ch] text-base leading-relaxed text-muted-foreground">
            Следвайте подредените етапи и разгледайте наличните документи. Обхватът зависи от конкретния случай.
          </p>
        </div>

        <BrowseShelf label="Комплекти по ситуации">
          {visible.map((s) => {
            const kit = s.kitId ? getKit(s.kitId) : undefined;
            const to = s.href ?? (kit ? `/komplekti/${kit.id}` : "/komplekti");
            const meta = kit ? `${kit.items.length} документа в каталога` : "Всички комплекти";
            return (
              <li key={s.id} className="browse-item">
                <Link to={to} className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <img src={SCENARIO_IMAGE[s.id]} alt="" loading="lazy" width={480} height={320} className="browse-image" />
                  <span className="block min-w-0 p-5">
                    <span className="block font-serif text-xl font-bold leading-snug text-foreground underline-offset-4 group-hover:underline">{s.label}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{meta}</span>
                  </span>
                  <span className="mx-5 mb-5 flex min-h-11 items-center justify-between border-t border-border pt-3 text-sm font-semibold">Вижте документите <ArrowRight className="size-4" aria-hidden="true" /></span>
                </Link>
              </li>
            );
          })}
        </BrowseShelf>

        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2">
          {hiddenCount > 0 && (
            <Button variant="link" type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="link-ink inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold">
              {expanded ? "Покажете по-малко" : `Още ${hiddenCount} ситуации`}
              <ChevronDown className={`h-4 w-4 ${expanded ? "rotate-180" : ""}`} />
            </Button>
          )}
          <Link to="/komplekti" className="link-ink inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold">
            Всички комплекти <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <LaunchPurchaseBanner className="mt-6" source="kit_catalog" productId="kit_catalog" />
      </div>
    </section>
  );
}

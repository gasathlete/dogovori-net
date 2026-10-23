/**
 * „Продукти и планове“ на началната страница. Еднократните продукти вече са в
 * hero-а като ценови списък, затова тук стоят плановете като редове с цени
 * (от src/lib/pricing.ts) и връзки към подробните страници.
 */
import { RegistrationCTA } from "@/components/funnel/RegistrationCTA";
import { useEffect } from "react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight } from "@/icons";
import { useInView } from "@/hooks/useInView";
import { ONE_TIME_PRODUCTS, PRODUCT_EVENTS } from "@/lib/products";
import { PRICING_PLANS, monthlyLabel, opsLabel, teamSummary } from "@/lib/pricing";
import { trackFunnelEvent } from "@/lib/funnel";

const PLAN_IDS = ["free", "professional", "entrepreneur"] as const;

export function ProductsSection() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });

  useEffect(() => {
    if (!inView) return;
    trackFunnelEvent(
      PRODUCT_EVENTS.sectionViewed,
      { source: "home", variant: "showcase", products: ONE_TIME_PRODUCTS.length },
      { dedupKey: "home|showcase" },
    );
  }, [inView]);

  return (
    <section id="produkti" aria-labelledby="home-products-title" className="brand-plans-band border-b border-border">
      <div ref={ref} className="container grid gap-4 py-14 sm:py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div>
          <h2 id="home-products-title" className="font-serif text-3xl font-bold leading-tight sm:text-4xl">
            Продукти и планове
          </h2>
          <p className="mt-3 max-w-[46ch] text-base leading-relaxed text-muted-foreground">
            Еднократен продукт за един документ или план за редовна работа с документи. Цените са с ДДС.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6">
            <Link to="/produkti" className="link-ink inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
              Еднократни продукти <ArrowRight className="size-4" />
            </Link>
            <Link to="/plans" className="link-ink inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
              Всички планове <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="mt-5"><RegistrationCTA source="plans_section" /></div>
          <dl className="mt-6 space-y-4 border-t border-border pt-5">
            <div><dt className="font-semibold">За конкретен документ</dt><dd className="mt-1 text-sm leading-relaxed text-muted-foreground">Изберете проверка, поправка или пакет за преговори. Без задължителен абонамент.</dd></div>
            <div><dt className="font-semibold">За редовна работа</dt><dd className="mt-1 text-sm leading-relaxed text-muted-foreground">Изготвяне, анализ, сваляне и работа с асистента в рамките на избрания план.</dd></div>
          </dl>
        </div>

        <table className="w-full border-t border-foreground/80 text-left text-sm">
          <caption className="sr-only">Планове</caption>
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className="py-3 pr-4 font-normal">План</th>
              <th scope="col" className="py-3 pr-4 font-normal">Обем</th>
              <th scope="col" className="py-3 text-right font-normal">Цена</th>
            </tr>
          </thead>
          <tbody>
            {PLAN_IDS.map((id) => (
              <tr key={id} className="border-b border-border">
                <th scope="row" className="py-4 pr-4 font-serif text-lg font-bold text-foreground"><Link to="/plans" className="link-ink inline-flex min-h-11 items-center">{PRICING_PLANS[id].name}</Link></th>
                <td className="py-4 pr-4 text-muted-foreground">{opsLabel(id)}</td>
                <td className="py-4 text-right font-semibold tabular-nums text-foreground">{monthlyLabel(id)}</td>
              </tr>
            ))}
            <tr className="border-b border-border">
              <th scope="row" className="py-4 pr-4 font-serif text-lg font-bold text-foreground">{PRICING_PLANS.team.name}</th>
              <td colSpan={2} className="py-4 text-right text-muted-foreground">{teamSummary()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

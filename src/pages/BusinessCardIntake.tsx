/**
 * /produkti/biznes-karta — лек intake екран за „Бизнес договорна карта".
 *
 * Задава само първия въпрос с най-висок сигнал и препоръчва план
 * детерминистично. НЕ таксува, не създава checkout и не твърди покупка.
 */
import { useState } from "react";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, Check } from "@/icons";
import { trackFunnelEvent } from "@/lib/funnel";
import {
  ONE_TIME_TERMS,
  PERSONA_RECOMMENDATIONS,
  PRODUCT_EVENTS,
  getProduct,
  loadBusinessPersona,
  personaNextStepHref,
  productPriceLabel,
  recommendForPersona,
  saveBusinessPersona,
  type BusinessPersona,
} from "@/lib/products";

const PRODUCT = getProduct("business_contract_map");
const CHOICES: BusinessPersona[] = ["own_business", "client_work"];

export default function BusinessCardIntake() {
  const [persona, setPersona] = useState<BusinessPersona | null>(() =>
    loadBusinessPersona(),
  );

  const select = (value: BusinessPersona) => {
    setPersona(value);
    saveBusinessPersona(value);
    trackFunnelEvent(PRODUCT_EVENTS.personaSelected, {
      persona: value,
      product: PRODUCT.id,
      recommended_plan: recommendForPersona(value).plan,
    });
  };

  const recommendation = persona ? recommendForPersona(persona) : null;

  return (
    <>
      <Seo
        title="Бизнес договорна карта — първа стъпка"
        description="Отговорете на един въпрос и получавате подредена карта на нужните ви договори, приоритети и план за 30 дни."
        canonical="/produkti/biznes-karta"
      />
      <Header />
      <main className="route-fade min-h-dvh pb-20 pt-8">
        <section className="container mx-auto max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
            {PRODUCT.name} · {productPriceLabel(PRODUCT.id)}
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold leading-tight sm:text-4xl">
            Един въпрос, преди да подредим договорите ви
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {PRODUCT.promise}
          </p>
          <p className="mt-2 text-[12px] font-medium text-muted-foreground">
            {ONE_TIME_TERMS}
          </p>

          <fieldset className="mt-8">
            <legend className="font-serif text-lg font-bold text-foreground">
              Работите с договори основно за:
            </legend>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {CHOICES.map((value) => {
                const option = PERSONA_RECOMMENDATIONS[value];
                const active = persona === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    data-persona={value}
                    onClick={() => select(value)}
                    className={
                      "flex items-center justify-between gap-3 rounded-xl border px-4 py-4 text-left text-[15px] font-semibold transition-all duration-200 " +
                      (active
                        ? "border-gold/60 bg-gold/[0.1] text-foreground shadow-soft"
                        : "border-border/60 bg-card/50 text-foreground hover:border-gold/50")
                    }
                  >
                    {option.choiceLabel}
                    {active && <Check className="h-4 w-4 text-gold" />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div aria-live="polite" className="mt-6">
            {recommendation && (
              <div
                data-testid="persona-recommendation"
                className="rounded-2xl border border-gold/30 bg-card/60 p-5 shadow-soft"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
                  Подходящ план за вас
                </p>
                <h2 className="mt-1 font-serif text-xl font-bold text-foreground">
                  {recommendation.planName}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {recommendation.reason}
                </p>
                <Link
                  to={personaNextStepHref(recommendation.persona)}
                  onClick={() =>
                    trackFunnelEvent(PRODUCT_EVENTS.nextStepClicked, {
                      product: PRODUCT.id,
                      persona: recommendation.persona,
                      recommended_plan: recommendation.plan,
                    })
                  }
                  className="btn-gold btn-press mt-4 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[14px] font-semibold"
                >
                  Продължи към следващата стъпка
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>

          <ul className="mt-8 grid gap-2">
            {PRODUCT.outcomes.map((o) => (
              <li
                key={o}
                className="flex items-start gap-2 text-[13px] text-foreground/85"
              >
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                {o}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}

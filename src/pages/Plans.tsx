import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, X, ArrowRight, FileText, ShieldCheck, Users, Zap, Crown, Loader2 } from "@/icons";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { PlansHeroAnimation } from "@/components/PlansHeroAnimation";
import { ExpandableCard } from "@/components/ui/ExpandableCard";
import { TopupPacks } from "@/components/TopupPacks";
import { PlanCategoryAccordion } from "@/components/plans/PlanCategoryAccordion";
import { OfferAmount, OfferBenefits } from "@/components/products/OfferPresentation";
import { PlansAuroraHero } from "@/components/plans/PlansAuroraHero";
import { PlanScaleSlider } from "@/components/plans/PlanScaleSlider";
import { PlanStoryStage } from "@/components/plans/PlanStoryStage";
import { categorize, PLAN_HERO_BENEFIT } from "@/lib/planCategories";
import { AnalysisRecommendationBanner } from "@/components/funnel/AnalysisRecommendationBanner";
import { TrustGuaranteeBar } from "@/components/funnel/TrustGuaranteeBar";
import { SoftCapPanel } from "@/components/paywall/SoftCapPanel";


import { RoiSavingsBanner } from "@/components/funnel/RoiSavingsBanner";
import { AudienceToggle } from "@/components/funnel/AudienceToggle";
import {
  ENTRY_PACK_CONFIG,
  PRICING_PLANS,
  fmtEur,
  monthlyLabel,
  FREE_OFFER_RULE,
} from "@/lib/pricing";
import { useAudience } from "@/hooks/useAudience";
import { markFunnelStep } from "@/lib/funnel";
import { OneTaskAlternative } from "@/components/products/OneTaskAlternative";
import { FrequencyCompare } from "@/components/products/FrequencyCompare";
import { planVolumeSentence } from "@/components/products/PlanAlternativeNote";
import { useEffect } from "react";


import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { FAQ } from "@/lib/plansData";
import { usePlans, type Billing, type PlanId } from "@/hooks/usePlans";
import { trackEvent } from "@/lib/analytics";
import { trackPlansView } from "@/lib/metrics";
import { CATALOG_DOCUMENT_COUNT } from "@/lib/catalogStats";
import { CheckoutResumeCard } from "@/components/plans/CheckoutResumeCard";
import { LaunchPurchaseBanner } from "@/components/prelaunch/LaunchPurchaseBanner";
import { Button } from "@/components/ui/button";
import { openPrelaunchWaitlist } from "@/lib/prelaunchWaitlist";
import { isFeatureAvailable } from "@/lib/prelaunch";
import { entryPackCtaHref } from "@/lib/entryPack";
const SUBS_OPEN = isFeatureAvailable("subscription");


const OFFER_FEATURES: Partial<Record<PlanId, readonly RegExp[]>> = {
  professional: [/двуезични договори/i, /Без воден знак/i],
  entrepreneur: [/Всичко от Професионалист/i, /Приоритетна AI обработка/i],
  team: [/Споделена работна среда/i, /Корпоративна библиотека/i],
};

function buildCta(planId: PlanId, billing: Billing, isAuthed: boolean): {
  href: string;
  label: string;
} {
  if (planId === "free") {
    return isAuthed
      ? { href: "/account", label: "Към моя профил" }
      : { href: "/auth?tab=signup", label: "Започнете безплатно" };
  }
  if (planId === "team") {
    // Team is yearly-only — always link to team creation.
    const target = `/team`;
    return isAuthed
      ? { href: target, label: "Създайте екип" }
      : { href: `/auth?tab=signup&redirect=${encodeURIComponent(target)}&intent=plan_team`, label: "Създайте екип" };
  }
  const target = `/account?tab=subscription&plan=${planId}&billing=${billing}`;
  const planLabel = planId === "entrepreneur" ? "Предприемач" : "Професионалист";
  if (isAuthed) {
    return {
      href: target,
      label: `Активирайте ${planLabel}`,
    };
  }
  const redirect = encodeURIComponent(target);
  return {
    href: `/auth?tab=signup&redirect=${redirect}&intent=plan_${planId}`,
    label: `Изберете ${planLabel}`,
  };
}

/**
 * Единственият публичен CTA за входния пакет (без абонамент) — само линк и
 * неговият handler, без собствена рамка, за да не дублира картата около него.
 */
function EntryPackCta({ isAuthed, audience }: { isAuthed: boolean; audience: string }) {
  const track = () => {
    trackEvent("plans_cta_clicked", { plan: ENTRY_PACK_CONFIG.priceId, billing: "one_time", source: "public_entry_pack", authed: isAuthed, audience });
    trackEvent("plans_purchase_mode_selected", { mode: "one_time", audience });
  };
  if (SUBS_OPEN) {
    return (
      <Link to={entryPackCtaHref(isAuthed)} onClick={track}
        className="inline-flex min-h-11 w-fit shrink-0 items-center justify-center rounded border border-gold/40 px-5 text-sm font-semibold text-foreground hover:bg-gold/10">
        Купи за {fmtEur(ENTRY_PACK_CONFIG.eur)}
      </Link>
    );
  }
  return (
    <Button type="button" variant="outline"
      onClick={() => { track(); openPrelaunchWaitlist("subscription", { source: "plans", productId: "entry_pack" }); }}
      className="min-h-11 w-fit shrink-0 border-gold/40 text-foreground hover:bg-gold/10">
      Извести ме при пускане
    </Button>
  );
}

/** Период на фактуриране — едно място, ползвано в секцията „Абонаменти“. */
function BillingToggle({
  billing,
  setBilling,
}: {
  billing: Billing;
  setBilling: (b: Billing) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Период на фактуриране"
      className="relative inline-flex items-center rounded border border-hairline bg-card/80 p-1  shadow-soft"
    >
      <Button
        variant="ghost"
        role="tab"
        aria-selected={billing === "monthly"}
        onClick={() => setBilling("monthly")}
        className={cn(
          "relative z-10 rounded px-5 py-2 text-sm font-medium transition-all duration-300 sm:px-6",
          billing === "monthly"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Месечно
      </Button>
      <Button
        variant="ghost"
        role="tab"
        aria-selected={billing === "yearly"}
        onClick={() => setBilling("yearly")}
        className={cn(
          "relative z-10 inline-flex items-center gap-2 rounded px-5 py-2 text-sm font-medium transition-all duration-300 sm:px-6",
          billing === "yearly"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Годишно

      </Button>
    </div>
  );
}



export default function Plans() {
  const { user } = useAuth();
  const isAuthed = Boolean(user);
  const { audience, copy } = useAudience();
  const [billing, setBilling] = useState<Billing>("monthly");
  // План, препоръчан от скалиращия слайдер — акцентира съответната карта.
  const [recommended, setRecommended] = useState<PlanId | null>(null);

  const { data, isLoading } = usePlans();
  const plans = data?.plans ?? [];
  const COMPARISON_ROWS = data?.comparison ?? [];

  // Предварително избран план (напр. идване от готов документ: /plans?plan=entrepreneur&from=document).
  const [searchParams] = useSearchParams();
  const preselected = searchParams.get("plan");
  const fromSource = searchParams.get("from");

  useEffect(() => {
    markFunnelStep(4);
    trackPlansView(fromSource ? `plans_page_${fromSource}` : "plans_page");
  }, [fromSource]);

  useEffect(() => {
    if (!preselected || isLoading) return;
    const el = document.getElementById(`plan-${preselected}`);
    if (!el) return;
    const t = window.setTimeout(
      () => el.scrollIntoView({ behavior: "smooth", block: "center" }),
      250,
    );
    return () => window.clearTimeout(t);
  }, [preselected, isLoading]);


  return (
    <>
      <Seo
        title="Планове и цени — Dogovori.net"
        description="Платете според начина, по който работите: една задача от 2,99 € еднократно или абонамент от 12,90 €/мес при използване на включения обем. Екип — 109 €/място/год."
        canonical="https://dogovori.net/plans"
      />
      <Header />

      <main className="relative overflow-hidden bg-background">
        {/* subtle emerald wash */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[55vh] opacity-60"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(var(--brand) / 0.18), transparent 70%)",
          }}
        />

        <section className="relative z-10 mx-auto max-w-6xl px-4 pt-2 pb-3 sm:pt-4 sm:pb-6">
          <CheckoutResumeCard className="mb-4" />
          <SoftCapPanel />
          <AnalysisRecommendationBanner />

          <PlansAuroraHero kicker="Планове и цени" className="mt-3">
            <div className="max-w-3xl">
              <h1 className="font-serif text-4xl font-bold leading-[1.1] text-foreground sm:text-5xl">
                Платете според начина, по който работите
              </h1>
              <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line sm:text-base">
                Еднократно — когато нуждата е един конкретен документ.
                {"\n"}
                Абонамент — когато договорите са редовна работа. ДДС включено. Отказ по всяко време.
              </p>
            </div>



            <div className="mt-6 flex flex-col items-start gap-3">
              <AudienceToggle size="sm" />
            </div>

          </PlansAuroraHero>
        </section>

        {/* Начин на плащане — два ясни режима веднага след херото */}
        <section
          aria-labelledby="purchase-modes-title"
          className="relative z-10 mx-auto max-w-6xl px-4 pb-6 sm:pb-8"
        >
          <h2 id="purchase-modes-title" className="sr-only">
            Как да платите
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-hairline bg-card/60 p-5  sm:p-6">
              <h3 className="mt-1.5 font-serif text-xl text-foreground">Конкретен документ</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Избирате готов резултат и плащате само него.
              </p>
              <OneTaskAlternative className="mt-3" />
              <details className="mt-3 text-[12px] text-muted-foreground">
                <summary className="cursor-pointer list-none font-medium underline decoration-border underline-offset-4">
                  Отделно: пакет от {ENTRY_PACK_CONFIG.ops} действия за{" "}
                  {fmtEur(ENTRY_PACK_CONFIG.eur)}
                </summary>
                <p className="mt-2 leading-relaxed">
                  Това не е един от горните продукти. Пакетът добавя{" "}
                  {ENTRY_PACK_CONFIG.ops} действия по документи към профила Ви, не изтича и не
                  отключва функции от платените планове.
                </p>
                <div className="mt-2.5">
                  <EntryPackCta isAuthed={isAuthed} audience={audience} />
                </div>
              </details>
            </div>

            <div className="flex flex-col rounded-2xl border border-brand/40 bg-brand/[0.04] p-5  sm:p-6">
              <h3 className="mt-1.5 font-serif text-xl text-foreground">Абонамент</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {planVolumeSentence()} Изготвяте, проверявате и споделяте документи, а историята и
                версиите остават при Вас.
              </p>
              <a
                href="#plan-cards"
                onClick={() =>
                  trackEvent("plans_purchase_mode_selected", { mode: "subscription", audience })
                }
                className="mt-4 inline-flex w-fit items-center gap-2 rounded bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Виж абонаментите
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>


          </div>
        </section>

        {/* Сравнение по честота на работа — само с числа от каноничните източници. */}
        <section className="relative z-10 mx-auto max-w-6xl px-4 pb-8 sm:pb-10">
          <FrequencyCompare />
          {/* Слято: „Един документ или редовна работа“ + „Разгледайте плановете спокойно“ (24.11). */}
          <div data-testid="plans-merged-choice" className="mx-auto mt-6 max-w-3xl border-t border-hairline pt-5">
            <h2 className="font-serif text-xl text-foreground sm:text-2xl">Един документ или редовна работа</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Еднократните продукти са за един конкретен документ. Абонаментът е за редовна работа по документи — включените действия и цените са описани по-долу. Разгледайте плановете спокойно: {SUBS_OPEN ? "изберете план или започнете безплатно без карта." : "покупките още не са отворени, а безплатният старт остава достъпен без карта."}
            </p>
            <div className="mt-4"><RoiSavingsBanner /></div>
            <Link to="/catalog" className="link-ink mt-3 inline-flex min-h-11 items-center text-sm font-medium">Разгледайте каталога</Link>
          </div>
        </section>


        {/* 01 — Плановете (цените са първото нещо след избора на начин на плащане) */}
        <PlanStoryStage
          index="01"
          id="plan-cards"
          title="Абонаменти"
          subtitle="Професионалист — за редовна самостоятелна работа по договори. Предприемач — за по-сложен преглед и преговори. Екип — за роли и обща история във фирмата. Качеството на документите е еднакво във всеки план."
          className="pb-12 sm:pb-16"

        >
          <div className="mb-6 flex justify-center sm:mb-8">
            <BillingToggle billing={billing} setBilling={setBilling} />
          </div>

          <div className="grid gap-5 md:grid-cols-3 md:gap-6 xl:gap-7">

            {plans.filter((p) => p.id !== "free").map((plan, idx) => {

              const price = billing === "yearly" ? plan.yearly : plan.monthly;
              const effectivePrice = price ?? plan.yearly;
              const isRecommended = recommended === plan.id;
              const included = (OFFER_FEATURES[plan.id] ?? []).flatMap((pattern) => {
                const match = (plan.features ?? []).find((feature) => pattern.test(feature));
                return match ? [match] : [];
              });
              return (
                <article
                  key={plan.id}
                  id={`plan-${plan.id}`}
                  className={cn(
                    "group relative flex min-w-0 flex-col scroll-mt-28 rounded-md border border-hairline bg-card p-5 sm:p-6",
                    isRecommended && "border-brand ring-2 ring-brand/40",
                    preselected === plan.id && "border-brand ring-2 ring-brand/40",
                  )}
                  style={{ animationDelay: `${idx * 80}ms` }}
                >

                  <div className="min-h-7 text-sm font-medium text-success">
                    {isRecommended && "За избрания от Вас обем"}
                  </div>
                  <h2 className="font-serif text-xl leading-tight text-foreground">{plan.name}</h2>
                  <p className="mt-2 min-h-12 text-sm leading-relaxed text-muted-foreground">{PLAN_HERO_BENEFIT[plan.id]?.title ?? plan.tagline}</p>

                  <div className="mt-5 border-y border-border bg-secondary/40 px-4 py-5">
                    <OfferAmount amount={effectivePrice?.price ?? 0} size="lg"
                      period={plan.id === "team" ? "/ място / година" : billing === "yearly" ? "/ година" : "/ месец"} />
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      {plan.id === "team"
                        ? `Само годишно · минимум ${plan.seat_min ?? PRICING_PLANS.team.seatMin} места · общо ${fmtEur((effectivePrice?.price ?? 0) * (plan.seat_min ?? PRICING_PLANS.team.seatMin ?? 1))} / година`
                        : billing === "yearly" ? `Общо ${fmtEur(effectivePrice?.price ?? 0)} за година` : `Общо ${fmtEur(effectivePrice?.price ?? 0)} на месец`}
                      {" · с включен ДДС"}
                    </p>
                    {billing === "yearly" && plan.id !== "team" && effectivePrice && <p className="mt-2 text-xs text-muted-foreground">Еквивалент на {fmtEur(effectivePrice.price / 12)} / месец; плащате годишно.</p>}
                  </div>
                  <OfferBenefits className="mt-5" items={[
                    ...(plan.ops_cap_monthly ? [`${plan.ops_cap_monthly} действия месечно${plan.id === "team" ? " на място" : ""}`] : []),
                    ...included,
                  ]} />

                  <div className="relative z-10 mt-6 space-y-3">
                    <PlanCategoryAccordion
                      planId={plan.id}
                      groups={categorize(plan.features)}
                      highlightPlan={plan.highlight}
                    />
                  </div>

                  <div className="relative z-10 mt-auto flex flex-col gap-2 pt-7">
{SUBS_OPEN ? (() => { const cta = buildCta(plan.id as PlanId, billing, isAuthed); return (
                    <Link to={cta.href} onClick={() => trackEvent("plans_cta_clicked", { plan: plan.id, billing, authed: isAuthed, audience })}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-gold/40 px-5 text-sm font-semibold text-foreground hover:bg-gold/10">
                      {cta.label}<ArrowRight className="h-4 w-4" />
                    </Link>); })() : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        {
                          trackEvent("plans_cta_clicked", {
                            plan: plan.id,
                            billing,
                            authed: isAuthed,
                            audience,
                          });
                          openPrelaunchWaitlist("subscription", { source: "plans", productId: `subscription_${plan.id}` });
                        }
                      }
                      className="min-h-11 rounded border-gold/40 text-foreground hover:bg-gold/10"
                    >
                      Извести ме при пускане
                    </Button>)}
                  </div>
                </article>
              );
            })}
          </div>



          {/* Slim free plan row */}
          {(() => {
            const free = plans.find((p) => p.id === "free");
            if (!free) return null;
            const cta = buildCta("free", billing, isAuthed);
            return (
              <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-hairline bg-card/60 p-5  sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="flex items-start gap-3 sm:items-center">
                  <div className="hidden">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-serif text-lg leading-tight text-foreground">Безплатен старт</h3>
                    <OfferAmount className="mt-3" amount={PRICING_PLANS.free.monthly ?? 0} size="sm" period="/ месец" />
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      Основни функции за малкия бизнес · {FREE_OFFER_RULE}. Без карта.
                    </p>
                  </div>
                </div>

                <Link
                  to={cta.href}
                  onClick={() => trackEvent("plans_cta_clicked", { plan: "free", billing, authed: isAuthed, audience })}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded border border-brand/40 bg-brand/5 px-5 py-2.5 text-sm font-semibold text-brand transition-all hover:border-brand hover:bg-brand/10"
                >
                  {cta.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            );
          })()}

          <div className="mt-6 sm:mt-8">
            {!SUBS_OPEN && <LaunchPurchaseBanner className="mb-6" feature="subscription" source="plans" productId="subscription_plans" />}
            <TrustGuaranteeBar />
          </div>
        </PlanStoryStage>

        {/* Помощ при избора по обем — след избора на начин на плащане и абонаментите */}
        <section className="relative z-10 mx-auto max-w-7xl px-4 pb-4 sm:pb-6">
          <p className="mb-3 text-center text-sm text-muted-foreground">
            По избор: помощ при избора по обем документи
          </p>
          <PlanScaleSlider
            plans={plans}
            billing={billing}
            isAuthed={isAuthed}
            onRecommend={setRecommended}
          />
        </section>

        {/* 02 — Проблемът */}
        <PlanStoryStage
          index="02"
          title="Какво получавате при всеки документ"
          subtitle="Целта е един ясен, проверен и проследим документ — независимо дали плащате еднократно, или сте на абонамент."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                t: "Ясни реквизити",
                d: "страни, срокове, суми и приложения се попълват стъпка по стъпка, с правна подсказка на всяко поле.",
              },
              {
                t: "Преглед на клаузите",
                d: "проверка за липсващи и рискови клаузи, преди да изпратите документа на другата страна.",
              },
              {
                t: "Една проследима версия",
                d: "финалният текст, подписите и историята на промените остават на едно място.",
              },

            ].map((it) => (
              <div
                key={it.t}
                className="rounded-2xl border border-hairline bg-card/60 p-5 "
              >
                <p className="font-serif text-lg text-foreground">{it.t}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{it.d}</p>
              </div>
            ))}
          </div>
        </PlanStoryStage>

        {/* 03 — Как работи */}
        <PlanStoryStage
          index="03"
          title="Как се разходват действията по документи — стъпка по стъпка"
          subtitle="Един готов документ отнема средно 3 действия. Затова 100 действия в план Предприемач покриват около 30 документа месечно."
        >
          <details data-testid="plans-ops-details" className="group rounded-2xl border border-hairline bg-card/40 p-4 sm:p-5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
            <span>Вижте разхода по стъпки</span>
            <span className="text-xs text-muted-foreground underline underline-offset-4"><span className="group-open:hidden">Покажете</span><span className="hidden group-open:inline">Скрийте</span></span>
          </summary>
          <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: "Избор на образец",
                ops: "0 действия",
                d: `Каталог от ${CATALOG_DOCUMENT_COUNT} образеца по ЗЗД, ТЗ, КТ и ЗУТ. Разглеждането и отварянето на образец е безплатно във всеки план.`,
              },
              {
                n: "Попълване в съветника",
                ops: "0 действия",
                d: "Полетата се въвеждат стъпка по стъпка с правна подсказка на всяко от тях. Данните се пазят локално 7 дни, ако прекъснете.",
              },
              {
                n: "Генериране и изтегляне",
                ops: "1 действие",
                d: "Финалният текст в DOCX или PDF. Повторно изтегляне на същия документ в същата сесия не се таксува отново.",
              },
              {
                n: "AI преглед и подпис",
                ops: "1–2 действия",
                d: "Проверка за рискови и липсващи клаузи (1 действие) и електронен подпис, КЕП или качен подпис с одит-трейл.",
              },
            ].map((s, i) => (
              <li
                key={s.n}
                className="relative rounded-2xl border border-hairline bg-card/60 p-5  transition-colors hover:border-brand/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-brand">
                    Стъпка {i + 1}
                  </span>
                  <span className="shrink-0 rounded border border-hairline bg-background/60 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {s.ops}
                  </span>
                </div>
                <p className="mt-1.5 font-serif text-lg text-foreground">{s.n}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted-foreground">
            Действията се изразходват само при генериране, изтегляне, качване с анализ и всяко
            съобщение до AI асистента. Вълна авто-корекции = 1 действие на всеки 5 корекции.
          </p>
          </details>
        </PlanStoryStage>



        <section className="relative z-10 mx-auto max-w-7xl px-4 pb-12 sm:pb-16">
          {/* Top-up пакети */}
          <section id="topup" className="scroll-mt-24 rounded-2xl border border-hairline bg-card/70 p-5  sm:p-6">

            <div className="mx-auto max-w-3xl text-center">
              <h2 className="font-serif text-2xl text-foreground sm:text-3xl">
                Допълнителни пакети — добави действия към плана си
              </h2>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                Еднократно зареждане без подновяване. Налично само за активни абонати.
                Цените са с ДДС.
              </p>
            </div>
            <div className="mx-auto mt-8 max-w-5xl">
              <TopupPacks enabled={isAuthed} />
            </div>
          </section>


          <ExpandableCard
            className="mt-10 rounded-2xl border border-hairline bg-card/70 p-5  sm:mt-14 sm:p-6"
            triggerLabel="Виж пълно сравнение ↓"
            triggerLabelOpen="Скрий сравнението ↑"
            triggerClassName="!text-xs"
            expandedContent={
              <div className="mx-auto max-w-4xl overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-hairline">
                      <th className="py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Възможност
                      </th>
                      <th className="py-3 px-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Безплатен
                      </th>
                      <th className="py-3 px-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Професионалист
                      </th>
                      <th className="py-3 px-3 text-center text-xs font-semibold uppercase tracking-wider text-brand">
                        Предприемач
                      </th>
                      <th className="py-3 px-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Екип
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON_ROWS.map((row, idx) => (
                      <tr key={`${row.label}-${idx}`} className="border-b border-hairline/60">
                        <td className="py-3 pr-4 text-foreground/90 whitespace-pre-line">{row.label}</td>
                        <Cell value={row.free_value} />
                        <Cell value={row.professional_value} />
                        <Cell value={row.entrepreneur_value} highlight />
                        <Cell value={row.team_value} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          >
            <div>
              <h3 className="font-serif text-lg text-foreground">Пълно сравнение на плановете</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Виж в детайли какво включва всеки план — действия по документи, езици, поддръжка и още.
              </p>
            </div>
          </ExpandableCard>
        </section>

        <section className="relative z-10 mx-auto max-w-5xl px-4 pb-12 sm:pb-16">
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-hairline bg-card/60 p-5  sm:grid-cols-4 sm:p-6">
            {[
              { icon: ShieldCheck, label: "Условия и поверителност" },
              { icon: ShieldCheck, label: "ЗЗД, ТЗ, ЗУТ, eIDAS, ЗЕДЕУУ" },
              { icon: ShieldCheck, label: "ДДС фактура" },
              { icon: ShieldCheck, label: "SSL & криптиране" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-foreground/80">
                <Icon className="h-4 w-4 text-brand" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>



        {/* FAQ moved to the very bottom */}
        <section className="relative z-10 mx-auto max-w-3xl px-4 py-16 sm:py-24">
          <h2 className="text-center font-serif text-2xl text-foreground sm:text-3xl">
            Често задавани въпроси
          </h2>
          <Accordion type="single" collapsible className="mt-8 space-y-2">
            {FAQ.map((item, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="rounded-xl border border-hairline bg-card/70 px-4 "
              >
                <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      </main>


      <Footer />
    </>
  );
}

function Cell({ value, highlight }: { value: string; highlight?: boolean }) {
  const isNo = value === "—" || value === "Не";
  return (
    <td
      className={cn(
        "px-3 py-3 text-center text-sm",
        highlight ? "bg-brand/5 font-medium text-foreground" : "text-foreground/85",
      )}
    >
      {isNo ? (
        <X className="mx-auto h-4 w-4 text-muted-foreground/60" />
      ) : value === "Да" ? (
        <Check className="mx-auto h-4 w-4 text-success" />
      ) : (
        value
      )}
    </td>
  );
}

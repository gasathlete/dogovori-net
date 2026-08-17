import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, X, ArrowRight, Sparkles, ShieldCheck, Users, Zap, Crown, Loader2 } from "@/icons";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { PlansHeroAnimation } from "@/components/PlansHeroAnimation";
import { ExpandableCard } from "@/components/ui/ExpandableCard";
import { TopupPacks } from "@/components/TopupPacks";
import { PlanCategoryAccordion } from "@/components/plans/PlanCategoryAccordion";
import { PlanHeroBenefit } from "@/components/plans/PlanHeroBenefit";
import { PlansAuroraHero } from "@/components/plans/PlansAuroraHero";
import { PlanScaleSlider } from "@/components/plans/PlanScaleSlider";
import { PlanStoryStage } from "@/components/plans/PlanStoryStage";
import { categorize } from "@/lib/planCategories";
import { AnalysisRecommendationBanner } from "@/components/funnel/AnalysisRecommendationBanner";
import { TrustGuaranteeBar } from "@/components/funnel/TrustGuaranteeBar";
import { SoftCapPanel } from "@/components/paywall/SoftCapPanel";


import { RoiCalculator } from "@/components/funnel/RoiCalculator";
import { RoiSavingsBanner } from "@/components/funnel/RoiSavingsBanner";
import { AudienceToggle } from "@/components/funnel/AudienceToggle";
import { First100Counter } from "@/components/funnel/First100Counter";
import { useAudience } from "@/hooks/useAudience";
import { markFunnelStep } from "@/lib/funnel";
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
import { trackPlansView, trackCheckoutStarted } from "@/lib/metrics";
import { roiSubtitle, type PricingPlanId } from "@/lib/pricing";

const PLAN_ICON: Record<PlanId, React.ComponentType<{ className?: string }>> = {
  free: Sparkles,
  professional: Zap,
  entrepreneur: Crown,
  team: Users,
};

function buildCta(planId: PlanId, billing: Billing, isAuthed: boolean): {
  href: string;
  label: string;
} {
  if (planId === "free") {
    return isAuthed
      ? { href: "/account", label: "Към моя профил" }
      : { href: "/auth?tab=signup", label: "Започни безплатно" };
  }
  if (planId === "team") {
    // Team is yearly-only — always link to team creation.
    const target = `/team`;
    return isAuthed
      ? { href: target, label: "Създай екип" }
      : { href: `/auth?tab=signup&redirect=${encodeURIComponent(target)}&intent=plan_team`, label: "Създай екип" };
  }
  const target = `/account?tab=subscription&plan=${planId}&billing=${billing}&promo=FIRST100`;
  const planLabel = planId === "entrepreneur" ? "Предприемач" : "Професионалист";
  if (isAuthed) {
    return {
      href: target,
      label: `Активирай ${planLabel}`,
    };
  }
  const redirect = encodeURIComponent(target);
  return {
    href: `/auth?tab=signup&redirect=${redirect}&intent=plan_${planId}`,
    label: `Избери ${planLabel}`,
  };
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
        description="Изберете план: Безплатен, Професионалист 12.90 €/мес, Предприемач 19.90 €/мес или Екип само годишно 109 €/място/год за фирми."
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
          <SoftCapPanel />
          <AnalysisRecommendationBanner />

          <PlansAuroraHero kicker="Планове и цени" className="mt-3">
            <div className="relative mx-auto max-w-3xl text-center">
              <h1 className="font-serif text-4xl leading-[1.1] tracking-tight text-foreground sm:text-5xl md:text-6xl">
                Изберете плана,
                <br />
                <span className="bg-gradient-to-r from-brand-dark via-brand to-brand-light bg-clip-text text-transparent">
                  който работи за вас
                </span>
              </h1>
              <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line sm:text-base">
                2 месеца БЕЗПЛАТНО на годишен абонамент.
                {"\n"}
                Без обвързване. ДДС включено в цената. Отказ по всяко време.
              </p>
            </div>

            <div className="mt-5 flex flex-col items-center gap-2 text-center">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground sm:tracking-[0.18em]">
                Промокод <span className="font-semibold text-brand">FIRST100</span> · −20% за нови клиенти
              </p>
              <First100Counter />
            </div>


            <div className="mt-6 flex flex-col items-center gap-3 sm:mt-8">
              <AudienceToggle size="sm" />
              <div
                role="tablist"
                aria-label="Период на фактуриране"
                className="relative inline-flex items-center rounded-full border border-hairline bg-card/80 p-1 backdrop-blur-md shadow-soft"
              >
                <button
                  role="tab"
                  aria-selected={billing === "monthly"}
                  onClick={() => setBilling("monthly")}
                  className={cn(
                    "relative z-10 rounded-full px-5 py-2 text-sm font-medium transition-all duration-300 sm:px-6",
                    billing === "monthly"
                      ? "bg-gradient-brand text-white shadow-brand"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Месечно
                </button>
                <button
                  role="tab"
                  aria-selected={billing === "yearly"}
                  onClick={() => setBilling("yearly")}
                  className={cn(
                    "relative z-10 inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-all duration-300 sm:px-6",
                    billing === "yearly"
                      ? "bg-gradient-brand text-white shadow-brand"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Годишно
                  <span className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                    billing === "yearly" ? "bg-white/15 text-white" : "bg-brand/15 text-brand",
                  )}>
                    −17%
                  </span>
                </button>
              </div>
            </div>
          </PlansAuroraHero>
        </section>

        {/* Скалиращ слайдер — препоръка според обема */}
        <section className="relative z-10 mx-auto max-w-7xl px-4 pb-4 sm:pb-6">
          <PlanScaleSlider
            plans={plans}
            billing={billing}
            isAuthed={isAuthed}
            onRecommend={setRecommended}
          />
        </section>


        {/* 03 — Плановете */}
        <PlanStoryStage
          index="03"
          id="plan-cards"
          title="Плановете"
          subtitle="Едни и същи документи и качество във всеки план — различава се само обемът и дълбочината на AI поддръжката."
          className="pb-12 sm:pb-16"
        >
          <div className="grid gap-5 md:grid-cols-3 md:gap-6 xl:gap-7">
            {plans.filter((p) => p.id !== "free").map((plan, idx) => {

              const Icon = PLAN_ICON[plan.id];
              const price = billing === "yearly" ? plan.yearly : plan.monthly;
              const effectivePrice = price ?? plan.yearly;
              const teamMonthlyDisabled = plan.id === "team" && billing === "monthly";
              const cta = buildCta(plan.id, billing, isAuthed);
              const isRecommended = recommended === plan.id;
              return (
                <article
                  key={plan.id}
                  id={`plan-${plan.id}`}
                  className={cn(
                    "group relative flex flex-col scroll-mt-28 overflow-hidden rounded-3xl border bg-card/85 p-6 backdrop-blur-md transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_28px_60px_-30px_hsl(var(--brand)/0.45)] sm:p-7",
                    plan.highlight
                      ? "border-brand/50 shadow-brand ring-1 ring-brand/20"
                      : "border-hairline hover:border-brand/30",
                    isRecommended && "border-brand ring-2 ring-brand/40",
                    preselected === plan.id && "border-brand ring-2 ring-brand/40",
                  )}
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  {/* Sheen при hover — клипва се в собствен слой, за да не реже бейджовете */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
                  >
                    <span className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:motion-safe:animate-[sheen_1.6s_ease-out]" />
                  </span>

                  {/* Един ред бейджове — без наслагване върху рамката */}
                  {(plan.highlight || isRecommended) && (
                    <div className="relative z-10 mb-4 flex flex-wrap items-center gap-2">
                      {plan.highlight && (
                        <span className="inline-flex rounded-full bg-gradient-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow-brand">
                          {plan.id === "entrepreneur" ? copy.planBadge : plan.badge}
                        </span>
                      )}
                      {isRecommended && (
                        <span className="inline-flex rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
                          За вашия обем
                        </span>
                      )}
                    </div>
                  )}

                  <div className="relative z-10 flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                        plan.highlight
                          ? "bg-gradient-brand text-white shadow-brand"
                          : "bg-brand/10 text-brand",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-serif text-xl leading-tight text-foreground">{plan.name}</h2>
                      <p className="truncate text-xs text-muted-foreground">{plan.tagline}</p>
                    </div>
                  </div>


                  <div className="relative z-10 mt-6">
                    {effectivePrice && effectivePrice.price > 0 ? (
                      <>
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-serif text-[44px] font-semibold leading-none text-foreground sm:text-5xl">
                            {effectivePrice.price.toFixed(2).replace(/\.00$/, "")}
                          </span>
                          <span className="text-sm text-muted-foreground">{effectivePrice.suffix}</span>
                        </div>
                        {teamMonthlyDisabled && (
                          <p className="mt-1.5 text-xs font-medium text-brand">Само годишно</p>
                        )}
                        {effectivePrice.note && (
                          <p className="mt-1.5 text-xs text-muted-foreground">{effectivePrice.note}</p>
                        )}
                        {roiSubtitle(plan.id as PricingPlanId) && (
                          <p className="mt-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            {roiSubtitle(plan.id as PricingPlanId)}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="font-serif text-[44px] font-semibold leading-none text-foreground sm:text-5xl">
                          0
                        </span>
                        <span className="text-sm text-muted-foreground">€ — завинаги</span>
                      </div>
                    )}
                  </div>

                  {plan.highlight && effectivePrice && effectivePrice.price > 0 && (
                    <div className="relative z-10 mt-3 space-y-1 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-left">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        {copy.priceFrame}
                      </p>
                      <p className="text-[12px] leading-snug text-muted-foreground">
                        {copy.valueLine}
                      </p>
                    </div>
                  )}

                  <div className="relative z-10 mt-6 space-y-3">
                    <PlanHeroBenefit planId={plan.id} highlight={plan.highlight} />
                    <PlanCategoryAccordion
                      planId={plan.id}
                      groups={categorize(plan.features)}
                      highlightPlan={plan.highlight}
                    />
                  </div>

                  <div className="relative z-10 mt-auto flex flex-col gap-2 pt-7">
                    <Link
                      to={cta.href}
                      onClick={() =>
                        {
                          trackEvent("plans_cta_clicked", {
                            plan: plan.id,
                            billing,
                            authed: isAuthed,
                            audience,
                          });
                          if (plan.id !== "free") trackCheckoutStarted(plan.id, billing, "plans_card");
                        }
                      }
                      className={cn(
                        "group/btn inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-all duration-300",
                        plan.highlight
                          ? "bg-gradient-brand text-white shadow-brand hover:shadow-[0_20px_50px_-15px_hsl(var(--brand)/0.6)]"
                          : "border border-brand/40 bg-brand/5 text-brand hover:border-brand hover:bg-brand/10",
                      )}
                    >
                      {cta.label}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
                    </Link>
                    {!isAuthed && plan.id !== "free" && (
                      <p className="text-center text-[11px] text-muted-foreground">
                        Безплатна регистрация · плащане само ако продължиш
                      </p>
                    )}
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
              <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-hairline bg-card/60 p-5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="flex items-start gap-3 sm:items-center">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-serif text-lg leading-tight text-foreground">
                      {free.name} · <span className="text-brand">0 €</span>
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      Основни функции за малкия бизнес · 5 операции при регистрация + 2 всеки месец,
                      без карта.
                    </p>
                  </div>
                </div>

                <Link
                  to={cta.href}
                  onClick={() => trackEvent("plans_cta_clicked", { plan: "free", billing, authed: isAuthed, audience })}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-brand/40 bg-brand/5 px-5 py-2.5 text-sm font-semibold text-brand transition-all hover:border-brand hover:bg-brand/10"
                >
                  {cta.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            );
          })()}

          <div className="mt-6 sm:mt-8">
            <TrustGuaranteeBar />
          </div>
        </PlanStoryStage>

        {/* 02 — Проблемът */}
        <PlanStoryStage
          index="02"
          title="Един пропуснат текст в договора струва повече от годишен абонамент"
          subtitle="Липсваща клауза за неустойка, грешни реквизити или неподписано приложение — всяко от тях се плаща по-скъпо от целия ви план."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                t: "90 € и 3 дни",
                d: "средно за изготвяне на един стандартен договор при външен юрист.",
              },
              {
                t: "Липсващи реквизити",
                d: "най-честата причина документ да не бъде признат пред институция или банка.",
              },
              {
                t: "Хартия и подписи",
                d: "срещи, сканиране и разминаващи се версии вместо един проследим документ.",
              },
            ].map((it) => (
              <div
                key={it.t}
                className="rounded-2xl border border-hairline bg-card/60 p-5 backdrop-blur-md"
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
          title="Как се разходват операциите — стъпка по стъпка"
          subtitle="Един готов документ отнема средно 3 операции. Точно затова 100 операции в план Предприемач покриват около 30 документа месечно."
        >
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: "Избор на образец",
                ops: "0 операции",
                d: "Каталог от 600+ образеца по ЗЗД, ТЗ, КТ и ЗУТ. Разглеждането и отварянето на образец е безплатно във всеки план.",
              },
              {
                n: "Попълване в съветника",
                ops: "0 операции",
                d: "Полетата се въвеждат стъпка по стъпка с правна подсказка на всяко от тях. Данните се пазят локално 7 дни, ако прекъснете.",
              },
              {
                n: "Генериране и изтегляне",
                ops: "1 операция",
                d: "Финалният текст в DOCX или PDF. Повторно изтегляне на същия документ в същата сесия не се таксува отново.",
              },
              {
                n: "AI преглед и подпис",
                ops: "1–2 операции",
                d: "Проверка за рискови и липсващи клаузи (1 операция) и електронен подпис, КЕП или качен подпис с одит-трейл.",
              },
            ].map((s, i) => (
              <li
                key={s.n}
                className="relative rounded-2xl border border-hairline bg-card/60 p-5 backdrop-blur-md transition-colors hover:border-brand/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
                    Стъпка {i + 1}
                  </span>
                  <span className="shrink-0 rounded-full border border-hairline bg-background/60 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {s.ops}
                  </span>
                </div>
                <p className="mt-1.5 font-serif text-lg text-foreground">{s.n}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted-foreground">
            Операциите се изразходват само при генериране, изтегляне, качване с анализ и всяко
            съобщение до AI асистента. Вълна авто-корекции = 1 операция на всеки 5 корекции.
          </p>
        </PlanStoryStage>


        {/* 04 — Възвръщаемостта */}
        <PlanStoryStage
          index="04"
          title="Възвръщаемостта — черно на бяло"
          subtitle="Изчислете колко ви струва текущият начин на работа и след колко документа планът се изплаща."
        >
          <div className="rounded-2xl border border-hairline bg-card/60 p-5 backdrop-blur-md sm:p-6">
            <div className="mx-auto max-w-3xl">
              <RoiSavingsBanner className="mb-5" />
              <RoiCalculator />
            </div>
          </div>
        </PlanStoryStage>

        <section className="relative z-10 mx-auto max-w-7xl px-4 pb-12 sm:pb-16">
          {/* Top-up пакети */}
          <section className="rounded-2xl border border-hairline bg-card/70 p-5 backdrop-blur-md sm:p-6">

            <div className="mx-auto max-w-3xl text-center">
              <h2 className="font-serif text-2xl text-foreground sm:text-3xl">
                Top-up пакети — добави операции към плана си
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
            className="mt-10 rounded-2xl border border-hairline bg-card/70 p-5 backdrop-blur-md sm:mt-14 sm:p-6"
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
                Виж в детайли какво включва всеки план — операции, AI, езици, поддръжка и още.
              </p>
            </div>
          </ExpandableCard>
        </section>

        <section className="relative z-10 mx-auto max-w-5xl px-4 pb-12 sm:pb-16">
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-hairline bg-card/60 p-5 backdrop-blur-md sm:grid-cols-4 sm:p-6">
            {[
              { icon: ShieldCheck, label: "GDPR съвместим" },
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


        <section className="relative z-10 mx-auto max-w-4xl px-4 pb-20">
          <div className="relative overflow-hidden rounded-3xl border border-brand/40 bg-gradient-to-br from-brand-dark via-brand-dark to-foreground/5 p-8 text-center sm:p-12">
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              aria-hidden
              style={{
                background:
                  "radial-gradient(ellipse 60% 80% at 50% 0%, hsl(var(--brand) / 0.45), transparent 70%)",
              }}
            />
            <div className="relative z-10">
              <h2 className="font-serif text-2xl text-white sm:text-3xl">
                {isAuthed ? "Активирай Предприемач сега" : "Регистрирай се за 30 секунди"}
              </h2>
              <p className="mt-2 text-sm text-white/80 sm:text-base">
                {isAuthed
                  ? "Получи 100 операции/мес, GPT-5 модел, неограничен AI и премиум поддръжка 24/7."
                  : "Безплатен старт: 5 операции + 2 всеки месец. Без карта."}
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  to={
                    isAuthed
                      ? "/account?tab=subscription&plan=entrepreneur&billing=monthly&promo=FIRST100"
                      : "/auth?tab=signup&redirect=%2Fplans"
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-brand-dark shadow-brand transition-all hover:shadow-[0_20px_50px_-15px_hsl(var(--brand)/0.7)]"
                >
                  {isAuthed ? "Активирай Предприемач" : "Регистрирай се безплатно"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/catalog"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm font-medium text-white/90 transition-all hover:border-white/60 hover:bg-white/5"
                >
                  Разгледай каталога
                </Link>
              </div>
            </div>
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
                className="rounded-xl border border-hairline bg-card/70 px-4 backdrop-blur-md"
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
        <Check className={cn("mx-auto h-4 w-4", highlight ? "text-brand" : "text-brand/80")} />
      ) : (
        value
      )}
    </td>
  );
}

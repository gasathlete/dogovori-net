import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, ArrowRight, Sparkles, ShieldCheck, Users, Zap, Crown, Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { PlansHeroAnimation } from "@/components/PlansHeroAnimation";
import { ExpandableCard } from "@/components/ui/ExpandableCard";
import { TopupPacks } from "@/components/TopupPacks";
import { PlanCategoryAccordion } from "@/components/plans/PlanCategoryAccordion";
import { PlanHeroBenefit } from "@/components/plans/PlanHeroBenefit";
import { categorize } from "@/lib/planCategories";
import { useMemo } from "react";

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
      : { href: `/auth?tab=signup&redirect=${encodeURIComponent(target)}&intent=plan_team`, label: "Регистрирай се за Екип" };
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
    label: `Регистрирай се за ${planLabel}`,
  };
}

export default function Plans() {
  const { user } = useAuth();
  const isAuthed = Boolean(user);
  const [billing, setBilling] = useState<Billing>("monthly");

  const { data, isLoading } = usePlans();
  const plans = data?.plans ?? [];
  const COMPARISON_ROWS = data?.comparison ?? [];

  return (
    <>
      <Seo
        title="Планове и цени — Dogovori.net"
        description="Изберете план: Безплатен, Професионалист 12.90 €/мес, Предприемач 19.90 €/мес или Екип само годишно 109 €/място/год за фирми."
        canonical="https://dogovori.net/plans"
      />
      <Header />

      <main className="relative overflow-hidden bg-background">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] gold-sweep-bg opacity-40" aria-hidden />

        <section className="relative z-10 mx-auto max-w-6xl px-4 pt-0 pb-3 sm:pt-0 sm:pb-6">
          <PlansHeroAnimation />
          <div className="relative mx-auto mt-3 max-w-3xl text-center sm:mt-5">
            <h1 className="font-serif text-4xl leading-tight text-foreground sm:text-5xl md:text-6xl">
              Изберете плана,
              <br />
              <span className="bg-gradient-to-r from-gold via-gold/80 to-gold bg-clip-text text-transparent">
                който работи за вас
              </span>
            </h1>
            <p className="mt-2 text-base text-muted-foreground sm:text-lg">
              30% отстъпка на месечен · 40% отстъпка на годишен абонамент — за нови клиенти.
              <br className="hidden sm:block" />
              Без обвързване. ДДС включен. Откажи по всяко време.
            </p>
          </div>

          <div className="mt-5 flex justify-center sm:mt-6">
            <div
              role="tablist"
              aria-label="Период на фактуриране"
              className="relative inline-flex items-center gap-0 rounded-full border border-hairline bg-card/80 p-1 backdrop-blur-md shadow-soft"
            >
              <button
                role="tab"
                aria-selected={billing === "monthly"}
                onClick={() => setBilling("monthly")}
                className={cn(
                  "relative z-10 rounded-full px-6 py-2 text-sm font-medium transition-all duration-300",
                  billing === "monthly"
                    ? "bg-gradient-gold text-navy shadow-gold"
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
                  "relative z-10 inline-flex items-center gap-2 rounded-full px-6 py-2 text-sm font-medium transition-all duration-300",
                  billing === "yearly"
                    ? "bg-gradient-gold text-navy shadow-gold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Годишно
                <span className={cn(
                  "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                  billing === "yearly" ? "bg-navy text-gold shadow-sm" : "bg-success/15 text-success",
                )}>
                  Спести 17%
                </span>

              </button>
            </div>
          </div>

        </section>

        <section className="relative z-10 mx-auto max-w-7xl px-4 pb-12 sm:pb-16">
          <div className="grid gap-6 md:grid-cols-3 xl:gap-7">
            {plans.filter((p) => p.id !== "free").map((plan, idx) => {

              const Icon = PLAN_ICON[plan.id];
              const price = billing === "yearly" ? plan.yearly : plan.monthly;
              // Team has no monthly — fall back to yearly with a "годишно" note.
              const effectivePrice = price ?? plan.yearly;
              const teamMonthlyDisabled = plan.id === "team" && billing === "monthly";
              const cta = buildCta(plan.id, billing, isAuthed);
              return (
                <article
                  key={plan.id}
                  className={cn(
                    "group relative flex flex-col rounded-3xl border bg-card/85 p-6 backdrop-blur-md transition-all duration-500 hover:-translate-y-1 sm:p-7",
                    plan.highlight
                      ? "border-gold/50 shadow-[0_30px_80px_-40px_hsl(var(--gold)/0.5)] lg:scale-[1.02]"
                      : "border-hairline hover:border-gold/30",
                  )}
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  {plan.highlight && (
                    <>
                      <div className="border-beam absolute inset-0 rounded-3xl" aria-hidden />
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-gold px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-navy shadow-gold">
                        {plan.badge}
                      </span>
                    </>
                  )}

                  <div className="relative z-10 flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl",
                        plan.highlight ? "bg-gradient-gold text-navy" : "bg-foreground/5 text-gold",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-serif text-xl text-foreground">{plan.name}</h2>
                      <p className="text-xs text-muted-foreground">{plan.tagline}</p>
                    </div>
                  </div>

                  <div className="relative z-10 mt-6">
                    {effectivePrice && effectivePrice.price > 0 ? (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="font-serif text-4xl font-semibold text-foreground sm:text-5xl">
                            {effectivePrice.price.toFixed(2).replace(/\.00$/, "")}
                          </span>
                          <span className="text-sm text-muted-foreground">{effectivePrice.suffix}</span>
                        </div>
                        {teamMonthlyDisabled && (
                          <p className="mt-1 text-xs font-medium text-gold">Само годишно</p>
                        )}
                        {effectivePrice.note && (
                          <p className="mt-1 text-xs text-muted-foreground">{effectivePrice.note}</p>
                        )}
                      </>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="font-serif text-4xl font-semibold text-foreground sm:text-5xl">
                          0
                        </span>
                        <span className="text-sm text-muted-foreground">€ — завинаги</span>
                      </div>
                    )}
                  </div>

                  <ul className="relative z-10 mt-6 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-foreground/90">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                        <span className="whitespace-pre-line">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="relative z-10 mt-7 flex flex-col gap-2">
                    <Link
                      to={cta.href}
                      onClick={() =>
                        trackEvent("plans_cta_clicked", {
                          plan: plan.id,
                          billing,
                          authed: isAuthed,
                        })
                      }
                      className={cn(
                        "group/btn inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-all duration-300",
                        plan.highlight
                          ? "bg-gradient-gold text-navy shadow-gold hover:shadow-[0_20px_50px_-15px_hsl(var(--gold)/0.6)]"
                          : "border border-gold/40 bg-gold/5 text-gold hover:border-gold hover:bg-gold/10",
                      )}
                    >
                      {cta.label}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
                    </Link>
                    {!isAuthed && plan.id !== "free" && (
                      <p className="text-center text-[11px] text-muted-foreground">
                        Първо регистрация — после плащане
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
              <div className="mt-6 flex flex-col items-center justify-between gap-4 rounded-2xl border border-hairline bg-card/60 p-5 backdrop-blur-md sm:flex-row sm:p-6">
                <div className="flex items-start gap-3 sm:items-center">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-gold">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-serif text-lg text-foreground">
                      {free.name} · <span className="text-gold">0 €</span> завинаги
                    </h3>
                    <p className="text-xs text-muted-foreground sm:text-sm">
                      {free.tagline} · 5 операции при регистрация + 2 всеки месец, без карта.
                    </p>
                  </div>
                </div>
                <Link
                  to={cta.href}
                  onClick={() => trackEvent("plans_cta_clicked", { plan: "free", billing, authed: isAuthed })}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-gold/40 bg-gold/5 px-5 py-2.5 text-sm font-semibold text-gold transition-all hover:border-gold hover:bg-gold/10"
                >
                  {cta.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            );
          })()}



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
                      <th className="py-3 px-3 text-center text-xs font-semibold uppercase tracking-wider text-gold">
                        Предприемач
                      </th>
                      <th className="py-3 px-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Екип
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON_ROWS.map((row) => (
                      <tr key={row.label} className="border-b border-hairline/60">
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
              { icon: ShieldCheck, label: "ЗЗД, ТЗ,  ЗУТ, GDPR, EIDAS, ЗЕДЕУУ " },
              { icon: ShieldCheck, label: "ДДС фактура" },
              { icon: ShieldCheck, label: "SSL & криптиране" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-foreground/80">
                <Icon className="h-4 w-4 text-gold" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="relative z-10 mx-auto max-w-3xl px-4 pb-16 sm:pb-24">
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

        <section className="relative z-10 mx-auto max-w-4xl px-4 pb-20">
          <div className="relative overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-br from-navy via-navy to-foreground/5 p-8 text-center sm:p-12">
            <div className="pointer-events-none absolute inset-0 gold-sweep-bg opacity-50" aria-hidden />
            <div className="relative z-10">
              <h2 className="font-serif text-2xl text-white sm:text-3xl">
                {isAuthed ? "Активирай Предприемач сега" : "Регистрирай се за 30 секунди"}
              </h2>
              <p className="mt-2 text-sm text-white/80 sm:text-base">
                {isAuthed
                  ? "Получи 120 операции/мес, GPT-5 модел, неограничен AI и премиум поддръжка 24/7."
                  : "Безплатен старт: 5 операции + 2 всеки месец. Без карта."}
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  to={
                    isAuthed
                      ? "/account?tab=subscription&plan=entrepreneur&billing=monthly&promo=FIRST100"
                      : "/auth?tab=signup&redirect=%2Fplans"
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-gold px-7 py-3 text-sm font-semibold text-navy shadow-gold transition-all hover:shadow-[0_20px_50px_-15px_hsl(var(--gold)/0.6)]"
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

        <section className="border-t border-border/60 bg-card/30 py-16">
          <div className="container mx-auto px-4">
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
          </div>
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
        highlight ? "bg-gold/5 font-medium text-foreground" : "text-foreground/85",
      )}
    >
      {isNo ? (
        <X className="mx-auto h-4 w-4 text-muted-foreground/60" />
      ) : value === "Да" ? (
        <Check className={cn("mx-auto h-4 w-4", highlight ? "text-gold" : "text-gold/80")} />
      ) : (
        value
      )}
    </td>
  );
}

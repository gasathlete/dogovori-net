import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, ArrowRight, Sparkles, ShieldCheck, Users, Zap } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { PlansHeroAnimation } from "@/components/PlansHeroAnimation";
import { ExpandableCard } from "@/components/ui/ExpandableCard";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { PLANS, COMPARISON_ROWS, FAQ, type Billing, type PlanId } from "@/lib/plansData";
import { trackEvent } from "@/lib/analytics";

const PLAN_ICON: Record<PlanId, React.ComponentType<{ className?: string }>> = {
  free: Sparkles,
  pro: Zap,
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
  const target = `/account?tab=subscription&plan=${planId}&billing=${billing}&promo=FIRST100`;
  if (isAuthed) {
    return {
      href: target,
      label: planId === "pro" ? "Активирай Предприемач" : "Създай екип",
    };
  }
  const redirect = encodeURIComponent(target);
  return {
    href: `/auth?tab=signup&redirect=${redirect}&intent=plan_${planId}`,
    label: planId === "pro" ? "Регистрирай се за Предприемач" : "Регистрирай се за Екип",
  };
}

export default function Plans() {
  const { user } = useAuth();
  const isAuthed = Boolean(user);
  const [billing, setBilling] = useState<Billing>("monthly");

  const plans = useMemo(() => PLANS, []);

  return (
    <>
      <Seo
        title="Планове и цени — Dogovori.net"
        description="Изберете плана, който работи за вас: Безплатен за първи стъпки, Предприемач 12.90 €/мес за самонаети и малък бизнес, Екип 10.90 €/seat/мес за фирми. ДДС включен. Откажи по всяко време."
        canonical="https://dogovori.net/plans"
      />
      <Header />

      <main className="relative overflow-hidden bg-background">
        {/* Ambient gold sweep */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] gold-sweep-bg opacity-40" aria-hidden />

        {/* Hero */}
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

          {/* Billing toggle */}
          <div className="mt-5 flex justify-center sm:mt-6">
            <div
              role="tablist"
              aria-label="Период на фактуриране"
              className="inline-flex items-center gap-1 rounded-full border border-hairline bg-card/80 p-1 backdrop-blur-md"
            >
              <button
                role="tab"
                aria-selected={billing === "monthly"}
                onClick={() => setBilling("monthly")}
                className={cn(
                  "rounded-full px-5 py-2 text-sm font-medium transition-all",
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
                  "relative rounded-full px-5 py-2 text-sm font-medium transition-all",
                  billing === "yearly"
                    ? "bg-gradient-gold text-navy shadow-gold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Годишно
                <span className="ml-2 inline-flex rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                  −17%
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* Plan cards */}
        <section className="relative z-10 mx-auto max-w-6xl px-4 pb-12 sm:pb-16">
          <div className="grid gap-5 md:grid-cols-3">
            {plans.map((plan, idx) => {
              const Icon = PLAN_ICON[plan.id];
              const price = billing === "yearly" ? plan.yearly : plan.monthly;
              const cta = buildCta(plan.id, billing, isAuthed);
              return (
                <article
                  key={plan.id}
                  className={cn(
                    "group relative flex flex-col rounded-3xl border bg-card/85 p-6 backdrop-blur-md transition-all duration-500 hover:-translate-y-1 sm:p-7",
                    plan.highlight
                      ? "border-gold/50 shadow-[0_30px_80px_-40px_hsl(var(--gold)/0.5)] md:scale-[1.02]"
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
                    {price && price.price > 0 ? (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="font-serif text-4xl font-semibold text-foreground sm:text-5xl">
                            {price.price.toFixed(2).replace(/\.00$/, "")}
                          </span>
                          <span className="text-sm text-muted-foreground">{price.suffix}</span>
                        </div>
                        {price.note && (
                          <p className="mt-1 text-xs text-muted-foreground">{price.note}</p>
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

          {/* Comparison table — collapsible */}
          <ExpandableCard
            className="mt-10 rounded-2xl border border-hairline bg-card/70 p-5 backdrop-blur-md sm:mt-14 sm:p-6"
            triggerLabel="Виж пълно сравнение ↓"
            triggerLabelOpen="Скрий сравнението ↑"
            triggerClassName="!text-xs"
            expandedContent={
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-hairline">
                      <th className="py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Възможност
                      </th>
                      <th className="py-3 px-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Безплатен
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
                        <Cell value={row.free} />
                        <Cell value={row.pro} highlight />
                        <Cell value={row.team} />
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

        {/* Trust strip */}
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

        {/* FAQ */}
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

        {/* Final CTA */}
        <section className="relative z-10 mx-auto max-w-4xl px-4 pb-20">
          <div className="relative overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-br from-navy via-navy to-foreground/5 p-8 text-center sm:p-12">
            <div className="pointer-events-none absolute inset-0 gold-sweep-bg opacity-50" aria-hidden />
            <div className="relative z-10">
              <h2 className="font-serif text-2xl text-background sm:text-3xl">
                {isAuthed ? "Активирай Предприемач сега" : "Регистрирай се за 30 секунди"}
              </h2>
              <p className="mt-2 text-sm text-background/80 sm:text-base">
                {isAuthed
                  ? "Получи 100 операции/мес, неограничен AI и пълни двуезични договори."
                  : "Безплатен старт: 5 операции + 2 всеки месец. Без карта."}
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  to={
                    isAuthed
                      ? "/account?tab=subscription&plan=pro&billing=monthly&promo=FIRST100"
                      : "/auth?tab=signup&redirect=%2Fplans"
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-gold px-7 py-3 text-sm font-semibold text-navy shadow-gold transition-all hover:shadow-[0_20px_50px_-15px_hsl(var(--gold)/0.6)]"
                >
                  {isAuthed ? "Активирай Предприемач" : "Регистрирай се безплатно"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/catalog"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-background/30 px-6 py-3 text-sm font-medium text-background/90 transition-all hover:border-background/60 hover:bg-background/5"
                >
                  Разгледай каталога
                </Link>
              </div>
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

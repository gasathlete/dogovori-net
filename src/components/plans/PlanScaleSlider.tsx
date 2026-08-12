/**
 * PlanScaleSlider — интерактивен „скалиращ" слайдер.
 *
 * Потребителят задава колко документа му трябват на месец, а компонентът
 * препоръчва план от реалните данни в базата (`usePlans`), показва цена на
 * документ, месечна икономия срещу юрист и води директно към CTA.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sliders, Sparkles, Zap, Crown, Users } from "@/icons";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { trackCheckoutStarted } from "@/lib/metrics";
import type { Billing, PlanId, PlanView } from "@/hooks/usePlans";
import { usePlanRecommendation, LAWYER_DOC_COST_EUR } from "@/hooks/usePlanRecommendation";

const PLAN_ICON: Record<PlanId, React.ComponentType<{ className?: string }>> = {
  free: Sparkles,
  professional: Zap,
  entrepreneur: Crown,
  team: Users,
};

const MAX_DOCS = 40;

function eur(value: number, decimals = 2) {
  return `${value.toFixed(decimals).replace(/\.00$/, "")} €`;
}

interface Props {
  plans: PlanView[];
  billing: Billing;
  isAuthed: boolean;
  onRecommend?: (planId: PlanId) => void;
}

export function PlanScaleSlider({ plans, billing, isAuthed, onRecommend }: Props) {
  const [docs, setDocs] = useState(6);
  const rec = usePlanRecommendation(plans, docs, billing);
  const Icon = PLAN_ICON[rec.planId];
  const trackTimer = useRef<number | null>(null);

  useEffect(() => {
    onRecommend?.(rec.planId);
  }, [rec.planId, onRecommend]);

  const cta = useMemo(() => {
    if (rec.planId === "free") {
      return isAuthed
        ? { href: "/account", label: "Към моя профил" }
        : { href: "/auth?tab=signup", label: "Започни безплатно" };
    }
    if (rec.planId === "team") {
      return isAuthed
        ? { href: "/team", label: "Създай екип" }
        : {
            href: "/auth?tab=signup&redirect=%2Fteam&intent=plan_team",
            label: "Регистрирай се за Екип",
          };
    }
    const target = `/account?tab=subscription&plan=${rec.planId}&billing=${billing}&promo=FIRST100`;
    return isAuthed
      ? { href: target, label: `Активирай ${rec.plan?.name ?? ""}`.trim() }
      : {
          href: `/auth?tab=signup&redirect=${encodeURIComponent(target)}&intent=plan_${rec.planId}`,
          label: `Регистрирай се за ${rec.plan?.name ?? ""}`.trim(),
        };
  }, [rec.planId, rec.plan, billing, isAuthed]);

  const handleChange = (value: number[]) => {
    const next = value[0] ?? 1;
    setDocs(next);
    if (trackTimer.current) window.clearTimeout(trackTimer.current);
    trackTimer.current = window.setTimeout(() => {
      trackEvent("plans_slider_moved", {
        docs: next,
        recommended_plan: recommendedIdRef.current,
        billing,
      });
    }, 600);
  };

  // Пазим последната препоръка за debounce-натото събитие.
  const recommendedIdRef = useRef<PlanId>(rec.planId);
  recommendedIdRef.current = rec.planId;

  useEffect(() => {
    return () => {
      if (trackTimer.current) window.clearTimeout(trackTimer.current);
    };
  }, []);

  const label =
    docs >= MAX_DOCS ? `${MAX_DOCS}+ документа` : `${docs} ${docs === 1 ? "документ" : "документа"}`;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-hairline bg-card/70 p-5 backdrop-blur-md sm:p-7">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse 60% 70% at 15% 0%, hsl(var(--brand) / 0.12), transparent 70%)",
        }}
      />
      <div className="relative z-10 grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-8">
        {/* Слайдер */}
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Sliders className="h-4 w-4" />
            </span>
            <h3 className="font-serif text-lg text-foreground sm:text-xl">
              Колко документа ви трябват месечно?
            </h3>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Плъзнете и вижте кой план е точно за вас — препоръката се изчислява от реалните
            лимити на плановете.
          </p>

          <div className="mt-6 flex items-baseline gap-2">
            <span className="font-serif text-4xl font-semibold leading-none text-foreground tabular-nums sm:text-5xl">
              {docs >= MAX_DOCS ? `${MAX_DOCS}+` : docs}
            </span>
            <span className="text-sm text-muted-foreground">документа / месец</span>
          </div>

          <div className="mt-5">
            <Slider
              value={[docs]}
              min={1}
              max={MAX_DOCS}
              step={1}
              onValueChange={handleChange}
              aria-label="Брой документи на месец"
              aria-valuetext={label}
              className="[&_[role=slider]]:h-6 [&_[role=slider]]:w-6 [&_[role=slider]]:border-brand [&_[role=slider]]:shadow-brand [&_[role=slider]]:transition-transform [&_[role=slider]]:hover:scale-110 [&>span>span]:bg-gradient-brand"
            />
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>1</span>
              <span>10</span>
              <span>20</span>
              <span>30</span>
              <span>{MAX_DOCS}+</span>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-hairline bg-background/50 px-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Цена / документ
              </dt>
              <dd className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                {rec.planId === "free" ? "0 €" : eur(rec.perDocEur)}
              </dd>
            </div>
            <div className="rounded-xl border border-hairline bg-background/50 px-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Включени операции
              </dt>
              <dd className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                {rec.opsCap ?? "—"}
              </dd>
            </div>
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Спестявате / мес.
              </dt>
              <dd className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                {eur(rec.savedEur, 0)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Изчислено при {eur(LAWYER_DOC_COST_EUR, 0)} средно за изготвяне на един документ от
            юрист. ДДС включено.
          </p>
        </div>

        {/* Препоръка */}
        <div className="relative flex flex-col rounded-2xl border border-brand/45 bg-gradient-to-br from-brand/12 via-brand/[0.05] to-transparent p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
            Препоръчан план
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-brand">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p
                key={rec.planId}
                className="font-serif text-xl text-foreground animate-[planFadeUp_320ms_ease-out]"
              >
                {rec.plan?.name ?? "—"}
              </p>
              <p className="truncate text-xs text-muted-foreground">{rec.plan?.tagline}</p>
            </div>
          </div>

          <div className="mt-5 flex items-baseline gap-1.5">
            <span className="font-serif text-[40px] font-semibold leading-none text-foreground tabular-nums">
              {rec.monthlyEquivalent === 0
                ? "0"
                : rec.monthlyEquivalent.toFixed(2).replace(/\.00$/, "")}
            </span>
            <span className="text-sm text-muted-foreground">€ / мес.</span>
          </div>
          {billing === "yearly" && rec.planId !== "free" && (
            <p className="mt-1.5 text-xs text-brand">При годишно плащане — 2 месеца безплатно</p>
          )}
          {rec.needsTopup && (
            <p className="mt-3 rounded-lg border border-hairline bg-background/50 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
              При този обем добавете и Top-up пакет операции — или се насочете към план Екип.
            </p>
          )}

          <Link
            to={cta.href}
            onClick={() => {
              trackEvent("plans_cta_clicked", {
                plan: rec.planId,
                billing,
                authed: isAuthed,
                source: "slider",
              });
              if (rec.planId !== "free") trackCheckoutStarted(rec.planId, billing, "plans_slider");
            }}
            className={cn(
              "group/btn mt-auto inline-flex items-center justify-center gap-2 rounded-full bg-gradient-brand px-5 py-3 text-sm font-semibold text-white shadow-brand transition-all duration-300 hover:shadow-[0_20px_50px_-15px_hsl(var(--brand)/0.6)]",
              "mt-6",
            )}
          >
            {cta.label}
            <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
          </Link>
          <a
            href="#plan-cards"
            className="mt-2 text-center text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Виж всички планове
          </a>
        </div>
      </div>
    </div>
  );
}

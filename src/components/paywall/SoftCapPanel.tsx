/**
 * SoftCapPanel — Стълб 5 в конверсионната фуния. Не-блокиращ пълноширок
 * панел, който се показва когато free потребител достигне месечния лимит
 * (opsUsed >= opsCap). Прозрачен тон: показва останалите дни до нов бонус,
 * плюс 3 варианта за upgrade.
 */
import { Link } from "react-router-dom";
import { Crown, Sparkles, Info, ArrowRight, Clock } from "@/icons";
import { Button } from "@/components/ui/button";
import { useIsPro } from "@/hooks/useIsPro";
import { PRICING_PLANS, fmtEur, opsLabel } from "@/lib/pricing";
import { trackEvent } from "@/lib/analytics";
import { useEffect, useMemo } from "react";

function daysUntilReset(signupAt: string | null): number {
  if (!signupAt) return 30;
  const now = Date.now();
  const start = new Date(signupAt).getTime();
  const elapsedDays = Math.floor((now - start) / (24 * 60 * 60 * 1000));
  const daysInCycle = 30;
  const remainderCycle = elapsedDays % daysInCycle;
  return Math.max(1, daysInCycle - remainderCycle);
}

export function SoftCapPanel() {
  const { isPro, loading, freeQuota } = useIsPro();
  const atCap = freeQuota.opsUsed >= freeQuota.opsCap;
  const daysLeft = useMemo(() => daysUntilReset(freeQuota.signupAt), [freeQuota.signupAt]);

  useEffect(() => {
    if (!loading && !isPro && atCap) {
      trackEvent("free_cap_hit", {
        opsUsed: freeQuota.opsUsed,
        opsCap: freeQuota.opsCap,
      });
    }
  }, [loading, isPro, atCap, freeQuota.opsUsed, freeQuota.opsCap]);

  if (loading || isPro || !atCap) return null;

  return (
    <section
      aria-label="Достигна безплатния си месечен лимит"
      className="rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/10 via-card/80 to-card/60 p-6 shadow-gold"
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/20">
          <Info className="h-5 w-5 text-gold" />
        </div>
        <div>
          <h2 className="font-serif text-lg font-bold text-foreground">
            Достигна безплатните си {freeQuota.opsCap} операции за месеца
          </h2>
          <p className="text-sm text-muted-foreground">
            Продължи веднага с платен план или изчакай {daysLeft} дни за нови безплатни операции.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border border-border/60 bg-card/70 p-4">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-gold" /> {PRICING_PLANS.professional.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {opsLabel("professional")}/мес. · Двуезични договори · e-Подпис
          </p>
          <div className="mt-2 font-serif text-xl font-bold">{fmtEur(PRICING_PLANS.professional.monthly!)}<span className="text-xs text-muted-foreground"> /мес.</span></div>
          <Button asChild variant="outline" size="sm" className="mt-3 w-full">
            <Link to="/plans" onClick={() => trackEvent("upgrade_started", { plan: "professional", source: "softcap" })}>
              Виж плана <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </article>

        <article className="relative rounded-xl border-2 border-gold/60 bg-gold/5 p-4">
          <span className="absolute -top-2 left-4 rounded-full bg-gradient-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-navy">
            Най-избран
          </span>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Crown className="h-4 w-4 text-gold" /> {PRICING_PLANS.entrepreneur.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {opsLabel("entrepreneur")}/мес. · GPT-5 · Premium 24/7 поддръжка
          </p>
          <div className="mt-2 font-serif text-xl font-bold">{fmtEur(PRICING_PLANS.entrepreneur.monthly!)}<span className="text-xs text-muted-foreground"> /мес.</span></div>
          <Button asChild size="sm" className="mt-3 w-full bg-gradient-gold text-navy hover:shadow-gold">
            <Link to="/plans" onClick={() => trackEvent("upgrade_started", { plan: "entrepreneur", source: "softcap" })}>
              Активирай <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </article>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span>
          Абонатите получават 5–15% отстъпка доживот след 3-ти месец. Отмени по всяко време.
        </span>
      </div>
    </section>
  );
}

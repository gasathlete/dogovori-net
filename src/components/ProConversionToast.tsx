/**
 * useProConversionToast — fires a stage-aware toast after a meaningful action
 * (op consumed, corrections applied, etc.). Escalates copy/CTA with the stage.
 *
 * Usage:
 *   const showProToast = useProConversionToast();
 *   // after op finishes:
 *   showProToast("corrections_applied");
 */
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useFreeJourneyStage } from "@/hooks/useFreeJourneyStage";
import { PRICING_PLANS, fmtEur, monthlyLabel, opsLabel } from "@/lib/pricing";
import { trackEvent } from "@/lib/analytics";
import { ProUpgradeDialog, type ProUpgradeTrigger } from "@/components/ProUpgradeDialog";

export type ToastReason =
  | "op_consumed"
  | "corrections_applied"
  | "download"
  | "analysis_done";

export function useProConversionToast() {
  const { isPro, stage, opsLeft, opsCap } = useFreeJourneyStage();

  return useCallback(
    (reason: ToastReason) => {
      if (isPro || stage === 0) return;

      const cta = "Виж Предприемач";
      let title = "";
      let description = "";
      const trigger: ProUpgradeTrigger =
        stage === 3 ? "ops_exhausted" : reason === "corrections_applied" ? "corrections" : "generic";

      if (stage === 1) {
        title = `Остават ${opsLeft} от ${opsCap} безплатни операции`;
        description = `Продължи с ${PRICING_PLANS.entrepreneur.name}: ${opsLabel("entrepreneur")}/мес., неограничени AI корекции и e-Подпис за ${fmtEur(PRICING_PLANS.entrepreneur.monthly!)}.`;
      } else if (stage === 2) {
        title = "Последна безплатна операция за месеца";
        description = `Със следваща операция изчерпваш лимита. ${PRICING_PLANS.entrepreneur.name} отключва ${PRICING_PLANS.entrepreneur.opsPerMonth} ops + GPT-5 за ${monthlyLabel("entrepreneur")}.`;
      } else {
        title = "Безплатният лимит е изчерпан";
        description = `${PRICING_PLANS.professional.name} ${monthlyLabel("professional")} (${PRICING_PLANS.professional.opsPerMonth} ops) или ${PRICING_PLANS.entrepreneur.name} ${monthlyLabel("entrepreneur")} (${PRICING_PLANS.entrepreneur.opsPerMonth} ops + GPT-5).`;
      }

      trackEvent("tease_shown", { channel: "toast", stage, reason });

      toast(title, {
        description,
        duration: stage === 3 ? 8000 : 5000,
        action: {
          label: cta,
          onClick: () => {
            trackEvent("tease_clicked", { channel: "toast", stage, reason });
            // Lightweight: dispatch a custom event the app-level listener catches.
            window.dispatchEvent(
              new CustomEvent("dogovori:open-pro-dialog", { detail: { trigger } }),
            );
          },
        },
      });
    },
    [isPro, stage, opsLeft, opsCap],
  );
}

/**
 * App-level mount of ProUpgradeDialog that listens for the custom event
 * dispatched by useProConversionToast. Drop once near the app root.
 */
import { useEffect } from "react";
export function GlobalProUpgradeListener() {
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<ProUpgradeTrigger>("generic");

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setTrigger((detail.trigger as ProUpgradeTrigger) || "generic");
      setOpen(true);
    };
    window.addEventListener("dogovori:open-pro-dialog", handler);
    return () => window.removeEventListener("dogovori:open-pro-dialog", handler);
  }, []);

  return <ProUpgradeDialog open={open} onOpenChange={setOpen} trigger={trigger} />;
}

/**
 * „Продължете, откъдето спряхте“ — панел за запазено намерение за плащане.
 *
 * Показва се само когато човек е отворил плащането и го е затворил, без да
 * плати. Панелът не начислява нищо и не дава никакво право: той връща към
 * същия избор и напомня какви безплатни действия има в профила.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw, X } from "@/icons";
import { Button } from "@/components/ui/button";
import { FREE_OFFER_RULE } from "@/lib/pricing";
import { trackMetric } from "@/lib/metrics";
import {
  clearCheckoutIntent,
  intentPlanLabel,
  readCheckoutIntent,
  type CheckoutIntent,
} from "@/lib/checkoutIntent";

interface Props {
  /** Когато е подадено, плащането се отваря на място вместо чрез връзка. */
  onResume?: (priceId: string) => void;
  className?: string;
}

export function CheckoutResumeCard({ onResume, className }: Props) {
  const [intent, setIntent] = useState<CheckoutIntent | null>(null);

  useEffect(() => {
    const saved = readCheckoutIntent();
    if (!saved) return;
    setIntent(saved);
    trackMetric("checkout_resume_shown", { plan: saved.plan, billing: saved.billing });
  }, []);

  if (!intent) return null;

  const dismiss = () => {
    clearCheckoutIntent();
    setIntent(null);
    trackMetric("checkout_resume_dismissed", { plan: intent.plan });
  };

  const resumeHref = `/account?tab=subscription&plan=${encodeURIComponent(intent.plan)}&billing=${encodeURIComponent(
    intent.billing,
  )}`;

  const onClick = () => {
    trackMetric("checkout_resume_click", { plan: intent.plan, billing: intent.billing });
    onResume?.(intent.priceId);
  };

  return (
    <div
      data-testid="checkout-resume"
      className={`relative rounded-xl border border-gold/35 bg-gold/5 p-4 sm:p-5 ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Скрий напомнянето"
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-10">
        <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Продължете, откъдето спряхте</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Избрахте <strong className="text-foreground">{intentPlanLabel(intent)}</strong>, но плащането не е
            завършено. Нищо не е начислено. Дотогава профилът Ви работи с безплатните действия: {FREE_OFFER_RULE}.
          </p>
          <div className="mt-3">
            {onResume ? (
              <Button type="button" onClick={onClick} className="gap-2">
                Довършете плащането
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button asChild className="gap-2">
                <Link to={resumeHref} onClick={onClick}>
                  Довършете плащането
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CheckoutResumeCard;

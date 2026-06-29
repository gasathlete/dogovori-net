import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useFunnelCta } from "@/hooks/useFunnelCta";
import { trackFunnelEvent, type FunnelStep } from "@/lib/funnel";

interface Props {
  step: FunnelStep;
  className?: string;
  /** Override label (e.g. „Виж всички рискове") while keeping smart routing */
  overrideLabel?: string;
  size?: "md" | "lg";
}

/**
 * Single CTA component used across all 4 funnel steps. Reads the right
 * label + destination from useFunnelCta() so we never duplicate the matrix.
 */
export function PrimaryCTA({ step, className, overrideLabel, size = "lg" }: Props) {
  const cta = useFunnelCta(step);
  const label = overrideLabel ?? cta.label;

  const onClick = () => {
    trackFunnelEvent("funnel_cta_click", { step, label, href: cta.href });
  };

  const base =
    "group inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all will-change-transform";
  const sizing =
    size === "lg"
      ? "px-8 py-4 text-[16px] sm:text-[17px] sm:px-10"
      : "px-5 py-3 text-[14px]";

  const styles =
    cta.variant === "primary"
      ? "btn-gold btn-sheen btn-press shadow-gold"
      : "border border-gold/50 bg-card/60 text-gold hover:bg-gold/10";

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <Link to={cta.href} onClick={onClick} className={cn(base, sizing, styles)}>
        {label}
        <ArrowRight className="h-[16px] w-[16px] transition-transform group-hover:translate-x-1" />
      </Link>
      {cta.subLabel ? (
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {cta.subLabel}
        </span>
      ) : null}
    </div>
  );
}

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanId } from "@/hooks/usePlans";
import { PLAN_HERO_BENEFIT } from "@/lib/planCategories";

interface Props {
  planId: PlanId;
  highlight?: boolean;
  className?: string;
}

export function PlanHeroBenefit({ planId, highlight, className }: Props) {
  const b = PLAN_HERO_BENEFIT[planId];
  if (!b) return null;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border px-4 py-3",
        highlight
          ? "border-gold/40 bg-gradient-to-br from-gold/10 via-gold/5 to-transparent"
          : "border-hairline bg-foreground/[0.03]",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Sparkles
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            highlight ? "text-gold" : "text-gold/70",
          )}
        />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold/80">
            Акцент
          </p>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">
            {b.title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
            {b.subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}

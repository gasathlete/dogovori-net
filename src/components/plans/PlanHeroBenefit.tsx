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
          ? "border-brand/45 bg-gradient-to-br from-brand/12 via-brand/5 to-transparent"
          : "border-hairline bg-brand/[0.04]",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
            highlight ? "bg-gradient-brand text-white" : "bg-brand/12 text-brand",
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
            АКЦЕНТ&nbsp;
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

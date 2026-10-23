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
        "border-l-2 pl-4 py-2",
        highlight
          ? "border-gold"
          : "border-border",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0">
          <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">
            {b.title}
          </p>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
            {b.subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}

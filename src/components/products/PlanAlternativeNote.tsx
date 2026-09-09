/**
 * Тиха, фактическа връзка от еднократен продукт към плановете.
 * Без модал, без брояч, без задраскана цена, без натиск.
 * Числата идват само от каноничния PRICING_PLANS.
 */
import { Link } from "react-router-dom";
import { ArrowRight } from "@/icons";
import { PRICING_PLANS, monthlyLabel, opsLabel } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export const PLAN_ALTERNATIVE_QUESTION = "Работите с документи редовно?";
export const PLAN_ALTERNATIVE_LINK_LABEL = "Сравнете плановете";

/** Изречение за плана — всички числа идват от PRICING_PLANS чрез helper-ите. */
export function planVolumeSentence(): string {
  const plan = PRICING_PLANS.professional;
  return `${plan.name} — ${monthlyLabel("professional")} за ${opsLabel(
    "professional",
  )} при използване на включения обем.`;
}

export function PlanAlternativeNote({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Алтернатива с абонамент"
      className={cn(
        "rounded-xl border border-border/70 bg-muted/25 px-4 py-3 text-left",
        className,
      )}
    >
      <p className="text-[13px] font-semibold text-foreground">
        {PLAN_ALTERNATIVE_QUESTION}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {planVolumeSentence()} Еднократният продукт остава отделно плащане.
      </p>
      <Link
        to="/plans"
        className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold text-foreground/90 underline decoration-border underline-offset-4 hover:text-gold"
      >
        {PLAN_ALTERNATIVE_LINK_LABEL}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </aside>
  );
}

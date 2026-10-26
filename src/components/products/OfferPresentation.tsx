import { Check } from "@/icons";
import { fmtEur } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export type OfferSize = "sm" | "md" | "lg";

const AMOUNT_SIZE: Record<OfferSize, string> = {
  sm: "text-2xl",
  md: "text-3xl sm:text-4xl",
  lg: "text-4xl sm:text-5xl",
};

/** Shared visual hierarchy only: callers retain canonical values and actions. */
export function OfferAmount({ amount, period, size = "md", className }: {
  amount: number;
  period?: string;
  size?: OfferSize;
  className?: string;
}) {
  return (
    <span className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-1 font-sans", className)}>
      <span className={cn("font-bold leading-none tabular-nums text-success", AMOUNT_SIZE[size])}>
        {fmtEur(amount).replace(/ €$/, "")}
      </span>
      {" "}<span className="text-lg font-semibold text-success">€</span>
      {period && <span className="text-sm font-medium text-muted-foreground">{period}</span>}
    </span>
  );
}

export function OfferBenefits({ items, className }: { items: readonly string[]; className?: string }) {
  return (
    <span className={cn("grid gap-2.5", className)}>
      {items.map((item) => (
        <span key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-foreground">
          <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-success" />
          <span className="min-w-0">{item}</span>
        </span>
      ))}
    </span>
  );
}
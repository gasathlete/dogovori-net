/**
 * Компактен указател на стъпките при купуване: документ → контекст → плащане.
 *
 * Само показва къде сте. Не създава заявки, не отваря плащане и не съдържа
 * контроли, които изглеждат активни, преди стъпката да е достъпна.
 */
import { Check } from "@/icons";
import { cn } from "@/lib/utils";

export interface CheckoutStep {
  readonly id: string;
  readonly label: string;
}

export function CheckoutStepper({
  steps,
  activeId,
  doneIds,
  className,
}: {
  steps: readonly CheckoutStep[];
  activeId: string;
  doneIds: readonly string[];
  className?: string;
}) {
  const activeIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === activeId),
  );

  return (
    <ol
      data-testid="checkout-stepper"
      aria-label="Стъпки при купуване"
      className={cn("flex flex-wrap items-center gap-x-2 gap-y-2", className)}
    >
      {steps.map((step, i) => {
        const done = doneIds.includes(step.id);
        const active = step.id === activeId;
        return (
          <li key={step.id} className="flex items-center gap-2">
            <span
              data-testid={`checkout-step-${step.id}`}
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold",
                active
                  ? "border-gold/50 bg-gold/10 text-foreground"
                  : "border-border/70 text-muted-foreground",
              )}
            >
              <span className="inline-flex size-4 items-center justify-center">
                {done ? (
                  <Check className="size-3.5 text-gold" aria-hidden="true" />
                ) : (
                  <span className="text-[11px] tabular-nums">{i + 1}</span>
                )}
              </span>
              {step.label}
              {done && <span className="sr-only">— готово</span>}
            </span>
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "h-px w-3 sm:w-5",
                  i < activeIndex ? "bg-gold/50" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

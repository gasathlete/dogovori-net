/**
 * WorkStepStrip — компактен ред със стъпките на текущата задача.
 *
 * Показва къде сте сега и какво следва, с една линия за напредък. Не заменя
 * логиката на екрана — само показва състоянието, което вече е налично.
 */
import { Check } from "@/icons";
import { cn } from "@/lib/utils";

export type WorkStep = { id: string; label: string };

export function WorkStepStrip({
  steps,
  current,
  className,
  testId = "work-step-strip",
}: {
  steps: WorkStep[];
  /** Индекс на текущата стъпка (0-базиран). */
  current: number;
  className?: string;
  testId?: string;
}) {
  const safe = Math.min(Math.max(0, current), steps.length - 1);
  const pct = Math.round(((safe + 1) / steps.length) * 100);

  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-xl border border-border/60 bg-card/40 px-4 py-3",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3 text-[11px] uppercase tracking-[0.18em]">
        <span className="text-muted-foreground">
          Стъпка {safe + 1} от {steps.length}
        </span>
        <span className="truncate font-semibold text-gold">{steps[safe].label}</span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Напредък по задачата"
      >
        <div className="h-full rounded-full bg-gradient-gold" style={{ width: `${pct}%` }} />
      </div>
      <ol className="mt-2 hidden gap-1.5 sm:flex" role="list">
        {steps.map((s, i) => {
          const done = i < safe;
          const currentStep = i === safe;
          return (
            <li
              key={s.id}
              aria-current={currentStep ? "step" : undefined}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em]",
                currentStep
                  ? "bg-gold/15 text-gold"
                  : done
                    ? "text-foreground/70"
                    : "text-muted-foreground/60",
              )}
            >
              {done && <Check className="size-3 shrink-0 text-success" aria-hidden="true" />}
              <span className="truncate">
                {i + 1}. {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

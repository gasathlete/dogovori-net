/**
 * Малка обща лента с трите стъпки. Съобщава ритъма на работата, без да обещава
 * измерено време — никакви минути/секунди.
 */
const STEPS = [
  { n: "1", label: "Избирате" },
  { n: "2", label: "Качвате" },
  { n: "3", label: "Получавате" },
] as const;

export function StepsStrip() {
  return (
    <ol
      data-testid="steps-strip"
      aria-label="Как работи"
      className="mx-auto flex max-w-md items-center justify-center gap-2 text-[12px] font-semibold text-muted-foreground sm:gap-4 sm:text-[13px]"
    >
      {STEPS.map((s, i) => (
        <li key={s.n} className="flex items-center gap-2 sm:gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 text-[11px] font-bold tabular-nums text-foreground/70">
              {s.n}
            </span>
            <span className="whitespace-nowrap">{s.label}</span>
          </span>
          {i < STEPS.length - 1 && (
            <span aria-hidden="true" className="h-px w-3 bg-border sm:w-6" />
          )}
        </li>
      ))}
    </ol>
  );
}

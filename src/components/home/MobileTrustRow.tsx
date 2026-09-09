/**
 * Един спокоен ред доверие вместо стена от карти/лога.
 * Без заявки към бекенда и без марки — само леки константи.
 */
import { TEMPLATES_COUNT, SECTORS_COUNT } from "@/data/catalogCounts";

export function MobileTrustRow() {
  const facts = [
    { value: "Българска", label: "платформа" },
    ...(TEMPLATES_COUNT > 0
      ? [{ value: String(TEMPLATES_COUNT), label: "шаблона" }]
      : []),
    ...(SECTORS_COUNT > 0
      ? [{ value: String(SECTORS_COUNT), label: "сектора" }]
      : []),
  ];

  return (
    <section aria-label="Доверие" data-testid="mobile-trust-row" className="border-b border-border/40">
      <dl className="container grid grid-cols-3 divide-x divide-border/50 py-3">
        {facts.map((f) => (
          <div key={f.label} className="flex flex-col items-center gap-0.5 px-2 text-center">
            <dt className="sr-only">{f.label}</dt>
            <dd className="font-serif text-[15px] tabular-nums text-foreground">{f.value}</dd>
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {f.label}
            </span>
          </div>
        ))}
      </dl>
    </section>
  );
}

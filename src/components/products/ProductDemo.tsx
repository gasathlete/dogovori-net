/**
 * Код-нативни мини демонстрации за продуктовите карти.
 *
 * Никакви изображения, видео или външни библиотеки — само DOM + CSS. Всяко
 * демо остава смислено и без анимация: при `prefers-reduced-motion: reduce`
 * се показва финалното състояние без цикъл.
 */
import { useEffect, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { ProductDemoKind } from "@/lib/products";

const DEMO_LABELS: Record<ProductDemoKind, string> = {
  scan: "Демонстрация: маркирани рискови клаузи в договор",
  diff: "Демонстрация: сравнение преди и след с приета поправка",
  map: "Демонстрация: карта на нужните договори според дейността",
};

/** Цикличен брояч на стъпките; спира на последната стъпка при reduced motion. */
function useDemoStep(steps: number, reduced: boolean, intervalMs = 1500) {
  const [step, setStep] = useState(reduced ? steps - 1 : 0);

  useEffect(() => {
    if (reduced) {
      setStep(steps - 1);
      return;
    }
    const id = window.setInterval(
      () => setStep((s) => (s + 1) % steps),
      intervalMs,
    );
    return () => window.clearInterval(id);
  }, [reduced, steps, intervalMs]);

  return step;
}

const SHELL =
  "relative overflow-hidden rounded-lg border border-gold/20 bg-gradient-to-br from-navy/[0.06] to-transparent p-3";

function Trail({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-full"
    >
      <span className="absolute inset-y-0 -left-1/3 w-1/3 animate-[goldSweep_2.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-gold/12 to-transparent" />
    </span>
  );
}

const SCAN_LINES = [
  { text: "Неустойка 0,5% на ден без горна граница", risk: true },
  { text: "Срок за плащане: 60 дни от фактура", risk: true },
  { text: "Прекратяване: 30 дни предизвестие", risk: false },
  { text: "Липсва клауза за забава на доставката", risk: true },
] as const;

function ScanDemo({ reduced }: { reduced: boolean }) {
  const step = useDemoStep(SCAN_LINES.length, reduced, 900);
  return (
    <div className={SHELL}>
      <Trail active={!reduced} />
      <ul className="relative space-y-1.5">
        {SCAN_LINES.map((line, i) => {
          const shown = reduced || i <= step;
          return (
            <li
              key={line.text}
              className={
                "flex items-start gap-2 rounded-md px-2 py-1 text-[11px] leading-snug transition-all duration-500 " +
                (shown ? "opacity-100" : "opacity-30") +
                (shown && line.risk
                  ? " bg-gold/[0.12] text-foreground ring-1 ring-gold/30"
                  : " text-muted-foreground")
              }
            >
              <span
                className={
                  "mt-1 h-1.5 w-1.5 shrink-0 rounded-full " +
                  (line.risk ? "bg-gold" : "bg-emerald-500/70")
                }
              />
              <span>{line.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DiffDemo({ reduced }: { reduced: boolean }) {
  const step = useDemoStep(3, reduced, 1600);
  const accepted = reduced || step === 2;
  return (
    <div className={SHELL}>
      <Trail active={!reduced} />
      <div className="relative space-y-1.5 text-[11px] leading-snug">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Преди
        </p>
        <p className="rounded-md bg-destructive/[0.08] px-2 py-1 text-muted-foreground line-through">
          Неустойка 0,5% на ден.
        </p>
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-gold">
          След
        </p>
        <p
          className={
            "rounded-md px-2 py-1 transition-all duration-500 " +
            (step >= 1 || reduced
              ? "bg-gold/[0.12] text-foreground ring-1 ring-gold/30"
              : "opacity-30")
          }
        >
          Неустойка 0,2% на ден, общо не повече от 10% от стойността.
        </p>
        <p
          className={
            "flex items-center gap-1.5 pt-0.5 text-[10px] font-semibold transition-opacity duration-500 " +
            (accepted ? "text-emerald-500 opacity-100" : "opacity-25")
          }
        >
          <span aria-hidden="true">✓</span> Поправката е приета
        </p>
      </div>
    </div>
  );
}

const MAP_BRANCHES = [
  {
    label: "Моят бизнес",
    items: ["Рамков договор с клиент", "Договор с подизпълнител", "NDA"],
  },
  {
    label: "Работя за клиенти",
    items: ["Договор за услуги", "Приемо-предавателен протокол", "NDA"],
  },
] as const;

function MapDemo({ reduced }: { reduced: boolean }) {
  const step = useDemoStep(MAP_BRANCHES.length, reduced, 2200);
  const active = reduced ? 0 : step;
  return (
    <div className={SHELL}>
      <Trail active={!reduced} />
      <div className="relative grid grid-cols-2 gap-2">
        {MAP_BRANCHES.map((branch, i) => {
          const on = reduced || i === active;
          return (
            <div
              key={branch.label}
              className={
                "rounded-md border px-2 py-1.5 transition-all duration-500 " +
                (on
                  ? "border-gold/40 bg-gold/[0.1]"
                  : "border-border/60 bg-card/40 opacity-50")
              }
            >
              <p className="text-[10px] font-semibold text-foreground">
                {branch.label}
              </p>
              <ul className="mt-1 space-y-0.5">
                {branch.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-1 text-[10px] leading-snug text-muted-foreground"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gold/70"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProductDemo({ kind }: { kind: ProductDemoKind }) {
  const reduced = useReducedMotion();
  return (
    <div
      role="img"
      aria-label={DEMO_LABELS[kind]}
      data-demo={kind}
      data-motion={reduced ? "reduced" : "animated"}
    >
      {kind === "scan" && <ScanDemo reduced={reduced} />}
      {kind === "diff" && <DiffDemo reduced={reduced} />}
      {kind === "map" && <MapDemo reduced={reduced} />}
    </div>
  );
}

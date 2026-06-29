import { useMemo, useState } from "react";
import { Calculator, TrendingUp, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * ROI Calculator — CRO-focused funnel widget.
 *
 * Лесна сметка: брой документи/месец × средна адвокатска такса
 * vs. абонамент Предприемач (12.90 €/мес).
 *
 * Източник за adv. такса: ~145 € средно за изготвяне на типов
 * договор в България (Висш адвокатски съвет, минимални
 * адвокатски възнаграждения, 2024). Консервативна стойност по
 * default — потребителят я регулира.
 */

const LAWYER_AVG_EUR = 145;
const PLAN_EUR = 12.9;

export function RoiCalculator({ className = "" }: { className?: string }) {
  const [docs, setDocs] = useState(4);
  const [fee, setFee] = useState(LAWYER_AVG_EUR);

  const { lawyerCost, savings, savingsPct, yearly } = useMemo(() => {
    const lc = docs * fee;
    const s = Math.max(0, lc - PLAN_EUR);
    const pct = lc > 0 ? Math.round((s / lc) * 100) : 0;
    return {
      lawyerCost: lc,
      savings: s,
      savingsPct: pct,
      yearly: s * 12,
    };
  }, [docs, fee]);

  const fmt = (n: number) =>
    n.toLocaleString("bg-BG", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    });

  return (
    <section
      className={`relative overflow-hidden rounded-3xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.04] via-background to-background p-6 sm:p-8 ${className}`}
      aria-labelledby="roi-calc-title"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl"
      />

      <header className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
          <Calculator className="h-5 w-5" />
        </span>
        <div>
          <h3
            id="roi-calc-title"
            className="font-serif text-xl tracking-tight text-foreground sm:text-2xl"
          >
            Колко спестяваш с DogovaryAI?
          </h3>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Премести плъзгачите спрямо твоята практика.
          </p>
        </div>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <label className="block">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium text-foreground">
              Документи на месец
            </span>
            <span className="font-mono text-base font-semibold text-foreground">
              {docs}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={30}
            value={docs}
            onChange={(e) => setDocs(Number(e.target.value))}
            className="w-full accent-emerald-500"
            aria-label="Брой документи на месец"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>1</span>
            <span>30+</span>
          </div>
        </label>

        <label className="block">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium text-foreground">
              Средна адвокатска такса
            </span>
            <span className="font-mono text-base font-semibold text-foreground">
              {fmt(fee)}
            </span>
          </div>
          <input
            type="range"
            min={50}
            max={500}
            step={5}
            value={fee}
            onChange={(e) => setFee(Number(e.target.value))}
            className="w-full accent-emerald-500"
            aria-label="Средна адвокатска такса в евро"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>50 €</span>
            <span>500 €</span>
          </div>
        </label>
      </div>

      <div className="mt-6 grid gap-3 rounded-2xl border border-border/60 bg-card/70 p-4 sm:grid-cols-3 sm:p-5">
        <Stat
          label="Адвокат / месец"
          value={fmt(lawyerCost)}
          tone="muted"
          strike
        />
        <Stat
          label="DogovaryAI / месец"
          value={fmt(PLAN_EUR)}
          tone="muted"
        />
        <Stat
          label={`Спестяваш / месец · ${savingsPct}%`}
          value={fmt(savings)}
          tone="emerald"
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-2xl bg-emerald-500/[0.08] p-4 sm:flex-row sm:items-center">
        <p className="text-sm text-foreground sm:text-base">
          <Sparkles className="mr-1 inline h-4 w-4 text-emerald-500" />
          На година това са{" "}
          <strong className="font-semibold text-emerald-600 dark:text-emerald-400">
            {fmt(yearly)}
          </strong>{" "}
          по-малко разходи.
        </p>
        <Link
          to="/auth?mode=signup"
          onClick={() => {
            try {
              (window as any).plausible?.("funnel_cta_click", {
                props: {
                  step: 4,
                  label: "ROI калкулатор",
                  href: "/auth?mode=signup",
                  yearly: Math.round(yearly),
                },
              });
            } catch {}
          }}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
        >
          Започни безплатно
        </Link>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        * Базата от ~145 €/документ е консервативна оценка по минималните
        адвокатски възнаграждения за изготвяне на типов договор. Реалните
        такси често са значително по-високи.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  strike,
  icon,
}: {
  label: string;
  value: string;
  tone: "muted" | "emerald";
  strike?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      <span
        className={[
          "font-serif text-2xl tracking-tight",
          tone === "emerald"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-foreground",
          strike ? "line-through opacity-70" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

export default RoiCalculator;

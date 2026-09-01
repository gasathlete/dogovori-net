import { useMemo, useState } from "react";
import * as Icons from "@/icons";
import { ExternalLink } from "@/icons";
import type { Calculator, CalcResult, Field } from "@/data/calculators/types";

interface Props {
  calculator: Calculator;
}

export function CalculatorShell({ calculator }: Props) {
  const initial = useMemo(() => {
    const out: Record<string, any> = {};
    for (const f of calculator.fields) {
      if (f.type === "number") out[f.key] = f.default ?? 0;
      else if (f.type === "date") out[f.key] = f.default ?? new Date().toISOString().slice(0, 10);
      else out[f.key] = f.default ?? f.options[0]?.value ?? "";
    }
    return out;
  }, [calculator]);

  const [values, setValues] = useState<Record<string, any>>(initial);

  const result: CalcResult = useMemo(() => {
    try {
      return calculator.compute(values);
    } catch {
      return { main: { label: "—", value: "—" }, breakdown: [] };
    }
  }, [calculator, values]);

  const Icon = (Icons as any)[calculator.icon] ?? Icons.Calculator;

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-5 lg:pb-0">
      {/* Мобилен резултат — винаги видим, без скролване */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/30 bg-card/95 px-4 py-3 shadow-elegant backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[11px] text-muted-foreground">{result.main.label}</div>
            <div className="font-serif text-xl font-bold text-gold">{result.main.value}</div>
          </div>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            className="shrink-0 rounded-full border border-gold/40 px-3 py-1.5 text-xs font-semibold text-gold active:scale-[0.98]"
          >
            {showDetails ? "Скрий разбивката" : "Разбивка"}
          </button>
        </div>
        {showDetails && (
          <dl className="mt-3 max-h-[40vh] space-y-2 overflow-y-auto border-t border-border/40 pt-3 text-sm">
            {result.breakdown.map((b, i) => (
              <div key={i} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{b.label}</dt>
                <dd className="text-right font-medium text-foreground">{b.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* Inputs */}
      <div className="lg:col-span-3 rounded-2xl border border-border/60 bg-card/50 p-4 md:p-8">

        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/5 text-gold">
            <Icon className="h-5 w-5" strokeWidth={1.6} />
          </div>
          <div>
            <h2 className="font-serif text-lg font-bold text-foreground md:text-xl">
              Въведи данни
            </h2>
            <p className="text-xs text-muted-foreground">
              Резултатът се обновява автоматично.
            </p>
          </div>
        </div>

        <div className="grid gap-5">
          {calculator.fields.map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={values[f.key]}
              onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
            />
          ))}
        </div>
      </div>

      {/* Result */}
      <div className="lg:col-span-2">
        <div className="sticky top-20 rounded-2xl border border-gold/30 bg-gradient-card p-6 shadow-elegant md:p-7">
          <div className="eyebrow mb-3">Резултат</div>
          <div className="mb-1 text-xs text-muted-foreground">{result.main.label}</div>
          <div className="mb-6 font-serif text-3xl font-bold text-gold md:text-4xl">
            {result.main.value}
          </div>

          <dl className="space-y-2.5 border-t border-border/40 pt-4 text-sm">
            {result.breakdown.map((b, i) => (
              <div key={i} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{b.label}</dt>
                <dd className="text-right font-medium text-foreground">{b.value}</dd>
              </div>
            ))}
          </dl>

          {result.notes && result.notes.length > 0 && (
            <ul className="mt-5 space-y-1.5 border-t border-border/40 pt-4 text-xs leading-relaxed text-muted-foreground">
              {result.notes.map((n, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold/60" />
                  {n}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 border-t border-border/40 pt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gold/70">
              Правно основание
            </div>
            <ul className="space-y-1.5 text-xs">
              {calculator.legalBasis.map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-foreground/80 transition-colors hover:text-gold"
                  >
                    {l.label}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
}) {
  const baseInput =
    "w-full rounded-md border border-border/70 bg-background/60 px-3 py-2.5 text-sm text-foreground transition-colors focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20";
  return (
    <div>
      <label htmlFor={field.key} className="mb-1.5 block text-xs font-medium text-foreground/85">
        {field.label}
        {"unit" in field && field.unit && (
          <span className="ml-1.5 text-muted-foreground">({field.unit})</span>
        )}
      </label>
      {field.type === "number" && (
        <input
          id={field.key}
          type="number"
          inputMode="decimal"
          min={field.min}
          max={field.max}
          step={field.step ?? 0.01}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className={baseInput}
        />
      )}
      {field.type === "date" && (
        <input
          id={field.key}
          type="date"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        />
      )}
      {field.type === "select" && (
        <select
          id={field.key}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {field.help && (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{field.help}</p>
      )}
    </div>
  );
}

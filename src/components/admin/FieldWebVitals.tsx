import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CORE_METRICS, type CoreMetric } from "@/lib/webVitals/dimensions";
import {
  formatMetricValue,
  summarizeMetric,
  windowStartDay,
  type DailyRow,
  type P75Band,
} from "@/lib/webVitals/fieldAggregation";

const bandLabel: Record<P75Band, string> = {
  good: "Good",
  "needs-improvement": "Needs improvement",
  poor: "Poor",
  unknown: "—",
};

const bandColor: Record<P75Band, string> = {
  good: "text-emerald-500",
  "needs-improvement": "text-amber-500",
  poor: "text-red-500",
  unknown: "text-muted-foreground",
};

const pct = (rate: number | null): string => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

/**
 * Полеви Core Web Vitals от `web_vitals_daily` — само агрегати от посетители
 * със съгласие за аналитика. Ако миграцията още не е приложена, заявката
 * връща грешка и секцията показва съобщение, без да чупи страницата.
 */
export function FieldWebVitals() {
  const [days, setDays] = useState<7 | 30>(7);
  const [rows, setRows] = useState<DailyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    (async () => {
      try {
        const { data, error } = await webVitalsClient
          .from("web_vitals_daily")
          .select("metric,rating,device_class,sample_count,value_sum")
          .gte("day", windowStartDay(days));
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setRows([]);
          return;
        }
        setRows(data ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Неуспешно зареждане");
          setRows([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Field Core Web Vitals</h2>
          <p className="text-xs text-muted-foreground">
            Реални посетители, дали съгласие за аналитика. Само агрегати — без лични
            идентификатори, без URL адреси.
          </p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Период">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`rounded-md border px-3 py-1 text-xs ${
                days === d ? "border-gold bg-muted font-medium" : "border-border hover:bg-muted"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Прозорец: днес + предходните {days - 1} дни (UTC), от {windowStartDay(days)}.
      </p>

      {rows === null ? (
        <p className="mt-3 text-sm text-muted-foreground">Зареждане…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Няма достъп до полевите данни (възможно е таблицата още да не е създадена).
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Още няма събрани полеви измервания за този период.</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {CORE_METRICS.map((m: CoreMetric) => {
            const s = summarizeMetric(rows, m);
            return (
              <div key={m} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{m}</span>
                  <span className="text-[11px] text-muted-foreground">{s.samples} измервания</span>
                </div>
                <div className="mt-1 text-lg font-semibold">{formatMetricValue(m, s.average)}</div>
                <div className="text-[11px] text-muted-foreground">средно (нормализирано)</div>
                <div className="mt-2 text-xs">
                  Good: <b>{pct(s.goodRate)}</b>
                </div>
                <div className="text-xs">
                  p75 банд: <b className={bandColor[s.p75Band]}>{bandLabel[s.p75Band]}</b>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Mobile {s.byDevice.mobile.samples} ({pct(s.byDevice.mobile.goodRate)}) · Desktop{" "}
                  {s.byDevice.desktop.samples} ({pct(s.byDevice.desktop.goodRate)})
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        p75 е БАНД, изведен от разпределението на рейтингите (Good при ≥75% good; Needs
        improvement при good+NI ≥75%), а не точна числова стойност.
      </p>
    </section>
  );
}

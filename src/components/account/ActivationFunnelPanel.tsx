import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DOC_STAGES, DOC_STAGE_LABELS, type DocStage } from "@/lib/docFunnel";
import { Loader2, ChartLine } from "@/icons";

type Row = { stage: string; sessions: number; events: number };

const WINDOWS = [
  { key: 7, label: "7 дни" },
  { key: 30, label: "30 дни" },
  { key: 90, label: "90 дни" },
] as const;

/**
 * Личната активационна фуния: start → fill → generate → download (+ sign).
 * Данните идват от security-definer RPC, който вижда само собствените
 * псевдонимни събития на потребителя (без PII).
 */
export function ActivationFunnelPanel() {
  const [days, setDays] = useState<number>(30);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    supabase
      .rpc("get_my_activation_funnel", { _days: days })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setErr(error.message);
        else setRows((data ?? []) as Row[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const byStage = new Map(rows.map((r) => [r.stage, Number(r.sessions) || 0]));
  const counts = DOC_STAGES.map((s) => byStage.get(s) ?? 0);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);

  // Най-слабото звено = най-големият спад между два последователни етапа.
  let weakest: { from: DocStage; to: DocStage; drop: number } | null = null;
  for (let i = 1; i < DOC_STAGES.length; i++) {
    const prev = counts[i - 1];
    const cur = counts[i];
    if (prev <= 0) continue;
    const drop = Math.round(((prev - cur) / prev) * 100);
    if (drop > 0 && (!weakest || drop > weakest.drop)) {
      weakest = { from: DOC_STAGES[i - 1], to: DOC_STAGES[i], drop };
    }
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-gradient-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
            <ChartLine className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h3 className="font-serif text-base font-bold sm:text-lg">Вашата активация до изтегляне</h3>
            <p className="text-xs text-muted-foreground">
              Старт → Попълване → Генериране → Сваляне (и Подпис) — вижте къде спирате.
            </p>
          </div>
        </div>
        <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => setDays(w.key)}
              aria-pressed={days === w.key}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                days === w.key ? "bg-gold/15 text-gold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Зареждане на статистиката…
        </div>
      ) : err ? (
        <p className="py-6 text-sm text-muted-foreground">Статистиката не е достъпна в момента.</p>
      ) : total === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Още няма отчетени стъпки за този период. Започнете документ и статистиката ще се появи автоматично.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-2.5">
            {DOC_STAGES.map((stage, i) => {
              const value = counts[i];
              const prev = i === 0 ? null : counts[i - 1];
              const conv = prev && prev > 0 ? Math.round((value / prev) * 100) : null;
              return (
                <li key={stage}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-foreground">
                      {String(i + 1).padStart(2, "0")} · {DOC_STAGE_LABELS[stage]}
                    </span>
                    <span className="text-muted-foreground">
                      <strong className="text-foreground">{value}</strong>
                      {conv !== null && <span> · {conv}% от предишния</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted/50">
                    <div
                      className="h-full rounded-full bg-gold/70 transition-[width] duration-500"
                      style={{ width: `${Math.round((value / max) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          {weakest && (
            <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-muted-foreground">
              Най-голям спад: <strong className="text-foreground">{DOC_STAGE_LABELS[weakest.from]} → {DOC_STAGE_LABELS[weakest.to]}</strong>{" "}
              ({weakest.drop}% отпадане). Ако сте блокирани от лимит, изберете план или топ-ъп пакет по-долу.
            </p>
          )}
        </>
      )}
    </section>
  );
}

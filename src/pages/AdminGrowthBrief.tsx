/**
 * /admin/growth-brief — „Режим разсъждение".
 *
 * Надгражда /admin/metrics и /admin/funnel: не просто показва числа, а
 * затваря контура — чете реалния снапшот (public.growth_snapshot), кара модел
 * да разсъждава върху него и произвежда ГОТОВ за поставяне промпт за
 * следващата итерация на сайта.
 *
 * Работи ръчно (бутон „Генерирай сега") и автоматично (cron: 24ч / 7д / 30д / година).
 * Всички данни са агрегирани, без лични данни.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, AlertCircle, Brain, Copy, Download, Clock, TrendingUp } from "@/icons";
import { cn } from "@/lib/utils";

type Period = "daily" | "weekly" | "monthly" | "yearly";

const PERIODS: { key: Period; label: string; hint: string }[] = [
  { key: "daily", label: "24 часа", hint: "дневен" },
  { key: "weekly", label: "7 дни", hint: "седмичен" },
  { key: "monthly", label: "30 дни", hint: "месечен" },
  { key: "yearly", label: "12 месеца", hint: "годишен" },
];

interface TopAction {
  title?: string;
  why?: string;
  effort?: string;
  impact?: string;
  metric?: string;
  quality_metric?: string;
}

interface Brief {
  id?: string;
  period: Period;
  window_from: string;
  window_to: string;
  snapshot: Record<string, any> | null;
  reasoning: string | null;
  prompt_md: string | null;
  headline: string | null;
  top_actions: TopAction[] | null;
  source: string;
  model: string | null;
  created_at?: string;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function Delta({ current, previous, invert }: { current: unknown; previous: unknown; invert?: boolean }) {
  const c = num(current);
  const p = num(previous);
  if (p === 0) return <span className="text-[11px] text-muted-foreground">—</span>;
  const pct = Math.round(((c - p) / p) * 1000) / 10;
  const good = invert ? pct <= 0 : pct >= 0;
  if (pct === 0) return <span className="text-[11px] text-muted-foreground">0%</span>;
  return (
    <span className={cn("text-[11px] font-medium", good ? "text-success" : "text-danger")}>
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

function SnapRow({
  label, current, previous, suffix, invert,
}: { label: string; current: unknown; previous: unknown; suffix?: string; invert?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hairline/60 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-foreground">
          {num(current)}
          {suffix ? <span className="ml-0.5 text-xs text-muted-foreground">{suffix}</span> : null}
        </span>
        <Delta current={current} previous={previous} invert={invert} />
      </span>
    </div>
  );
}

export default function AdminGrowthBrief() {
  const [period, setPeriod] = useState<Period>("weekly");
  const [history, setHistory] = useState<Brief[]>([]);
  const [selected, setSelected] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Насока/промпт от оператора — влиза в разсъждението за следващата итерация. */
  const [operatorPrompt, setOperatorPrompt] = useState("");


  const loadHistory = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("growth_briefs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) setErr(error.message);
    else {
      const rows = (data ?? []) as unknown as Brief[];
      setHistory(rows);
      setSelected((prev) => prev ?? rows[0] ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const generate = async () => {
    setGenerating(true);
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke("growth-brief", {
        body: { period, source: "manual" },
      });
      if (error) throw new Error(error.message);
      const brief = (data as { brief?: Brief; error?: string })?.brief;
      if (!brief) throw new Error((data as { error?: string })?.error ?? "Неуспешно генериране");
      setSelected(brief);
      toast.success("Брифът е готов");
      void loadHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Неочаквана грешка";
      setErr(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const cur = selected?.snapshot?.current ?? null;
  const prev = selected?.snapshot?.previous ?? null;

  const copyPrompt = async () => {
    if (!selected?.prompt_md) return;
    await navigator.clipboard.writeText(selected.prompt_md);
    toast.success("Промптът е копиран — поставете го в чата");
  };

  const downloadMd = () => {
    if (!selected?.prompt_md) return;
    const blob = new Blob([selected.prompt_md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `growth-brief-${selected.period}-${(selected.created_at ?? "").slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const periodLabel = useMemo(
    () => PERIODS.find((p) => p.key === (selected?.period ?? period))?.label ?? "",
    [selected?.period, period],
  );

  return (
    <>
      <Seo title="Режим разсъждение — Growth Brief" description="Автоматичен анализ на реалните данни и готов промпт за следващата итерация." noindex />
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
              <Brain className="h-5 w-5 text-brand" /> Режим разсъждение
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Надграждане на плана „Път към 30 абоната“: реалните данни се превръщат в разсъждение и в
              готов за поставяне промпт за следващата итерация. Guardrail — конверсията не се приема при спад в качеството.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-full border border-hairline bg-card/70 p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    period === p.key ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button onClick={generate} disabled={generating} size="sm">
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
              Генерирай сега
            </Button>
          </div>
        </div>

        {err && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4" /> {err}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Зареждане…
          </div>
        )}

        {!loading && !selected && (
          <div className="rounded-2xl border border-hairline bg-card/60 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Още няма брифове. Изберете период и натиснете „Генерирай сега“.
            </p>
          </div>
        )}

        {selected && (
          <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
            <div className="space-y-6">
              {/* Заглавие на брифа */}
              <section className="rounded-2xl border border-gold/30 bg-card/70 p-5">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {periodLabel} · {selected.source === "cron" ? "автоматично" : "ръчно"}
                  {selected.model ? ` · ${selected.model}` : ""}
                </p>
                <h2 className="mt-2 font-serif text-lg text-foreground">{selected.headline ?? "Бриф"}</h2>
              </section>

              {/* Снапшот на данните */}
              {cur && (
                <section className="rounded-2xl border border-hairline bg-card/60 p-5">
                  <h3 className="mb-3 flex items-center gap-2 font-serif text-base text-foreground">
                    <TrendingUp className="h-4 w-4 text-brand" /> Снапшот (Δ спрямо предходния период)
                  </h3>
                  <div className="grid gap-x-8 sm:grid-cols-2">
                    <div>
                      <SnapRow label="Посетители" current={cur.acquisition?.visitors} previous={prev?.acquisition?.visitors} />
                      <SnapRow label="Сесии" current={cur.acquisition?.sessions} previous={prev?.acquisition?.sessions} />
                      <SnapRow label="Регистрации" current={cur.acquisition?.signups} previous={prev?.acquisition?.signups} />
                      <SnapRow label="Старт на документ" current={cur.activation?.start} previous={prev?.activation?.start} />
                      <SnapRow label="Успешни генерации" current={cur.activation?.generate} previous={prev?.activation?.generate} />
                      <SnapRow label="Сваляния" current={cur.activation?.download} previous={prev?.activation?.download} />
                      <SnapRow label="Качени за анализ" current={cur.activation?.uploads_analyzed} previous={prev?.activation?.uploads_analyzed} />
                    </div>
                    <div>
                      <SnapRow label="Прегледи на планове" current={cur.conversion?.plans_views} previous={prev?.conversion?.plans_views} />
                      <SnapRow label="Нови абонаменти" current={cur.conversion?.new_paid_subscriptions} previous={prev?.conversion?.new_paid_subscriptions} />
                      <SnapRow label="Активни абонаменти" current={cur.conversion?.active_paid_subscriptions} previous={prev?.conversion?.active_paid_subscriptions} />
                      <SnapRow label="Изразходвани операции" current={cur.operations?.charged_sessions} previous={prev?.operations?.charged_sessions} />
                      <SnapRow label="Технически провали" current={cur.quality?.generate_fail} previous={prev?.quality?.generate_fail} invert />
                      <SnapRow label="Продуктови блокажи" current={cur.quality?.generate_blocked} previous={prev?.quality?.generate_blocked} invert />
                      <SnapRow label="Ср. оценка от ревизия" current={cur.quality?.avg_review_score} previous={prev?.quality?.avg_review_score} suffix="/100" />
                    </div>
                  </div>

                  {Array.isArray(cur.drop_off) && cur.drop_off.length > 0 && (
                    <div className="mt-4 border-t border-hairline pt-3">
                      <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Топ точки на отпадане</p>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {cur.drop_off.slice(0, 6).map((d: any, i: number) => (
                          <li key={i} className="flex justify-between gap-3">
                            <span className="truncate">{d.name}{d.reason ? ` · ${d.reason}` : ""}</span>
                            <span className="font-medium text-foreground">{d.hits}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              {/* Разсъждение */}
              {selected.reasoning && (
                <section className="rounded-2xl border border-hairline bg-card/60 p-5">
                  <h3 className="mb-3 font-serif text-base text-foreground">Разсъждение</h3>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {selected.reasoning}
                  </div>
                </section>
              )}

              {/* Приоритети */}
              {Array.isArray(selected.top_actions) && selected.top_actions.length > 0 && (
                <section className="rounded-2xl border border-hairline bg-card/60 p-5">
                  <h3 className="mb-3 font-serif text-base text-foreground">Приоритети</h3>
                  <ol className="space-y-3">
                    {selected.top_actions.map((a, i) => (
                      <li key={i} className="rounded-xl border border-hairline/70 bg-background/40 p-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{i + 1}. {a.title}</p>
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            усилие {a.effort ?? "—"} · ефект {a.impact ?? "—"}
                          </span>
                        </div>
                        {a.why && <p className="mt-1 text-xs text-muted-foreground">{a.why}</p>}
                        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                          {a.metric && <span>Успех: <span className="text-foreground">{a.metric}</span></span>}
                          {a.quality_metric && <span>Качество: <span className="text-foreground">{a.quality_metric}</span></span>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {/* Готов промпт */}
              {selected.prompt_md && (
                <section className="rounded-2xl border border-brand/30 bg-card/70 p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-serif text-base text-foreground">Готов промпт за чата</h3>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={copyPrompt}>
                        <Copy className="mr-2 h-4 w-4" /> Копирай
                      </Button>
                      <Button size="sm" variant="outline" onClick={downloadMd}>
                        <Download className="mr-2 h-4 w-4" /> .md
                      </Button>
                    </div>
                  </div>
                  <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl border border-hairline bg-background/60 p-4 text-xs leading-relaxed text-muted-foreground">
                    {selected.prompt_md}
                  </pre>
                </section>
              )}
            </div>

            {/* История */}
            <aside className="space-y-2">
              <p className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> История
              </p>
              {history.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelected(b)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition-colors",
                    selected?.id === b.id
                      ? "border-brand/50 bg-brand/5"
                      : "border-hairline bg-card/50 hover:border-brand/30",
                  )}
                >
                  <p className="text-[11px] text-muted-foreground">
                    {(b.created_at ?? "").slice(0, 16).replace("T", " ")} ·{" "}
                    {PERIODS.find((p) => p.key === b.period)?.hint ?? b.period} ·{" "}
                    {b.source === "cron" ? "авто" : "ръчно"}
                  </p>
                  <p className="mt-1 line-clamp-3 text-xs text-foreground">{b.headline ?? "Бриф"}</p>
                </button>
              ))}
              {history.length === 0 && (
                <p className="text-xs text-muted-foreground">Няма записи.</p>
              )}
            </aside>
          </div>
        )}
      </main>
    </>
  );
}

/**
 * /admin/bots — „QA ботове".
 *
 * Показва трите автоматични бота, тяхното състояние (safe mode, дневен лимит,
 * пауза от circuit breaker) и историята на изпълненията: всяко действие с време,
 * резултат, HTTP код, съобщение за грешка и stack trace.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, AlertCircle, RefreshCcw, Play, ShieldCheck, Clock } from "@/icons";
import { cn } from "@/lib/utils";

interface Bot {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  enabled: boolean;
  safe_mode: boolean;
  max_ops_per_day: number;
  consecutive_failures: number;
  paused_until: string | null;
  paused_reason: string | null;
  last_run_at: string | null;
}

interface Run {
  id: string;
  bot_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  ops_planned: number;
  ops_done: number;
  failures: number;
  trigger: string;
  correlation_id: string | null;
  notes: string | null;
}

interface Action {
  id: string;
  run_id: string;
  bot_id: string;
  seq: number;
  action: string;
  target: string | null;
  status: string;
  http_status: number | null;
  duration_ms: number | null;
  detail: Record<string, unknown> | null;
  error_message: string | null;
  error_stack: string | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  template_search: "Търсене на шаблон",
  catalog_integrity: "Цялост на каталога",
  plans_pricing: "Планове и цени",
  public_counters: "Публични броячи",
  ai_json_health: "Здраве на AI JSON",
  assistant_anon: "AI асистент (анонимен)",
  generate_contract: "Генериране на договор",
  funnel_health: "Здраве на фунията",
  shared_link_guard: "Защита на споделен линк",
  rls_guard: "RLS защита",
  auth_guard: "Защита с вход",
  rate_limit_guard: "Rate limit защита",
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("bg-BG", { dateStyle: "short", timeStyle: "short" }) : "—";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pass: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
    passed: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
    fail: "border-destructive/40 bg-destructive/10 text-destructive",
    failed: "border-destructive/40 bg-destructive/10 text-destructive",
    running: "border-gold/40 bg-gold/10 text-gold",
    skip: "border-border bg-muted text-muted-foreground",
    skipped: "border-border bg-muted text-muted-foreground",
  };
  const label: Record<string, string> = {
    pass: "OK", passed: "OK", fail: "Грешка", failed: "Грешка",
    running: "В процес", skip: "Пропуснато", skipped: "Пропуснато",
  };
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", map[status] ?? map.skip)}>
      {label[status] ?? status}
    </span>
  );
}

type ScheduleRow = {
  slug: string;
  name: string;
  enabled: boolean;
  ops_planned: number;
  slots: string[];
};

export default function AdminBots() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);

  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [scheduleWindow, setScheduleWindow] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [b, r, a] = await Promise.all([
      supabase.from("qa_bots").select("*").order("slug"),
      supabase.from("qa_bot_runs").select("*").order("started_at", { ascending: false }).limit(60),
      supabase.from("qa_bot_actions").select("*").order("created_at", { ascending: false }).limit(400),
    ]);
    const firstErr = b.error || r.error || a.error;
    if (firstErr) setErr(firstErr.message);
    setBots((b.data as Bot[]) ?? []);
    setRuns((r.data as Run[]) ?? []);
    setActions((a.data as Action[]) ?? []);
    setLoading(false);
  }, []);

  const loadSchedule = useCallback(async () => {
    const { data } = await supabase.functions.invoke("qa-bot-runner", { body: { mode: "schedule" } });
    const payload = data as { schedule?: ScheduleRow[]; window?: string } | null;
    setSchedule(payload?.schedule ?? []);
    setScheduleWindow(payload?.window ?? "");
  }, []);

  useEffect(() => { load(); loadSchedule(); }, [load, loadSchedule]);


  const actionsByRun = useMemo(() => {
    const m = new Map<string, Action[]>();
    for (const a of actions) {
      const arr = m.get(a.run_id) ?? [];
      arr.push(a);
      m.set(a.run_id, arr);
    }
    for (const arr of m.values()) arr.sort((x, y) => x.seq - y.seq);
    return m;
  }, [actions]);

  const botById = useMemo(() => new Map(bots.map((b) => [b.id, b])), [bots]);

  const stats = useMemo(() => {
    const total = actions.length;
    const failed = actions.filter((a) => a.status === "fail").length;
    const last24 = actions.filter(
      (a) => Date.now() - new Date(a.created_at).getTime() < 24 * 3600 * 1000,
    ).length;
    return { total, failed, last24, passRate: total ? Math.round(((total - failed) / total) * 100) : 0 };
  }, [actions]);

  const runNow = async (slug?: string) => {
    setRunning(slug ?? "all");
    const { data, error } = await supabase.functions.invoke("qa-bot-runner", {
      body: { trigger: "manual", ...(slug ? { slug } : {}) },
    });
    setRunning(null);
    if (error) {
      toast.error("Стартирането се провали", { description: error.message });
      return;
    }
    const results = (data as { results?: Array<{ slug: string; status: string; ops: number; failures: number }> })?.results ?? [];
    toast.success("Ботовете приключиха", {
      description: results.map((x) => `${x.slug}: ${x.status} (${x.ops} оп., ${x.failures} гр.)`).join(" · ") || "няма изпълнени операции",
    });
    load();
  };

  return (
    <>
      <Seo title="QA ботове · Admin" description="Автоматични проверки на критичните функции" noindex />
      <Header />
      <main className="container mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl text-foreground sm:text-4xl">QA ботове</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Три бота изпълняват автоматично по 3–4 проверки дневно в безопасен режим
              (само синтетични данни), в рандомизирани часове — без ръчно стартиране.
            </p>

          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" /> Опресни
            </Button>
            <Button size="sm" onClick={() => runNow()} disabled={running !== null}>
              {running === "all" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Стартирай всички
            </Button>
          </div>
        </div>

        {err && (
          <div className="mb-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="mb-1 inline h-4 w-4" /> {err}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Зареждане…
          </div>
        ) : (
          <div className="grid gap-6">
            {/* KPI */}
            <section className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Действия (общо)", value: stats.total },
                { label: "Действия (24ч)", value: stats.last24 },
                { label: "Успеваемост", value: `${stats.passRate}%` },
                { label: "Грешки", value: stats.failed },
              ].map((k) => (
                <div key={k.label} className="rounded-2xl border border-border/60 bg-card p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</p>
                  <p className="mt-2 font-serif text-3xl text-foreground">{k.value}</p>
                </div>
              ))}
            </section>

            {/* Автоматичен график за днес */}
            {schedule.length > 0 && (
              <section className="rounded-2xl border border-border/60 bg-card p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-serif text-lg text-foreground">Автоматичен график за днес</h2>
                  <p className="text-xs text-muted-foreground">
                    Прозорец {scheduleWindow || "08:00–22:00"} · проверка на всеки 10 мин.
                  </p>
                </div>
                <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                  {schedule.map((s) => (
                    <li key={s.slug} className="rounded-xl border border-border/50 bg-background/40 p-3">
                      <p className="text-sm font-medium text-foreground">{s.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {s.ops_planned} операции{s.enabled ? "" : " · изключен"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {s.slots.map((t) => (
                          <span
                            key={t}
                            className="rounded-md border border-border/60 px-2 py-0.5 font-mono text-xs text-foreground/80"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Ботове */}
            <section className="grid gap-3 lg:grid-cols-3">
              {bots.map((b) => {
                const paused = b.paused_until && new Date(b.paused_until) > new Date();
                return (
                  <div key={b.id} className="rounded-2xl border border-border/60 bg-card p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="font-serif text-lg text-foreground">{b.name}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">{b.description}</p>
                      </div>
                      <StatusBadge status={paused ? "skipped" : b.enabled ? "passed" : "skip"} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      {b.safe_mode && (
                        <Badge variant="outline" className="gap-1 border-emerald-600/40 text-emerald-700 dark:text-emerald-400">
                          <ShieldCheck className="h-3 w-3" /> Safe mode
                        </Badge>
                      )}
                      <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" /> лимит {b.max_ops_per_day} оп./ден
                      </Badge>
                      {b.consecutive_failures > 0 && (
                        <Badge variant="outline" className="border-destructive/40 text-destructive">
                          {b.consecutive_failures} посл. провала
                        </Badge>
                      )}
                    </div>
                    {paused && (
                      <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                        В пауза до {fmt(b.paused_until)} · {b.paused_reason}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">Последно: {fmt(b.last_run_at)}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => runNow(b.slug)}
                      disabled={running !== null}
                    >
                      {running === b.slug ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      Стартирай сега
                    </Button>
                  </div>
                );
              })}
            </section>

            {/* История */}
            <section className="rounded-2xl border border-border/60 bg-card p-6">
              <h2 className="mb-4 font-serif text-xl text-foreground">История на изпълненията</h2>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Още няма изпълнения.</p>
              ) : (
                <div className="divide-y divide-border/50">
                  {runs.map((run) => {
                    const bot = botById.get(run.bot_id);
                    const items = actionsByRun.get(run.id) ?? [];
                    const open = openRun === run.id;
                    return (
                      <div key={run.id} className="py-3">
                        <button
                          onClick={() => setOpenRun(open ? null : run.id)}
                          className="flex w-full flex-wrap items-center gap-3 text-left"
                        >
                          <StatusBadge status={run.status} />
                          <span className="text-sm font-medium text-foreground">{bot?.name ?? "—"}</span>
                          <span className="text-xs text-muted-foreground">{fmt(run.started_at)}</span>
                          <span className="text-xs text-muted-foreground">
                            {run.ops_done}/{run.ops_planned} оп. · {run.failures} гр. · {run.trigger}
                          </span>
                          {run.notes && <span className="text-xs text-destructive">{run.notes}</span>}
                          <span className="ml-auto text-xs text-muted-foreground">{open ? "Скрий" : "Детайли"}</span>
                        </button>

                        {open && (
                          <div className="mt-3 space-y-2">
                            {items.length === 0 && (
                              <p className="text-xs text-muted-foreground">Няма записани действия.</p>
                            )}
                            {items.map((a) => (
                              <div key={a.id} className="rounded-xl border border-border/60 bg-background/40 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <StatusBadge status={a.status} />
                                  <span className="text-sm font-medium text-foreground">
                                    {a.seq}. {ACTION_LABEL[a.action] ?? a.action}
                                  </span>
                                  {a.target && (
                                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                      {a.target}
                                    </code>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {fmt(a.created_at)} · {a.duration_ms ?? 0} ms
                                    {a.http_status ? ` · HTTP ${a.http_status}` : ""}
                                  </span>
                                </div>
                                {a.detail && Object.keys(a.detail).length > 0 && (
                                  <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/60 p-2 text-[11px] leading-relaxed text-muted-foreground">
                                    {JSON.stringify(a.detail, null, 2)}
                                  </pre>
                                )}
                                {a.error_message && (
                                  <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                                    {a.error_message}
                                  </p>
                                )}
                                {a.error_stack && (
                                  <details className="mt-2">
                                    <summary className="cursor-pointer text-xs text-muted-foreground">
                                      Stack trace
                                    </summary>
                                    <pre className="mt-1 overflow-x-auto rounded-lg bg-muted/60 p-2 text-[11px] leading-relaxed text-muted-foreground">
                                      {a.error_stack}
                                    </pre>
                                  </details>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}

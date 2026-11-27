/**
 * /admin/funnel — Marketing funnel dashboard.
 *
 * Чете от public.funnel_events (admin-only RLS). Показва:
 *  - 4-степенно фуния-визуализация (Landing → Educate → Analyze → Convert)
 *  - Conversion % между всяка стъпка
 *  - Top events за последните 7/30 дни
 *  - Daily volume sparkline
 */
import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp, AlertCircle } from "@/icons";

import { DOC_STAGES, DOC_STAGE_LABELS, type DocStage } from "@/lib/docFunnel";

type Row = {
  id: string;
  session_id: string;
  step: number | null;
  name: string;
  path: string | null;
  created_at: string;
  props: Record<string, unknown> | null;
};

type Window = "7d" | "30d";


const STEP_LABELS = ["Landing", "Educate", "Analyze", "Convert"];

export default function AdminFunnel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [win, setWin] = useState<Window>("7d");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const days = win === "7d" ? 7 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("funnel_events")
      .select("id, session_id, step, name, path, created_at, props")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setErr(error.message);
        else setRows((data ?? []) as Row[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [win]);

  const stats = useMemo(() => {
    // Unique sessions that reached each step (1..4).
    const reached: Record<number, Set<string>> = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };
    for (const r of rows) {
      if (r.step && r.step >= 1 && r.step <= 4) {
        reached[r.step].add(r.session_id);
      }
    }
    const counts = [1, 2, 3, 4].map((s) => reached[s].size);
    const conv = counts.map((c, i) => {
      if (i === 0) return 100;
      const prev = counts[i - 1];
      return prev > 0 ? Math.round((c / prev) * 100) : 0;
    });

    // Top events overall
    const byName = new Map<string, number>();
    for (const r of rows) byName.set(r.name, (byName.get(r.name) ?? 0) + 1);
    const topEvents = [...byName.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    // Daily volume
    const byDay = new Map<string, number>();
    for (const r of rows) {
      const day = r.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const maxDay = days.reduce((m, [, v]) => Math.max(m, v), 1);

    // ---- Документна фуния (props.dstage) ----
    const stageSessions: Record<DocStage, Set<string>> = {
      start: new Set(), fill: new Set(), generate: new Set(), download: new Set(), sign: new Set(),
    };
    const failReasons = new Map<string, number>();
    const bySource = new Map<string, number>();
    for (const r of rows) {
      const props = (r.props ?? {}) as Record<string, unknown>;
      const stage = props.dstage as DocStage | undefined;
      if (!stage || !(stage in stageSessions)) continue;
      const outcome = props.outcome as string | undefined;
      // Само успешните действия броим като „достигнат етап“.
      if (outcome !== "fail" && outcome !== "declined") stageSessions[stage].add(r.session_id);
      if (outcome === "fail") {
        const reason = String(props.reason ?? "неизвестна");
        failReasons.set(`${stage}: ${reason}`, (failReasons.get(`${stage}: ${reason}`) ?? 0) + 1);
      }
      if (stage === "start") {
        const src = String(props.source ?? "unknown");
        bySource.set(src, (bySource.get(src) ?? 0) + 1);
      }
    }
    const docCounts = DOC_STAGES.map((s) => stageSessions[s].size);
    const docConv = docCounts.map((c, i) => (i === 0 ? 100 : docCounts[i - 1] > 0 ? Math.round((c / docCounts[i - 1]) * 100) : 0));
    const docDrop = docCounts.map((c, i) => Math.max(0, c - (docCounts[i + 1] ?? 0)));
    const topFails = [...failReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const topSources = [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

    const totalSessions = new Set(rows.map((r) => r.session_id)).size;

    // ---- KPI обобщения за маркетинг ----
    const e2e = docCounts[0] > 0 ? Math.round((docCounts[4] / docCounts[0]) * 1000) / 10 : 0;
    const toDownload = docCounts[0] > 0 ? Math.round((docCounts[3] / docCounts[0]) * 1000) / 10 : 0;
    // Най-голямото изтичане между два съседни етапа.
    let worstIdx = -1;
    let worstLoss = 0;
    for (let i = 0; i < DOC_STAGES.length - 1; i++) {
      const loss = docDrop[i];
      if (loss > worstLoss) {
        worstLoss = loss;
        worstIdx = i;
      }
    }
    const worstPct =
      worstIdx >= 0 && docCounts[worstIdx] > 0
        ? Math.round((worstLoss / docCounts[worstIdx]) * 100)
        : 0;
    const topSource = topSources[0] ?? null;
    const failTotal = [...failReasons.values()].reduce((a, b) => a + b, 0);

    return {
      counts, conv, topEvents, days, maxDay, totalSessions,
      docCounts, docConv, docDrop, topFails, topSources,
      e2e, toDownload, worstIdx, worstLoss, worstPct, topSource, failTotal,
    };
  }, [rows]);

  /**
   * A/B отчет за теста `quick_preview` (CTA „Виж бърз преглед сега").
   * Всяко funnel събитие носи props.ab_quick_preview, така че сегментираме
   * директно по вариант — без join-ове.
   *
   * Метрики:
   *  - start_to_fill: % от сесиите със старт, които са започнали попълване
   *    (doc_fill_step) ИЛИ директно са минали към генериране.
   *  - clean_review_rate: % „чисти" документи (doc_review_result.clean = true).
   */
  const abStats = useMemo(() => {
    type Bucket = {
      exposed: Set<string>;
      start: Set<string>;
      fill: Set<string>;
      generated: Set<string>;
      download: Set<string>;
      reviews: number;
      clean: number;
      ctaClicks: number;
    };
    const mk = (): Bucket => ({
      exposed: new Set(), start: new Set(), fill: new Set(), generated: new Set(),
      download: new Set(), reviews: 0, clean: 0, ctaClicks: 0,
    });
    const buckets: Record<"control" | "variant", Bucket> = { control: mk(), variant: mk() };

    for (const r of rows) {
      const props = (r.props ?? {}) as Record<string, unknown>;
      const v = props.ab_quick_preview as string | undefined;
      if (v !== "control" && v !== "variant") continue;
      const b = buckets[v];
      const stage = props.dstage as DocStage | undefined;
      const outcome = props.outcome as string | undefined;
      if (r.name === "ab_exposure" || props.ab_test === "quick_preview") b.exposed.add(r.session_id);
      if (r.name === "quick_preview_cta_click") b.ctaClicks += 1;
      if (stage === "start") b.start.add(r.session_id);
      if (stage === "fill") b.fill.add(r.session_id);
      if (stage === "generate" && outcome === "success") b.generated.add(r.session_id);
      if (stage === "download" && outcome === "success") b.download.add(r.session_id);
      if (r.name === "doc_review_result") {
        b.reviews += 1;
        if (props.clean === true) b.clean += 1;
      }
    }

    const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
    const view = (v: "control" | "variant") => {
      const b = buckets[v];
      const fillOrGen = new Set([...b.fill, ...b.generated]);
      return {
        variant: v,
        exposed: b.exposed.size,
        starts: b.start.size,
        fills: fillOrGen.size,
        generated: b.generated.size,
        downloads: b.download.size,
        ctaClicks: b.ctaClicks,
        startToFill: rate(fillOrGen.size, b.start.size),
        cleanReviewRate: rate(b.clean, b.reviews),
        reviews: b.reviews,
        clean: b.clean,
        startToDownload: rate(b.download.size, b.start.size),
      };
    };
    const control = view("control");
    const variant = view("variant");

    // Двупропорционален z-тест — груба, но достатъчна проверка за значимост.
    const zTest = (n1: number, x1: number, n2: number, x2: number) => {
      if (n1 < 1 || n2 < 1) return { z: 0, significant: false };
      const p1 = x1 / n1;
      const p2 = x2 / n2;
      const p = (x1 + x2) / (n1 + n2);
      const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
      if (!se) return { z: 0, significant: false };
      const z = (p2 - p1) / se;
      return { z: Math.round(z * 100) / 100, significant: Math.abs(z) >= 1.96 };
    };

    const fillSig = zTest(
      control.starts, Math.round((control.startToFill / 100) * control.starts),
      variant.starts, Math.round((variant.startToFill / 100) * variant.starts),
    );
    const cleanSig = zTest(control.reviews, control.clean, variant.reviews, variant.clean);

    return {
      control,
      variant,
      fillSig,
      cleanSig,
      fillLift: Math.round((variant.startToFill - control.startToFill) * 10) / 10,
      cleanLift: Math.round((variant.cleanReviewRate - control.cleanReviewRate) * 10) / 10,
      hasData: control.starts + variant.starts > 0,
    };
  }, [rows]);




  return (
    <>
      <Seo title="Funnel · Admin" description="Marketing funnel performance" noindex />
      <Header />
      <main className="container mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl text-foreground sm:text-4xl">
              Фуния и конверсии
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Къде спират хората по пътя към подписан документ · {stats.totalSessions.toLocaleString("bg-BG")} уникални сесии
            </p>

          </div>
          <div className="inline-flex rounded-xl border border-border/60 bg-card p-1">
            {(["7d", "30d"] as const).map((w) => (
              <button
                key={w}
                onClick={() => setWin(w)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  win === w ? "bg-emerald-500 text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {w === "7d" ? "7 дни" : "30 дни"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Зареждане…
          </div>
        ) : err ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
            <AlertCircle className="mb-2 inline h-4 w-4" /> {err}
          </div>
        ) : (
          <div className="grid gap-6">
            {/* KPI strip — какво значи това за бизнеса */}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: "Старт → Подпис",
                  value: `${stats.e2e}%`,
                  hint: `${stats.docCounts[4].toLocaleString("bg-BG")} подписа от ${stats.docCounts[0].toLocaleString("bg-BG")} старта`,
                },
                {
                  label: "Старт → Сваляне",
                  value: `${stats.toDownload}%`,
                  hint: "потребители с готов документ",
                },
                {
                  label: "Най-голямо изтичане",
                  value:
                    stats.worstIdx >= 0
                      ? `−${stats.worstPct}%`
                      : "—",
                  hint:
                    stats.worstIdx >= 0
                      ? `${DOC_STAGE_LABELS[DOC_STAGES[stats.worstIdx]]} → ${DOC_STAGE_LABELS[DOC_STAGES[stats.worstIdx + 1]]} · ${stats.worstLoss.toLocaleString("bg-BG")} сесии`
                      : "няма отпадания",
                  tone: "warn" as const,
                },
                {
                  label: "Водеща входна точка",
                  value: stats.topSource ? String(stats.topSource[0]) : "—",
                  hint: stats.topSource
                    ? `${stats.topSource[1].toLocaleString("bg-BG")} старта`
                    : "няма данни",
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-2xl border border-border/60 bg-card p-4 shadow-soft"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {kpi.label}
                  </p>
                  <p
                    className={`mt-2 truncate font-serif text-3xl ${
                      kpi.tone === "warn" ? "text-destructive" : "text-foreground"
                    }`}
                    title={kpi.value}
                  >
                    {kpi.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
                </div>
              ))}
            </section>

            {/* A/B тест: CTA „Виж бърз преглед сега" */}
            <section className="rounded-2xl border border-border/60 bg-card p-6">
              <div className="mb-4">
                <h2 className="font-serif text-xl text-foreground">
                  A/B: CTA „Виж бърз преглед сега"
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ефект върху активацията (Старт → Попълване) и качеството
                  (дял чисти документи без открити пропуски).
                </p>
              </div>

              {!abStats.hasData ? (
                <p className="text-sm text-muted-foreground">
                  Още няма достатъчно данни за този тест.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Вариант</th>
                          <th className="py-2 pr-3 font-medium">Изложени</th>
                          <th className="py-2 pr-3 font-medium">Стартове</th>
                          <th className="py-2 pr-3 font-medium">Старт → Попълване</th>
                          <th className="py-2 pr-3 font-medium">Чисти документи</th>
                          <th className="py-2 pr-3 font-medium">Старт → Сваляне</th>
                          <th className="py-2 pr-3 font-medium">Клика по CTA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[abStats.control, abStats.variant].map((v) => (
                          <tr key={v.variant} className="border-b border-border/40 last:border-0">
                            <td className="py-2 pr-3 font-medium text-foreground">
                              {v.variant === "control" ? "Контрола (без CTA)" : "Вариант (с CTA)"}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">{v.exposed}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{v.starts}</td>
                            <td className="py-2 pr-3 text-foreground">{v.startToFill}%</td>
                            <td className="py-2 pr-3 text-foreground">
                              {v.cleanReviewRate}%{" "}
                              <span className="text-xs text-muted-foreground">
                                ({v.clean}/{v.reviews})
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">{v.startToDownload}%</td>
                            <td className="py-2 pr-3 text-muted-foreground">{v.ctaClicks}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Ефект върху активацията
                      </p>
                      <p
                        className={`mt-1 font-serif text-2xl ${
                          abStats.fillLift >= 0 ? "text-emerald-600" : "text-destructive"
                        }`}
                      >
                        {abStats.fillLift >= 0 ? "+" : ""}
                        {abStats.fillLift} п.п.
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        z = {abStats.fillSig.z} ·{" "}
                        {abStats.fillSig.significant
                          ? "статистически значимо (95%)"
                          : "още не е значимо — нужни са повече сесии"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Ефект върху качеството
                      </p>
                      <p
                        className={`mt-1 font-serif text-2xl ${
                          abStats.cleanLift >= 0 ? "text-emerald-600" : "text-destructive"
                        }`}
                      >
                        {abStats.cleanLift >= 0 ? "+" : ""}
                        {abStats.cleanLift} п.п.
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        z = {abStats.cleanSig.z} ·{" "}
                        {abStats.cleanLift < -2
                          ? "внимание: качеството спада — не приемайте варианта"
                          : abStats.cleanSig.significant
                            ? "статистически значимо (95%)"
                            : "в рамките на шума"}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </section>



            {/* Документна фуния — хоризонтална, с изтичане между етапите */}
            <section className="rounded-2xl border border-border/60 bg-card p-6">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-serif text-lg text-foreground">Документна фуния</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Пътят до готов и подписан документ · уникални сесии
                  </p>
                </div>
                <span className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground">
                  {win === "7d" ? "последни 7 дни" : "последни 30 дни"}
                </span>
              </div>

              <ol className="space-y-2">
                {DOC_STAGES.map((stage, i) => {
                  const c = stats.docCounts[i];
                  const base = stats.docCounts[0] || 1;
                  const widthPct = Math.max(2, Math.round((c / base) * 100));
                  const shareOfStart = Math.round((c / base) * 100);
                  const drop = i < DOC_STAGES.length - 1 ? stats.docDrop[i] : 0;
                  return (
                    <li key={stage}>
                      <div className="flex items-center gap-3">
                        <span className="w-6 shrink-0 font-mono text-[11px] text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-medium text-foreground">
                              {DOC_STAGE_LABELS[stage]}
                            </span>
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">
                              {c.toLocaleString("bg-BG")}
                              <span className="ml-2 text-foreground/80">{shareOfStart}%</span>
                            </span>
                          </div>
                          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-gradient-gold transition-all duration-500"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      {i < DOC_STAGES.length - 1 && (
                        <div className="ml-9 flex items-center gap-2 py-1.5 text-[11px]">
                          <span className="text-muted-foreground">
                            преминават {stats.docConv[i + 1]}%
                          </span>
                          {drop > 0 && (
                            <span className="text-destructive">
                              · отпадат {drop.toLocaleString("bg-BG")}
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div>
                  <div className="mb-3 flex items-baseline justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Топ причини за провал</h3>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {stats.failTotal.toLocaleString("bg-BG")} общо
                    </span>
                  </div>
                  {stats.topFails.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border/60 p-4 text-xs text-muted-foreground">
                      Няма регистрирани провали в този период.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {stats.topFails.map(([reason, count]) => (
                        <li key={reason}>
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="truncate text-muted-foreground" title={reason}>
                              {reason}
                            </span>
                            <span className="font-mono font-semibold text-destructive">{count}</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-destructive/70"
                              style={{ width: `${Math.round((count / stats.topFails[0][1]) * 100)}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="mb-3 flex items-baseline justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Входни точки</h3>
                    <span className="font-mono text-[11px] text-muted-foreground">старт събития</span>
                  </div>
                  {stats.topSources.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border/60 p-4 text-xs text-muted-foreground">
                      Няма данни за входни точки.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {stats.topSources.map(([src, count]) => (
                        <li key={src}>
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <code className="truncate font-mono text-foreground">{src}</code>
                            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                              {count.toLocaleString("bg-BG")}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-emerald-500/70"
                              style={{ width: `${Math.round((count / stats.topSources[0][1]) * 100)}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            {/* Маркетинг фуния (страници) */}
            <section className="rounded-2xl border border-border/60 bg-card p-6">
              <h2 className="mb-1 font-serif text-lg text-foreground">Маркетинг фуния</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Landing → Educate → Analyze → Convert · % спрямо предходната стъпка
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                {STEP_LABELS.map((label, i) => {
                  const c = stats.counts[i];
                  const pct = stats.conv[i];
                  const widthPct = stats.counts[0] > 0 ? Math.max(4, Math.round((c / stats.counts[0]) * 100)) : 4;
                  return (
                    <div key={label} className="rounded-xl border border-border/40 bg-background/60 p-4">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          {label}
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {pct}%
                        </span>
                      </div>
                      <div className="mt-1 font-serif text-2xl text-foreground">
                        {c.toLocaleString("bg-BG")}
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${widthPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>




            {/* Daily volume */}
            <section className="rounded-2xl border border-border/60 bg-card p-6">
              <h2 className="mb-4 flex items-center gap-2 font-serif text-lg text-foreground">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Дневен обем (events)
              </h2>
              {stats.days.length === 0 ? (
                <p className="text-sm text-muted-foreground">Няма данни в прозореца.</p>
              ) : (
                <div className="flex h-32 items-end gap-1">
                  {stats.days.map(([d, v]) => (
                    <div key={d} className="flex flex-1 flex-col items-center justify-end" title={`${d} · ${v}`}>
                      <div
                        className="w-full rounded-t-sm bg-emerald-500/70"
                        style={{ height: `${(v / stats.maxDay) * 100}%` }}
                      />
                      <span className="mt-1 text-[9px] text-muted-foreground">
                        {d.slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Top events */}
            <section className="rounded-2xl border border-border/60 bg-card p-6">
              <h2 className="mb-4 font-serif text-lg text-foreground">Top events</h2>
              <div className="divide-y divide-border/40">
                {stats.topEvents.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">Няма events.</p>
                ) : (
                  stats.topEvents.map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between py-2.5 text-sm">
                      <code className="font-mono text-xs text-foreground">{name}</code>
                      <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {count.toLocaleString("bg-BG")}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  );
}

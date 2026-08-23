/**
 * /admin/generation — Health мониторинг на генерирането на документи.
 *
 * Чете от public.funnel_events (admin-only RLS) и следи трите ключови
 * индикатора, по които мерим стабилността на pipeline-а:
 *
 *  - generate_fail_rate    = doc_generate_fail / (success + fail)
 *                            Блокираните (гейтове) НЕ влизат — те не са
 *                            технически сривове. Цел: ≤ 2% (успех ≥ 98–99%).
 *  - generate_blocked_rate = doc_generate_blocked / (success + fail + blocked)
 *                            Дял опити, спрени от продуктови прегради
 *                            (GDPR потвърждение, квота, логин…).
 *  - start_to_download     = сесии с doc_download_success / сесии с doc_start
 *                            + медианно време от старт до първо сваляне.
 *
 * Всички стойности са агрегати по анонимен session_id — без PII.
 */
import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, Gauge, ShieldCheck, Download, Timer, TrendingUp } from "@/icons";

type Row = {
  id: string;
  session_id: string;
  name: string;
  created_at: string;
  props: Record<string, unknown> | null;
};

type WindowKey = "24h" | "7d" | "30d";
const WINDOWS: Record<WindowKey, { label: string; ms: number }> = {
  "24h": { label: "24 часа", ms: 24 * 60 * 60 * 1000 },
  "7d": { label: "7 дни", ms: 7 * 24 * 60 * 60 * 1000 },
  "30d": { label: "30 дни", ms: 30 * 24 * 60 * 60 * 1000 },
};

/* Прагове за оцветяване: [green, amber] — над amber е червено. */
const THRESHOLDS = {
  fail: { good: 2, warn: 5, lowerIsBetter: true },
  blocked: { good: 10, warn: 25, lowerIsBetter: true },
  startToDownload: { good: 30, warn: 15, lowerIsBetter: false },
} as const;

function toneFor(metric: keyof typeof THRESHOLDS, value: number): "good" | "warn" | "bad" {
  const t = THRESHOLDS[metric];
  if (t.lowerIsBetter) {
    if (value <= t.good) return "good";
    if (value <= t.warn) return "warn";
    return "bad";
  }
  if (value >= t.good) return "good";
  if (value >= t.warn) return "warn";
  return "bad";
}

const TONE_TEXT: Record<"good" | "warn" | "bad", string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-destructive",
};
const TONE_BAR: Record<"good" | "warn" | "bad", string> = {
  good: "bg-emerald-500/80",
  warn: "bg-amber-500/80",
  bad: "bg-destructive/80",
};

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 1000) / 10 : 0;
}

function fmtDuration(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} сек`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин ${s % 60} сек`;
  const h = Math.floor(m / 60);
  return `${h} ч ${m % 60} мин`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export default function AdminGenHealth() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [win, setWin] = useState<WindowKey>("7d");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const since = new Date(Date.now() - WINDOWS[win].ms).toISOString();
    supabase
      .from("funnel_events")
      .select("id, session_id, name, created_at, props")
      .gte("created_at", since)
      .in("name", [
        "doc_start",
        "doc_generate_started",
        "doc_generate_success",
        "doc_generate_fail",
        "doc_generate_blocked",
        "doc_download_success",
        "doc_download_fail",
      ])
      .order("created_at", { ascending: true })
      .limit(20000)
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
    let started = 0;
    let success = 0;
    let fail = 0;
    let blocked = 0;
    let dlOk = 0;
    let dlFail = 0;

    const failReasons = new Map<string, number>();
    const blockedReasons = new Map<string, number>();
    // per doc_key: [success, fail]
    const byDoc = new Map<string, { ok: number; fail: number }>();
    // per day
    const days = new Map<
      string,
      { success: number; fail: number; blocked: number; startSessions: Set<string>; dlSessions: Set<string> }
    >();
    const dayOf = (iso: string) => iso.slice(0, 10);
    const dayBucket = (d: string) => {
      let b = days.get(d);
      if (!b) {
        b = { success: 0, fail: 0, blocked: 0, startSessions: new Set(), dlSessions: new Set() };
        days.set(d, b);
      }
      return b;
    };

    const startSessions = new Set<string>();
    const dlSessions = new Set<string>();
    // start_ts / first download ts per session — за медианното време
    const firstStart = new Map<string, number>();
    const firstDownload = new Map<string, number>();

    for (const r of rows) {
      const d = dayOf(r.created_at);
      const ts = Date.parse(r.created_at);
      switch (r.name) {
        case "doc_start": {
          startSessions.add(r.session_id);
          dayBucket(d).startSessions.add(r.session_id);
          const prev = firstStart.get(r.session_id);
          if (!prev || ts < prev) firstStart.set(r.session_id, ts);
          break;
        }
        case "doc_generate_started":
          started += 1;
          break;
        case "doc_generate_success": {
          success += 1;
          dayBucket(d).success += 1;
          const key = String((r.props ?? {}).doc_key ?? "");
          if (key) {
            const e = byDoc.get(key) ?? { ok: 0, fail: 0 };
            e.ok += 1;
            byDoc.set(key, e);
          }
          break;
        }
        case "doc_generate_fail": {
          fail += 1;
          dayBucket(d).fail += 1;
          const reason = String((r.props ?? {}).reason ?? "неизвестна").slice(0, 60);
          failReasons.set(reason, (failReasons.get(reason) ?? 0) + 1);
          const key = String((r.props ?? {}).doc_key ?? "");
          if (key) {
            const e = byDoc.get(key) ?? { ok: 0, fail: 0 };
            e.fail += 1;
            byDoc.set(key, e);
          }
          break;
        }
        case "doc_generate_blocked": {
          blocked += 1;
          dayBucket(d).blocked += 1;
          const reason = String((r.props ?? {}).reason ?? "неизвестна").slice(0, 60);
          blockedReasons.set(reason, (blockedReasons.get(reason) ?? 0) + 1);
          break;
        }
        case "doc_download_success": {
          dlOk += 1;
          dlSessions.add(r.session_id);
          dayBucket(d).dlSessions.add(r.session_id);
          const prev = firstDownload.get(r.session_id);
          if (!prev || ts < prev) firstDownload.set(r.session_id, ts);
          break;
        }
        case "doc_download_fail":
          dlFail += 1;
          break;
      }
    }

    const attempts = success + fail;
    const failRate = pct(fail, attempts);
    const blockedRate = pct(blocked, attempts + blocked);
    const startToDownload = pct(
      [...startSessions].filter((s) => dlSessions.has(s)).length,
      startSessions.size,
    );

    // Медианно време старт → първо сваляне (само за сесии с двете събития)
    const durations: number[] = [];
    for (const [s, t0] of firstStart) {
      const t1 = firstDownload.get(s);
      if (t1 && t1 >= t0) durations.push(t1 - t0);
    }
    const medianMs = median(durations);

    // Дневна серия
    const series = [...days.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, b]) => {
        const att = b.success + b.fail;
        return {
          day,
          success: b.success,
          fail: b.fail,
          blocked: b.blocked,
          failRate: pct(b.fail, att),
          blockedRate: pct(b.blocked, att + b.blocked),
          startToDownload: pct(
            [...b.startSessions].filter((s) => b.dlSessions.has(s)).length,
            b.startSessions.size,
          ),
          attempts: att,
        };
      });

    const topFails = [...failReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const topBlocked = [...blockedReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    // Най-проблемни шаблони — само с ≥3 опита, сортирани по fail rate
    const worstDocs = [...byDoc.entries()]
      .map(([key, v]) => ({ key, ...v, attempts: v.ok + v.fail, rate: pct(v.fail, v.ok + v.fail) }))
      .filter((d) => d.attempts >= 3)
      .sort((a, b) => b.rate - a.rate || b.fail - a.fail)
      .slice(0, 8);

    return {
      started, success, fail, blocked, attempts, dlOk, dlFail,
      failRate, blockedRate, startToDownload, medianMs,
      startCount: startSessions.size, dlCount: dlSessions.size,
      series, topFails, topBlocked, worstDocs,
    };
  }, [rows]);

  const failTone = toneFor("fail", stats.failRate);
  const blockedTone = toneFor("blocked", stats.blockedRate);
  const s2dTone = toneFor("startToDownload", stats.startToDownload);

  return (
    <>
      <Seo title="Здраве на генерирането · Admin" description="Generation pipeline health" noindex />
      <Header />
      <main className="container mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-serif text-3xl text-foreground sm:text-4xl">
              <Gauge className="h-7 w-7 text-emerald-500" />
              Здраве на генерирането
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              generate_fail_rate · generate_blocked_rate · start_to_download — реални събития от фунията
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-border/60 bg-card p-1">
            {(Object.keys(WINDOWS) as WindowKey[]).map((w) => (
              <button
                key={w}
                onClick={() => setWin(w)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  win === w ? "bg-emerald-500 text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {WINDOWS[w].label}
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
            {/* KPI карти */}
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    generate_fail_rate
                  </p>
                  <ShieldCheck className={`h-4 w-4 ${TONE_TEXT[failTone]}`} />
                </div>
                <p className={`mt-2 font-serif text-4xl ${TONE_TEXT[failTone]}`}>
                  {stats.failRate}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stats.fail.toLocaleString("bg-BG")} провала от {stats.attempts.toLocaleString("bg-BG")} опита
                  {" · "}успех {(100 - stats.failRate).toFixed(1)}%
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Цел: ≤ {THRESHOLDS.fail.good}% · тревога над {THRESHOLDS.fail.warn}%
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    generate_blocked_rate
                  </p>
                  <ShieldCheck className={`h-4 w-4 ${TONE_TEXT[blockedTone]}`} />
                </div>
                <p className={`mt-2 font-serif text-4xl ${TONE_TEXT[blockedTone]}`}>
                  {stats.blockedRate}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stats.blocked.toLocaleString("bg-BG")} блокирани от {(stats.attempts + stats.blocked).toLocaleString("bg-BG")} опита
                  {" · "}продуктови прегради, не сривове
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Цел: ≤ {THRESHOLDS.blocked.good}% · тревога над {THRESHOLDS.blocked.warn}%
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    start_to_download
                  </p>
                  <Download className={`h-4 w-4 ${TONE_TEXT[s2dTone]}`} />
                </div>
                <p className={`mt-2 font-serif text-4xl ${TONE_TEXT[s2dTone]}`}>
                  {stats.startToDownload}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stats.dlCount.toLocaleString("bg-BG")} от {stats.startCount.toLocaleString("bg-BG")} стартирали сесии свалят документ
                </p>
                <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Timer className="h-3 w-3" />
                  Медиана старт → сваляне: <span className="font-mono text-foreground">{fmtDuration(stats.medianMs)}</span>
                </p>
              </div>
            </section>

            {/* Дневна серия */}
            <section className="rounded-2xl border border-border/60 bg-card p-6">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 font-serif text-lg text-foreground">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  Дневна динамика
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  червено = fail% · жълто = blocked% · зелено = start→download%
                </p>
              </div>
              {stats.series.length === 0 ? (
                <p className="text-sm text-muted-foreground">Няма данни за периода.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Ден</th>
                        <th className="py-2 pr-3 font-medium">Опити</th>
                        <th className="py-2 pr-3 font-medium">Fail rate</th>
                        <th className="py-2 pr-3 font-medium">Blocked rate</th>
                        <th className="py-2 pr-3 font-medium">Start → Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.series.map((d) => {
                        const ft = toneFor("fail", d.failRate);
                        const bt = toneFor("blocked", d.blockedRate);
                        const st = toneFor("startToDownload", d.startToDownload);
                        return (
                          <tr key={d.day} className="border-b border-border/40 last:border-0">
                            <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{d.day}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{d.attempts}</td>
                            {[
                              { v: d.failRate, tone: ft },
                              { v: d.blockedRate, tone: bt },
                              { v: d.startToDownload, tone: st },
                            ].map((cell, i) => (
                              <td key={i} className="py-2 pr-3">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className={`h-full rounded-full ${TONE_BAR[cell.tone]}`}
                                      style={{ width: `${Math.min(100, Math.max(2, cell.v))}%` }}
                                    />
                                  </div>
                                  <span className={`font-mono text-xs font-semibold ${TONE_TEXT[cell.tone]}`}>
                                    {cell.v}%
                                  </span>
                                </div>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Причини за провал */}
              <section className="rounded-2xl border border-border/60 bg-card p-6">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="font-serif text-lg text-foreground">Причини за технически провал</h2>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {stats.fail.toLocaleString("bg-BG")} общо
                  </span>
                </div>
                {stats.topFails.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/60 p-4 text-xs text-muted-foreground">
                    Няма регистрирани технически провали в този период. 🎉
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {stats.topFails.map(([reason, count]) => (
                      <li key={reason}>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate text-muted-foreground" title={reason}>{reason}</span>
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
              </section>

              {/* Причини за блокиране */}
              <section className="rounded-2xl border border-border/60 bg-card p-6">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="font-serif text-lg text-foreground">Продуктови прегради (blocked)</h2>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {stats.blocked.toLocaleString("bg-BG")} общо
                  </span>
                </div>
                {stats.topBlocked.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/60 p-4 text-xs text-muted-foreground">
                    Няма блокирани опити в този период.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {stats.topBlocked.map(([reason, count]) => (
                      <li key={reason}>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate text-muted-foreground" title={reason}>{reason}</span>
                          <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">{count}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-amber-500/70"
                            style={{ width: `${Math.round((count / stats.topBlocked[0][1]) * 100)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {/* Най-проблемни шаблони */}
            <section className="rounded-2xl border border-border/60 bg-card p-6">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-serif text-lg text-foreground">Шаблони с най-висок fail rate</h2>
                <span className="text-[11px] text-muted-foreground">минимум 3 опита</span>
              </div>
              {stats.worstDocs.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/60 p-4 text-xs text-muted-foreground">
                  Няма достатъчно данни по шаблони за този период.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Шаблон</th>
                        <th className="py-2 pr-3 font-medium">Опити</th>
                        <th className="py-2 pr-3 font-medium">Провали</th>
                        <th className="py-2 pr-3 font-medium">Fail rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.worstDocs.map((d) => {
                        const t = toneFor("fail", d.rate);
                        return (
                          <tr key={d.key} className="border-b border-border/40 last:border-0">
                            <td className="max-w-[280px] truncate py-2 pr-3 font-mono text-xs text-foreground" title={d.key}>
                              {d.key}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">{d.attempts}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{d.fail}</td>
                            <td className={`py-2 pr-3 font-mono text-xs font-semibold ${TONE_TEXT[t]}`}>
                              {d.rate}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <p className="text-xs text-muted-foreground">
              Данните са агрегати от анонимни сесии (funnel_events) — без лични данни.
              Блокираните опити (needs_confirmation, квота, логин) са изключени от fail rate,
              за да не изкривяват картината за техническата стабилност.
            </p>
          </div>
        )}
      </main>
    </>
  );
}

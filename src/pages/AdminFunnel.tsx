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

    const totalSessions = new Set(rows.map((r) => r.session_id)).size;

    return { counts, conv, topEvents, days, maxDay, totalSessions };
  }, [rows]);

  return (
    <>
      <Seo title="Funnel · Admin" description="Marketing funnel performance" noindex />
      <Header />
      <main className="container mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl text-foreground sm:text-4xl">
              Funnel Dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Landing → Educate → Analyze → Convert · {stats.totalSessions.toLocaleString("bg-BG")} уникални сесии
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
            {/* Funnel */}
            <section className="rounded-2xl border border-border/60 bg-card p-6">
              <h2 className="mb-4 font-serif text-lg text-foreground">Conversion фуния</h2>
              <div className="grid gap-3 sm:grid-cols-4">
                {STEP_LABELS.map((label, i) => {
                  const c = stats.counts[i];
                  const pct = stats.conv[i];
                  const widthPct = stats.counts[0] > 0 ? Math.max(8, Math.round((c / stats.counts[0]) * 100)) : 8;
                  return (
                    <div key={label} className="rounded-xl border border-border/40 bg-background/60 p-4">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          Step {i + 1}
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {pct}%
                        </span>
                      </div>
                      <div className="mt-1 font-serif text-2xl text-foreground">
                        {c.toLocaleString("bg-BG")}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                % спрямо предходната стъпка · уникални сесии.
              </p>
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

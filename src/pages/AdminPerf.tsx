import { useEffect, useState } from "react";
import { onLCP, onCLS, onINP, onFCP, onTTFB, type Metric } from "web-vitals";
import { Seo } from "@/components/Seo";
import { FieldWebVitals } from "@/components/admin/FieldWebVitals";

type Row = { name: string; value: number; rating: string; ts: number };

const KEY = "dogovori:perf-log";

const rate = (v: Row) => {
  const c =
    v.rating === "good"
      ? "text-emerald-500"
      : v.rating === "needs-improvement"
        ? "text-amber-500"
        : "text-red-500";
  return <span className={c}>{v.rating}</span>;
};

const fmt = (name: string, value: number) => {
  if (name === "CLS") return value.toFixed(3);
  return Math.round(value) + " ms";
};

export default function AdminPerf() {
  const [rows, setRows] = useState<Row[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [nav, setNav] = useState<PerformanceNavigationTiming | null>(null);
  const [resources, setResources] = useState<PerformanceResourceTiming[]>([]);

  useEffect(() => {
    const push = (m: Metric) => {
      const row: Row = { name: m.name, value: m.value, rating: m.rating, ts: Date.now() };
      setRows((prev) => {
        const next = [row, ...prev].slice(0, 100);
        localStorage.setItem(KEY, JSON.stringify(next));
        return next;
      });
    };
    onLCP(push);
    onCLS(push);
    onINP(push);
    onFCP(push);
    onTTFB(push);

    const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (n) setNav(n);
    const r = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    setResources([...r].sort((a, b) => b.duration - a.duration).slice(0, 15));
  }, []);

  const latest = (name: string) => rows.find((r) => r.name === name);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <Seo title="Performance – Admin" description="Web Vitals & network timings" />
      <h1 className="text-2xl font-semibold">Performance Metrics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Web Vitals (LCP, CLS, INP, FCP, TTFB) и network timings за текущата сесия. Лог се пази локално (последни 100).
      </p>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(["LCP", "CLS", "INP", "FCP", "TTFB"] as const).map((k) => {
          const r = latest(k);
          return (
            <div key={k} className="rounded-lg border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="mt-1 text-lg font-semibold">{r ? fmt(k, r.value) : "—"}</div>
              <div className="text-[11px]">{r ? rate(r) : <span className="text-muted-foreground">pending</span>}</div>
            </div>
          );
        })}
      </section>

      {nav && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Navigation Timing</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>TTFB: <b>{Math.round(nav.responseStart - nav.requestStart)} ms</b></div>
            <div>DOM Interactive: <b>{Math.round(nav.domInteractive)} ms</b></div>
            <div>DOMContentLoaded: <b>{Math.round(nav.domContentLoadedEventEnd)} ms</b></div>
            <div>Load: <b>{Math.round(nav.loadEventEnd)} ms</b></div>
            <div>Transfer: <b>{(nav.transferSize / 1024).toFixed(1)} KB</b></div>
            <div>Encoded: <b>{(nav.encodedBodySize / 1024).toFixed(1)} KB</b></div>
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Slowest resources</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2">URL</th>
                <th className="p-2">Type</th>
                <th className="p-2 text-right">Duration</th>
                <th className="p-2 text-right">Size</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="max-w-[420px] truncate p-2" title={r.name}>{r.name.replace(window.location.origin, "")}</td>
                  <td className="p-2">{r.initiatorType}</td>
                  <td className="p-2 text-right">{Math.round(r.duration)} ms</td>
                  <td className="p-2 text-right">{(r.transferSize / 1024).toFixed(1)} KB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Web Vitals log</h2>
          <button
            onClick={() => {
              localStorage.removeItem(KEY);
              setRows([]);
            }}
            className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted"
          >
            Clear log
          </button>
        </div>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2">Time</th>
                <th className="p-2">Metric</th>
                <th className="p-2 text-right">Value</th>
                <th className="p-2">Rating</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-2">{new Date(r.ts).toLocaleTimeString()}</td>
                  <td className="p-2 font-medium">{r.name}</td>
                  <td className="p-2 text-right">{fmt(r.name, r.value)}</td>
                  <td className="p-2">{rate(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <FieldWebVitals />

      <LoadtestHistorySection />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Load-test history
// -----------------------------------------------------------------------------

type LoadtestRun = {
  ts: number;
  label: string;
  vus: number;
  duration_ms: number;
  http_reqs: number;
  http_req_failed_rate: number;
  http_req_duration_p95: number;
  http_req_duration_avg: number;
  notes?: string;
};

const LOADTEST_KEY = "dogovori:loadtest-history";

function readLoadtestHistory(): LoadtestRun[] {
  try {
    const arr = JSON.parse(localStorage.getItem(LOADTEST_KEY) || "[]");
    if (!Array.isArray(arr)) return [];
    return arr as LoadtestRun[];
  } catch {
    return [];
  }
}

/**
 * Local-storage backed history of k6 load-test runs. Paste the JSON that
 * `k6 run --summary-export=... scripts/loadtest/mixed.k6.js` produces (or the
 * minimal shape above) and it renders as a comparable timeline. Keeping this
 * client-side means no extra table on the DB and no cost when unused.
 */
function LoadtestHistorySection() {
  const [runs, setRuns] = useState<LoadtestRun[]>(() => readLoadtestHistory());
  const [raw, setRaw] = useState("");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const persist = (next: LoadtestRun[]) => {
    setRuns(next);
    try {
      localStorage.setItem(LOADTEST_KEY, JSON.stringify(next));
    } catch {}
  };

  const importJson = () => {
    setErr(null);
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      setErr("Невалиден JSON");
      return;
    }
    // Accept either the raw k6 summary export or the compact shape above.
    const m = parsed?.metrics ?? {};
    const run: LoadtestRun = {
      ts: Date.now(),
      label: label.trim() || `Run ${new Date().toLocaleString()}`,
      vus: Number(m?.vus_max?.max ?? parsed?.vus ?? 0),
      duration_ms: Number(parsed?.state?.testRunDurationMs ?? parsed?.duration_ms ?? 0),
      http_reqs: Number(m?.http_reqs?.count ?? parsed?.http_reqs ?? 0),
      http_req_failed_rate: Number(m?.http_req_failed?.rate ?? parsed?.http_req_failed_rate ?? 0),
      http_req_duration_p95: Number(m?.http_req_duration?.["p(95)"] ?? parsed?.http_req_duration_p95 ?? 0),
      http_req_duration_avg: Number(m?.http_req_duration?.avg ?? parsed?.http_req_duration_avg ?? 0),
      notes: parsed?.notes,
    };
    persist([run, ...runs].slice(0, 50));
    setRaw("");
    setLabel("");
  };

  const clearAll = () => persist([]);

  const failColor = (rate: number) =>
    rate < 0.005 ? "text-emerald-500" : rate < 0.02 ? "text-amber-500" : "text-red-500";

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Load-test history</h2>
          <p className="text-xs text-muted-foreground">
            Paste the JSON summary from{" "}
            <code className="rounded bg-muted px-1">k6 run --summary-export=...</code>{" "}
            (scripts/loadtest/mixed.k6.js) to track how each optimisation moves p95 / error rate.
          </p>
        </div>
        {runs.length > 0 && (
          <button
            onClick={clearAll}
            className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted"
          >
            Clear history
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. after-indexes, baseline, batched-pageviews)"
          className="rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
        <button
          onClick={importJson}
          disabled={!raw.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          Add run
        </button>
      </div>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder='Paste k6 --summary-export JSON here…'
        rows={5}
        className="mt-2 w-full rounded-md border border-border bg-card p-2 font-mono text-xs"
      />
      {err && <div className="mt-1 text-xs text-red-500">{err}</div>}

      {runs.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No runs recorded yet. Follow scripts/loadtest/README.md to produce a summary JSON.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2">When</th>
                <th className="p-2">Label</th>
                <th className="p-2 text-right">VUs</th>
                <th className="p-2 text-right">Requests</th>
                <th className="p-2 text-right">p95 dur</th>
                <th className="p-2 text-right">avg dur</th>
                <th className="p-2 text-right">Fail %</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.ts} className="border-t border-border">
                  <td className="p-2 whitespace-nowrap">{new Date(r.ts).toLocaleString()}</td>
                  <td className="p-2 font-medium">{r.label}</td>
                  <td className="p-2 text-right">{r.vus || "—"}</td>
                  <td className="p-2 text-right">{r.http_reqs.toLocaleString()}</td>
                  <td className="p-2 text-right">{Math.round(r.http_req_duration_p95)} ms</td>
                  <td className="p-2 text-right">{Math.round(r.http_req_duration_avg)} ms</td>
                  <td className={`p-2 text-right ${failColor(r.http_req_failed_rate)}`}>
                    {(r.http_req_failed_rate * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}


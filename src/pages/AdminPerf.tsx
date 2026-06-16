import { useEffect, useState } from "react";
import { onLCP, onCLS, onINP, onFCP, onTTFB, type Metric } from "web-vitals";
import { Seo } from "@/components/Seo";

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
    </div>
  );
}

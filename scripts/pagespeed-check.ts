/**
 * PageSpeed Insights (Lighthouse) check for key SEO pages.
 *
 * Runs the Google PSI API against a curated list of high-value routes
 * on mobile (default) or desktop, prints a markdown report, emits
 * GitHub Actions annotations on regressions, and exits non-zero when
 * any score falls below the configured thresholds.
 *
 * Env:
 *   PSI_API_KEY      — optional Google API key (higher quota)
 *   PSI_BASE_URL     — origin to test (default https://dogovori.net)
 *   PSI_STRATEGY     — "mobile" | "desktop" (default mobile)
 *   PSI_MIN_PERF     — performance threshold 0–100 (default 80)
 *   PSI_MIN_SEO      — SEO threshold (default 95)
 *   PSI_MIN_A11Y     — accessibility threshold (default 90)
 *   PSI_MIN_BP       — best-practices threshold (default 90)
 *   PSI_WEBHOOK_URL  — optional Slack-compatible webhook for alerts
 *   GITHUB_STEP_SUMMARY — set by GitHub Actions; gets a markdown report
 *
 * Usage:
 *   bunx tsx scripts/pagespeed-check.ts
 *   PSI_STRATEGY=desktop bunx tsx scripts/pagespeed-check.ts
 */

import { appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const BASE_URL = process.env.PSI_BASE_URL ?? "https://dogovori.net";
const STRATEGY = (process.env.PSI_STRATEGY ?? "mobile") as "mobile" | "desktop";
const API_KEY = process.env.PSI_API_KEY ?? "";
const WEBHOOK = process.env.PSI_WEBHOOK_URL ?? "";

const THRESHOLDS = {
  performance: Number(process.env.PSI_MIN_PERF ?? 80),
  seo: Number(process.env.PSI_MIN_SEO ?? 95),
  accessibility: Number(process.env.PSI_MIN_A11Y ?? 90),
  "best-practices": Number(process.env.PSI_MIN_BP ?? 90),
};

// Core Web Vitals thresholds (Google "good" bands: LCP ≤ 2500ms, CLS ≤ 0.1, INP ≤ 200ms).
// Override per environment via env vars (e.g. PSI_MAX_LCP_MS=2200 for stricter alerts).
const CWV_THRESHOLDS = {
  lcpMs: Number(process.env.PSI_MAX_LCP_MS ?? 2500),
  cls: Number(process.env.PSI_MAX_CLS ?? 0.1),
  inpMs: Number(process.env.PSI_MAX_INP_MS ?? 200),
};

// Key SEO routes — keep small to stay within PSI quota.
const ROUTES = [
  "/",
  "/catalog",
  "/build",
  "/blog",
  "/sektor/employment",
  "/sektor/real-estate",
  "/sektor/digital",
];

type CategoryKey = keyof typeof THRESHOLDS;

interface PageReport {
  url: string;
  scores: Record<CategoryKey, number>;
  metrics: { lcp?: number; cls?: number; inp?: number; tbt?: number; fcp?: number };
  error?: string;
}

async function runPsi(url: string): Promise<PageReport> {
  const params = new URLSearchParams({ url, strategy: STRATEGY });
  for (const c of ["performance", "seo", "accessibility", "best-practices"]) {
    params.append("category", c);
  }
  if (API_KEY) params.set("key", API_KEY);

  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    return {
      url,
      scores: { performance: 0, seo: 0, accessibility: 0, "best-practices": 0 },
      metrics: {},
      error: `HTTP ${res.status} ${res.statusText}`,
    };
  }
  const json: any = await res.json();
  const cats = json?.lighthouseResult?.categories ?? {};
  const audits = json?.lighthouseResult?.audits ?? {};
  const score = (k: string) => Math.round(((cats[k]?.score ?? 0) as number) * 100);
  return {
    url,
    scores: {
      performance: score("performance"),
      seo: score("seo"),
      accessibility: score("accessibility"),
      "best-practices": score("best-practices"),
    },
    metrics: {
      lcp: audits["largest-contentful-paint"]?.numericValue,
      cls: audits["cumulative-layout-shift"]?.numericValue,
      inp: audits["interaction-to-next-paint"]?.numericValue,
      tbt: audits["total-blocking-time"]?.numericValue,
      fcp: audits["first-contentful-paint"]?.numericValue,
    },
  };
}

function ghAnnotate(level: "warning" | "error", file: string, msg: string) {
  if (!process.env.GITHUB_ACTIONS) return;
  const safe = msg.replace(/\r?\n/g, "%0A");
  console.log(`::${level} file=${file}::${safe}`);
}

function fmtMs(n?: number) {
  return n == null ? "—" : `${Math.round(n)} ms`;
}

async function main() {
  console.log(`▶ PageSpeed check (${STRATEGY}) for ${BASE_URL}`);
  console.log(`  Thresholds: ${JSON.stringify(THRESHOLDS)}`);

  const reports: PageReport[] = [];
  for (const path of ROUTES) {
    const url = `${BASE_URL}${path}`;
    process.stdout.write(`  • ${path} … `);
    try {
      const r = await runPsi(url);
      reports.push(r);
      console.log(r.error ? `ERROR ${r.error}` : JSON.stringify(r.scores));
    } catch (e: any) {
      reports.push({
        url,
        scores: { performance: 0, seo: 0, accessibility: 0, "best-practices": 0 },
        metrics: {},
        error: e?.message ?? String(e),
      });
      console.log(`ERROR ${e?.message ?? e}`);
    }
    await new Promise((r) => setTimeout(r, 1500)); // rate-limit
  }

  // Aggregate regressions
  const regressions: string[] = [];
  for (const r of reports) {
    if (r.error) {
      regressions.push(`${r.url}: ${r.error}`);
      ghAnnotate("error", "scripts/pagespeed-check.ts", `${r.url} failed: ${r.error}`);
      continue;
    }
    for (const k of Object.keys(THRESHOLDS) as CategoryKey[]) {
      if (r.scores[k] < THRESHOLDS[k]) {
        const msg = `${r.url} — ${k} ${r.scores[k]} < ${THRESHOLDS[k]}`;
        regressions.push(msg);
        ghAnnotate("warning", "scripts/pagespeed-check.ts", msg);
      }
    }
    // Core Web Vitals — explicit thresholds so Slack fires on slow LCP/INP/CLS
    // even when the aggregate performance score still passes.
    if (r.metrics.lcp != null && r.metrics.lcp > CWV_THRESHOLDS.lcpMs) {
      const msg = `${r.url} — LCP ${Math.round(r.metrics.lcp)}ms > ${CWV_THRESHOLDS.lcpMs}ms`;
      regressions.push(msg);
      ghAnnotate("warning", "scripts/pagespeed-check.ts", msg);
    }
    if (r.metrics.cls != null && r.metrics.cls > CWV_THRESHOLDS.cls) {
      const msg = `${r.url} — CLS ${r.metrics.cls.toFixed(3)} > ${CWV_THRESHOLDS.cls}`;
      regressions.push(msg);
      ghAnnotate("warning", "scripts/pagespeed-check.ts", msg);
    }
    if (r.metrics.inp != null && r.metrics.inp > CWV_THRESHOLDS.inpMs) {
      const msg = `${r.url} — INP ${Math.round(r.metrics.inp)}ms > ${CWV_THRESHOLDS.inpMs}ms`;
      regressions.push(msg);
      ghAnnotate("warning", "scripts/pagespeed-check.ts", msg);
    }
  }

  // Markdown report
  const lines: string[] = [];
  lines.push(`## PageSpeed report (${STRATEGY})`);
  lines.push("");
  lines.push("| Page | Perf | SEO | A11y | BP | LCP | CLS | INP | TBT |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const r of reports) {
    const s = r.scores;
    lines.push(
      `| ${r.url.replace(BASE_URL, "") || "/"} | ${s.performance} | ${s.seo} | ${s.accessibility} | ${s["best-practices"]} | ${fmtMs(r.metrics.lcp)} | ${r.metrics.cls?.toFixed(3) ?? "—"} | ${fmtMs(r.metrics.inp)} | ${fmtMs(r.metrics.tbt)} |`,
    );
  }
  if (regressions.length) {
    lines.push("");
    lines.push(`### ⚠ Regressions (${regressions.length})`);
    for (const r of regressions) lines.push(`- ${r}`);
  } else {
    lines.push("");
    lines.push("✅ All pages passed thresholds.");
  }
  const md = lines.join("\n");
  console.log("\n" + md);

  // GitHub job summary
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, md + "\n");

  // Persist JSON artifact
  const out = `reports/pagespeed-${STRATEGY}.json`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify({ baseUrl: BASE_URL, strategy: STRATEGY, ranAt: new Date().toISOString(), thresholds: THRESHOLDS, reports }, null, 2),
  );

  // Webhook on regression
  if (regressions.length && WEBHOOK) {
    try {
      await fetch(WEBHOOK, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: `🚨 PageSpeed regressions on ${BASE_URL} (${STRATEGY}):\n` + regressions.map((r) => `• ${r}`).join("\n"),
        }),
      });
    } catch (e) {
      console.warn("Webhook failed:", e);
    }
  }

  if (regressions.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

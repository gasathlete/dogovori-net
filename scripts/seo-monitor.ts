/**
 * Daily SEO monitor.
 *
 * Crawls a curated set of key routes (plus a sample from sitemap.xml)
 * and validates the basics that break ranking when they regress:
 *   - HTTP status (no 404 / 5xx)
 *   - <title> present, ≤ 60 chars
 *   - <meta name="description"> present, ≤ 160 chars
 *   - <link rel="canonical"> present and absolute https://
 *   - exactly one <h1>
 *   - <meta name="robots"> does not contain "noindex"
 *   - HTTP X-Robots-Tag and Googlebot directives do not prevent indexing
 *   - canonical matches the requested URL (detects homepage SPA fallbacks)
 *
 * Also probes a known-bad URL to confirm the SPA returns a real 404
 * (Lovable preview returns 200 with SPA HTML — that's a known accepted
 * limitation; we report it as a warning, not a failure).
 *
 * Emits GitHub annotations, a markdown summary, JSON artifact, and
 * optional Slack webhook on regressions.
 *
 * Env:
 *   SEO_BASE_URL     — default https://dogovori.net
 *   SEO_SITEMAP_URL  — default {base}/sitemap.xml
 *   SEO_SAMPLE_SIZE  — random pages from sitemap to check (default 15)
 *   SEO_WEBHOOK_URL  — optional Slack-compatible alert webhook
 */

import { appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { crawlSitemaps } from "./lib/sitemapCrawl";
import { assessIndexability, PUBLIC_SEO_ROUTES } from "./lib/indexability";

const BASE = (process.env.SEO_BASE_URL ?? "https://dogovori.net").replace(/\/$/, "");
const SITEMAP = process.env.SEO_SITEMAP_URL ?? `${BASE}/sitemap.xml`;
const SAMPLE = Number(process.env.SEO_SAMPLE_SIZE ?? 15);
const WEBHOOK = process.env.SEO_WEBHOOK_URL ?? "";

const CRITICAL_ROUTES = PUBLIC_SEO_ROUTES;

interface Issue {
  url: string;
  level: "error" | "warning";
  rule: string;
  message: string;
}

const issues: Issue[] = [];

function add(level: "error" | "warning", url: string, rule: string, message: string) {
  issues.push({ level, url, rule, message });
}

function pick<T>(arr: T[], n: number): T[] {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c.slice(0, n);
}

async function fetchSitemap(): Promise<string[]> {
  const result = await crawlSitemaps(SITEMAP, BASE, async (u) => {
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(20000), headers: { "user-agent": "DogovoriSEOMonitor/1.0" } });
    return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : "" };
  });
  console.log(`  sitemaps visited: ${result.sitemapsVisited.length}`);
  for (const p of result.problems) add("error", p.url, "sitemap", p.message);
  if (!result.pages.length) add("error", SITEMAP, "sitemap-empty", "No indexable URLs discovered");
  return result.pages;
}

async function check(url: string) {
  try {
    // Redirects are surfaced instead of following a sitemap URL to a different page.
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20000), headers: { "user-agent": "DogovoriSEOMonitor/1.0" } });
    const html = await res.text();
    for (const issue of assessIndexability(url, res.status, html, res.headers)) add(issue.level, url, issue.rule, issue.message);
  } catch (error) {
    add("error", url, "network", error instanceof Error ? error.message : String(error));
  }
}

async function check404Behavior() {
  const url = `${BASE}/__definitely-not-a-real-page-${Date.now()}`;
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20000) });
    if (res.status === 200) {
      add(
        "warning",
        url,
        "404",
        "Unknown route returned HTTP 200 (SPA fallback). Consider a hosting-level 404 for crawlers.",
      );
    }
  } catch {
    /* ignore */
  }
}

function ghAnnotate(i: Issue) {
  if (!process.env.GITHUB_ACTIONS) return;
  const lvl = i.level === "error" ? "error" : "warning";
  const safe = `${i.url} [${i.rule}] ${i.message}`.replace(/\r?\n/g, "%0A");
  console.log(`::${lvl} file=scripts/seo-monitor.ts::${safe}`);
}

async function main() {
  console.log(`▶ SEO monitor for ${BASE}`);
  const sitemapUrls = await fetchSitemap();
  console.log(`  sitemap: ${sitemapUrls.length} urls`);

  const urls = new Set<string>(CRITICAL_ROUTES.map((p) => `${BASE}${p}`));
  for (const u of pick(sitemapUrls, SAMPLE)) urls.add(u);

  for (const u of urls) {
    process.stdout.write(`  • ${u.replace(BASE, "") || "/"} … `);
    const before = issues.length;
    await check(u);
    const delta = issues.length - before;
    console.log(delta === 0 ? "ok" : `${delta} issue(s)`);
  }
  await check404Behavior();

  for (const i of issues) ghAnnotate(i);

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  const md: string[] = [];
  md.push(`## SEO monitor — ${BASE}`);
  md.push("");
  md.push(`Pages checked: **${urls.size}** · Errors: **${errors.length}** · Warnings: **${warnings.length}**`);
  md.push("");
  if (issues.length) {
    md.push("| Level | URL | Rule | Message |");
    md.push("|---|---|---|---|");
    for (const i of issues) {
      md.push(`| ${i.level} | ${i.url.replace(BASE, "") || "/"} | ${i.rule} | ${i.message} |`);
    }
  } else {
    md.push("✅ No issues detected.");
  }
  const report = md.join("\n");
  console.log("\n" + report);

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, report + "\n");

  const out = "reports/seo-monitor.json";
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      { base: BASE, ranAt: new Date().toISOString(), checked: urls.size, errors: errors.length, warnings: warnings.length, issues },
      null,
      2,
    ),
  );

  if (errors.length && WEBHOOK) {
    try {
      await fetch(WEBHOOK, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text:
            `🚨 SEO regressions on ${BASE} — ${errors.length} error(s), ${warnings.length} warning(s):\n` +
            errors.slice(0, 10).map((i) => `• [${i.rule}] ${i.url} — ${i.message}`).join("\n"),
        }),
      });
    } catch (e) {
      console.warn("Webhook failed:", e);
    }
  }

  if (errors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

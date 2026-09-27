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
 *   - og:title, og:description, og:image present
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

const BASE = (process.env.SEO_BASE_URL ?? "https://dogovori.net").replace(/\/$/, "");
const SITEMAP = process.env.SEO_SITEMAP_URL ?? `${BASE}/sitemap.xml`;
const SAMPLE = Number(process.env.SEO_SAMPLE_SIZE ?? 15);
const WEBHOOK = process.env.SEO_WEBHOOK_URL ?? "";

const CRITICAL_ROUTES = ["/", "/catalog", "/build", "/blog", "/contacts", "/auth"];

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

function attr(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

async function fetchSitemap(): Promise<string[]> {
  const result = await crawlSitemaps(SITEMAP, BASE, async (u) => {
    const res = await fetch(u, { headers: { "user-agent": "DogovoriSEOMonitor/1.0" } });
    return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : "" };
  });
  console.log(`  sitemaps visited: ${result.sitemapsVisited.length}`);
  for (const p of result.problems) add("warning", p.url, "sitemap", p.message);
  return result.pages;
}

async function check(url: string) {
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow", headers: { "user-agent": "DogovoriSEOMonitor/1.0" } });
  } catch (e: any) {
    add("error", url, "network", e?.message ?? String(e));
    return;
  }

  if (res.status >= 500) add("error", url, "status", `HTTP ${res.status}`);
  else if (res.status === 404) add("error", url, "status", `HTTP 404`);
  else if (res.status >= 400) add("warning", url, "status", `HTTP ${res.status}`);

  const html = await res.text();

  const title = attr(html, /<title[^>]*>([^<]*)<\/title>/i);
  if (!title) add("error", url, "title", "missing <title>");
  else if (title.length > 60) add("warning", url, "title", `title ${title.length} chars > 60`);

  const desc = attr(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  if (!desc) add("error", url, "description", "missing meta description");
  else if (desc.length > 160) add("warning", url, "description", `description ${desc.length} chars > 160`);

  const canonical = attr(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (!canonical) add("error", url, "canonical", "missing rel=canonical");
  else if (!/^https:\/\//.test(canonical)) add("error", url, "canonical", `canonical not absolute https: ${canonical}`);

  const h1Count = (html.match(/<h1\b/gi) ?? []).length;
  if (h1Count === 0) add("warning", url, "h1", "no <h1> found");
  else if (h1Count > 1) add("warning", url, "h1", `${h1Count} <h1> elements`);

  const robots = attr(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i);
  if (robots && /noindex/i.test(robots)) add("error", url, "robots", `noindex on indexable page: ${robots}`);

  for (const p of ["og:title", "og:description", "og:image"]) {
    const re = new RegExp(`<meta[^>]+property=["']${p}["'][^>]+content=["']([^"']*)["']`, "i");
    const v = attr(html, re);
    if (!v) add("warning", url, p, `missing ${p}`);
  }
}

async function check404Behavior() {
  const url = `${BASE}/__definitely-not-a-real-page-${Date.now()}`;
  try {
    const res = await fetch(url);
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

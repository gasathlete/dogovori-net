// Post-build SEO verification.
//
// Reads every URL from public/sitemap*.xml and verifies in dist/:
//   1. The corresponding prerendered file exists (or the SPA index.html fallback).
//   2. <link rel="canonical"> is present, absolute https://, and matches the
//      sitemap URL exactly (no trailing-slash drift, no host mismatch).
//   3. <meta name="robots"> does not contain noindex.
//   4. No accidental meta-refresh redirect tag.
//
// This catches regressions BEFORE we publish — a wrong canonical or stray
// noindex is the most common cause of "Alternate page with proper canonical
// tag" and "Excluded by 'noindex' tag" reports in Google Search Console.
//
// Usage: bun run scripts/verify-seo-urls.ts
// Set SEO_VERIFY_STRICT=1 to fail the build on warnings too.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { ONE_TIME_PRODUCTS } from "../src/lib/products";
import { fmtEur } from "../src/lib/pricing";
import { allTemplates } from "../src/lib/templateIndex";
import { buildCollectionPages } from "./lib/collectionPages";
import { loadPublishedBlogPosts } from "./lib/blogContent";
import { resolveDateModified } from "../src/lib/blogEditorial";
import { TEMPLATE_DISCOVERY_PROFILES } from "../src/lib/templateDiscovery";
import { renderTemplatePreparation } from "./lib/templateDiscovery";
import { CONTACT_EMAIL, CONTACT_EIK } from "../src/data/contactPublicInfo";
import { buildLegalPages } from "./lib/legalPages";
import { hasBulgarianPrimaryContent } from "../src/lib/seoText";

const SITE = "https://dogovori.net";
const DIST = resolve(process.cwd(), "dist");
const PUBLIC = resolve(process.cwd(), "public");
const STRICT = process.env.SEO_VERIFY_STRICT === "1";

// Публичните продуктови адреси — цените идват само от каноничната конфигурация.
const PRODUCT_SEO_TARGETS = [
  {
    path: "/produkti",
    price: ONE_TIME_PRODUCTS[0].priceEur,
    schemaTypes: ["BreadcrumbList", "ItemList"],
    mustContain: ONE_TIME_PRODUCTS.map((p) => fmtEur(p.priceEur)),
  },
  ...ONE_TIME_PRODUCTS.map((p) => ({
    path: `/produkti/${p.slug}`,
    price: p.priceEur,
    schemaTypes: ["BreadcrumbList", "WebPage", "Service", "FAQPage"],
    mustContain: [fmtEur(p.priceEur), p.page.h1],
  })),
];

/** Никога индексируеми: старт, плащане и резултат. */
const PRIVATE_PRODUCT_PATHS = [
  "/produkti/rezultat",
  ...ONE_TIME_PRODUCTS.map((p) => `/produkti/${p.slug}/start`),
];

type Issue = { url: string; level: "error" | "warning"; rule: string; message: string };
const issues: Issue[] = [];
const add = (level: Issue["level"], url: string, rule: string, message: string) =>
  issues.push({ level, url, rule, message });

function extractLocs(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1].trim());
}

function loadSitemapUrls(): string[] {
  const indexPath = join(PUBLIC, "sitemap.xml");
  if (!existsSync(indexPath)) {
    console.error("✗ public/sitemap.xml missing");
    process.exit(1);
  }
  const idxXml = readFileSync(indexPath, "utf8");
  const isIndex = idxXml.includes("<sitemapindex");
  const urls = new Set<string>();
  if (isIndex) {
    for (const child of extractLocs(idxXml)) {
      const filename = child.replace(SITE + "/", "");
      const p = join(PUBLIC, filename);
      if (!existsSync(p)) {
        add("error", child, "missing-child", "Child sitemap referenced but not on disk");
        continue;
      }
      for (const u of extractLocs(readFileSync(p, "utf8"))) urls.add(u);
    }
  } else {
    for (const u of extractLocs(idxXml)) urls.add(u);
  }
  return [...urls];
}

function distPathForUrl(url: string): string | null {
  const path = url.replace(SITE, "") || "/";
  // Prerendered pages live at dist/<path>/index.html (see scripts/prerender.ts).
  const candidates = [
    join(DIST, path, "index.html"),
    join(DIST, path.replace(/\/$/, "") + ".html"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

function attr(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function checkUrl(url: string) {
  const file = distPathForUrl(url);
  if (!file) {
    // SPA fallback: index.html will be served. That still needs verification.
    const fallback = join(DIST, "index.html");
    if (!existsSync(fallback)) {
      add("error", url, "missing", "No prerendered file and no SPA fallback");
      return;
    }
    add("warning", url, "not-prerendered", "Served via SPA fallback (less ideal for SEO)");
    verifyHtml(url, readFileSync(fallback, "utf8"), true);
    return;
  }
  verifyHtml(url, readFileSync(file, "utf8"), false);
}

function verifyHtml(url: string, html: string, isFallback: boolean) {
  const canonical = attr(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (!canonical) {
    add("error", url, "canonical-missing", "No <link rel=canonical> in HTML");
  } else if (!/^https:\/\//.test(canonical)) {
    add("error", url, "canonical-not-absolute", `Canonical not absolute https: ${canonical}`);
  } else if (!isFallback) {
    // For prerendered pages the canonical must match the sitemap URL exactly.
    const norm = (s: string) => s.replace(/\/$/, "");
    if (norm(canonical) !== norm(url)) {
      add("error", url, "canonical-mismatch", `Canonical "${canonical}" != sitemap URL "${url}"`);
    }
  }

  const robots = attr(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i);
  if (robots && /noindex/i.test(robots)) {
    add("error", url, "noindex", `noindex on indexable sitemap URL: ${robots}`);
  }

  if (/<meta[^>]+http-equiv=["']refresh["']/i.test(html)) {
    add("error", url, "meta-refresh", "Found <meta http-equiv=refresh> — disallowed redirect");
  }

  const title = attr(html, /<title[^>]*>([^<]*)<\/title>/i);
  if (!title) add("error", url, "title-missing", "Missing <title>");
  else if (title.length > 60) add("warning", url, "title-long", `${title.length} chars > 60`);

  const desc = attr(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  if (!desc) add("warning", url, "description-missing", "Missing meta description");
  else if (desc.length > 160) add("warning", url, "description-long", `${desc.length} chars > 160`);

  const h1Count = (html.match(/<h1\b/gi) ?? []).length;
  if (h1Count > 1) add("warning", url, "h1-multiple", `${h1Count} <h1> elements`);
}

/* --------- Строга проверка на публичните продуктови страници ---------
   Тук няма толериране на SPA fallback: липсващ файл, чуждо/общо заглавие,
   липсващ H1, липсваща цена или липсваща схема са грешки, които спират
   билда.                                                                */

const GENERIC_TITLE_MARKERS = [
  "Dogovori.net — документи и договори на български",
  "Договори и документи на български — Dogovori.net",
];

function checkProductPages() {
  const seenTitles = new Map<string, string>();
  const seenDescriptions = new Map<string, string>();

  for (const p of PRODUCT_SEO_TARGETS) {
    const url = `${SITE}${p.path}`;
    const file = join(DIST, p.path.replace(/^\//, ""), "index.html");
    if (!existsSync(file)) {
      add("error", url, "product-not-prerendered", "Няма собствен prerender файл (генеричният index.html не е достатъчен)");
      continue;
    }
    const html = readFileSync(file, "utf8");

    const title = attr(html, /<title[^>]*>([^<]*)<\/title>/i) ?? "";
    const desc = attr(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ?? "";
    const canonical = attr(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
    const robots = attr(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i) ?? "";

    if (!title || GENERIC_TITLE_MARKERS.includes(title)) {
      add("error", url, "product-generic-title", `Общо/начално заглавие: "${title}"`);
    }
    if (!desc || desc.length < 40) {
      add("error", url, "product-description", `Липсваща или твърде кратка description (${desc.length})`);
    }
    if (seenTitles.has(title)) {
      add("error", url, "product-duplicate-title", `Същото заглавие като ${seenTitles.get(title)}`);
    } else seenTitles.set(title, url);
    if (seenDescriptions.has(desc)) {
      add("error", url, "product-duplicate-description", `Същата description като ${seenDescriptions.get(desc)}`);
    } else seenDescriptions.set(desc, url);

    if (canonical !== url) {
      add("error", url, "product-canonical", `Canonical "${canonical}" != "${url}"`);
    }
    if (!/index/i.test(robots) || /noindex/i.test(robots)) {
      add("error", url, "product-robots", `Очаква се index/follow, намерено: "${robots}"`);
    }

    const h1s = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi) ?? [];
    if (h1s.length !== 1) {
      add("error", url, "product-h1", `${h1s.length} <h1> — трябва точно един`);
    }

    const root = html.match(/<div id="root">([\s\S]*?)<\/body>/i)?.[1] ?? "";
    const text = root.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 600) {
      add("error", url, "product-body", `Твърде малко видимо съдържание в #root (${text.length} знака)`);
    }
    if (!/Примерен резултат/.test(text)) {
      add("error", url, "product-sample", "Липсва обозначен примерен резултат в статичния HTML");
    }
    for (const needle of p.mustContain) {
      if (!text.includes(needle)) {
        add("error", url, "product-price", `Липсва "${needle}" в статичния текст`);
      }
    }

    const ldTypes = new Set<string>();
    for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const parsed = JSON.parse(m[1]);
        for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
          if (node && typeof node["@type"] === "string") ldTypes.add(node["@type"]);
          if (node?.["@type"] === "Service") {
            const offer = node.offers;
            if (!offer || offer.priceCurrency !== "EUR" || offer.price !== p.price.toFixed(2)) {
              add("error", url, "product-offer", `Offer не съвпада с каноничната цена ${p.price.toFixed(2)} EUR`);
            }
            if (offer && offer.url !== url) {
              add("error", url, "product-offer-url", `Offer.url "${offer?.url}" != "${url}"`);
            }
          }
        }
      } catch {
        add("error", url, "product-jsonld-parse", "Невалиден JSON-LD блок");
      }
    }
    for (const t of p.schemaTypes) {
      if (!ldTypes.has(t)) add("error", url, "product-schema", `Липсва ${t} schema`);
    }
  }

  // Частните продуктови адреси не влизат в sitemap и не са индексируеми.
  const sitemapXml = readFileSync(join(PUBLIC, "sitemap-static.xml"), "utf8");
  for (const priv of PRIVATE_PRODUCT_PATHS) {
    if (sitemapXml.includes(`${SITE}${priv}`)) {
      add("error", `${SITE}${priv}`, "private-in-sitemap", "Частен адрес присъства в sitemap-static.xml");
    }
  }
}

function checkCollectionPages(sitemapUrls: string[]) {
  const sitemap = new Set(sitemapUrls);
  for (const page of buildCollectionPages(allTemplates())) {
    const url = `${SITE}${page.path}`;
    if (!sitemap.has(url)) add("error", url, "collection-sitemap", "Collection route is missing from sitemap");
    const file = join(DIST, page.path.slice(1), "index.html");
    if (!existsSync(file)) {
      add("error", url, "collection-static", "Collection must have its own static HTML, not the homepage fallback");
      continue;
    }
    const html = readFileSync(file, "utf8");
    for (const match of page.bodyHtml.matchAll(/href="([^\"]+)"/g)) {
      if (!html.includes(match[0])) add("error", url, "collection-link", `Missing canonical collection link: ${match[1]}`);
    }
    if (!html.includes("покупката остават затворени")) add("error", url, "collection-availability", "Missing current browse-only availability");
  }
}

async function checkEditorialPages(sitemapUrls: string[]) {
  const published = await loadPublishedBlogPosts(resolve(process.cwd(), "src/content/blog"));
  const expected = new Set(published.map((post) => `${SITE}/blog/${post.slug}`));
  const actual = new Set(sitemapUrls.filter((url) => url.startsWith(`${SITE}/blog/`)));
  for (const url of new Set([...expected, ...actual])) {
    if (expected.has(url) !== actual.has(url)) add("error", url, "blog-publication", "Blog sitemap must contain exactly the published article routes");
  }
  const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const catalog = new Set(allTemplates().map((entry) => entry.slug));
  for (const post of published) {
    const url = `${SITE}/blog/${post.slug}`;
    const file = distPathForUrl(url);
    if (!file) {
      add("error", url, "blog-static", "Published article must have its own static HTML");
      continue;
    }
    const html = readFileSync(file, "utf8");
    if (!html.includes(`"dateModified":"${resolveDateModified(post)}"`)) add("error", url, "blog-date", "Article modification date differs from editorial metadata");
    for (const source of post.sources ?? []) {
      if (!html.includes(`href="${escape(source.url)}"`)) add("error", url, "blog-source", "Missing visible source link");
    }
    for (const document of post.relatedDocuments ?? []) {
      if (!catalog.has(document.slug) || !html.includes(`href="/shablon/${document.slug}"`)) add("error", url, "blog-document", `Missing canonical document: ${document.slug}`);
    }
    if (post.cta && !html.includes(`href="${escape(post.cta.href)}"`)) add("error", url, "blog-cta", "Missing article-specific next step");
  }
  for (const profile of TEMPLATE_DISCOVERY_PROFILES) {
    const url = `${SITE}/shablon/${profile.slug}`;
    const file = distPathForUrl(url);
    if (!catalog.has(profile.slug) || !file || !readFileSync(file, "utf8").includes(renderTemplatePreparation(profile.slug))) {
      add("error", url, "template-preparation", "Missing canonical page or shared preparation content");
    }
  }
}

async function main() {
  if (!existsSync(DIST)) {
    console.error("✗ dist/ not found — run vite build first");
    process.exit(1);
  }
  const urls = loadSitemapUrls();
  console.log(`▶ verifying ${urls.length} URLs from sitemaps…`);
  for (const u of urls) checkUrl(u);
  for (const policy of await buildLegalPages()) {
    const file = distPathForUrl(`${SITE}${policy.path}`);
    if (!file || !readFileSync(file, "utf8").includes(policy.bodyHtml)) {
      add("error", `${SITE}${policy.path}`, "legal-static", "Policy HTML must render the complete current approved source, not a copied summary");
    }
  }
  for (const url of urls) {
    const path = new URL(url).pathname;
    if (!hasBulgarianPrimaryContent(path)) continue;
    const canonicalFile = distPathForUrl(url);
    const aliasFile = join(DIST, `en${path}`, "index.html");
    if (!canonicalFile || !existsSync(aliasFile) || readFileSync(aliasFile, "utf8") !== readFileSync(canonicalFile, "utf8")) {
      add("error", `${SITE}/en${path}`, "locale-alias", "Bulgarian-content alias must serve identical initial HTML and the Bulgarian canonical");
    }
    if (urls.includes(`${SITE}/en${path}`)) add("error", url, "locale-sitemap", "Do not submit duplicate UI-language aliases in sitemaps");
  }
  const contactsFile = distPathForUrl(`${SITE}/contacts`);
  if (!contactsFile || !readFileSync(contactsFile, "utf8").includes(CONTACT_EMAIL) || !readFileSync(contactsFile, "utf8").includes(CONTACT_EIK)) {
    add("error", `${SITE}/contacts`, "contacts-static", "Missing dedicated contact HTML with shared public trader facts");
  }
  checkProductPages();
  checkCollectionPages(urls);
  await checkEditorialPages(urls);


  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  // Group warnings by rule for readable output.
  if (warnings.length) {
    const byRule = new Map<string, number>();
    for (const w of warnings) byRule.set(w.rule, (byRule.get(w.rule) ?? 0) + 1);
    console.log("\nWarnings:");
    for (const [rule, n] of byRule) console.log(`  • ${rule}: ${n}`);
  }

  if (errors.length) {
    console.error(`\n✗ ${errors.length} ERROR(s):`);
    for (const e of errors.slice(0, 50)) console.error(`  [${e.rule}] ${e.url} — ${e.message}`);
    if (errors.length > 50) console.error(`  …and ${errors.length - 50} more`);
    process.exit(1);
  }

  if (STRICT && warnings.length) {
    console.error(`\n✗ strict mode: ${warnings.length} warning(s) treated as failures`);
    process.exit(1);
  }

  console.log(`\n✓ SEO verification passed (${urls.length} URLs, ${warnings.length} warnings)`);
}

await main();

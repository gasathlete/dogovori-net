// Post-build sanity check.
// Fails the build if SEO-critical files are missing from dist/.
//
// Usage: bun run scripts/verify-build.ts

import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DIST = resolve(process.cwd(), "dist");
const required = [
  {
    path: "sitemap.xml",
    minBytes: 500,
    validate: (content: string) => content.includes("<urlset") || content.includes("<sitemapindex"),
    errorMessage: 'missing either "<urlset" or "<sitemapindex"',
  },
  { path: "robots.txt", minBytes: 20, mustContain: "Sitemap:" },
  { path: "index.html", minBytes: 500, mustContain: "<html" },
];

function localAssetPaths(source: string): string[] {
  const paths = new Set<string>();
  const add = (raw: string) => {
    const clean = raw.trim().split(/[?#]/, 1)[0];
    if (clean.startsWith("/assets/") || clean.startsWith("/hero/") || clean.startsWith("assets/")) {
      paths.add(clean.replace(/^\//, ""));
    }
  };
  for (const match of source.matchAll(/\b(?:src|href)="([^"]+)"/g)) add(match[1]);
  for (const match of source.matchAll(/\bsrcset="([^"]+)"/g)) {
    for (const candidate of match[1].split(",")) add(candidate.trim().split(/\s+/, 1)[0]);
  }
  for (const match of source.matchAll(/url\((?:"|')?([^"')]+)(?:"|')?\)/g)) add(match[1]);
  return [...paths];
}

let failed = false;
for (const f of required) {
  const full = resolve(DIST, f.path);
  if (!existsSync(full)) {
    console.error(`✗ MISSING: dist/${f.path}`);
    failed = true;
    continue;
  }
  const size = statSync(full).size;
  if (size < f.minBytes) {
    console.error(`✗ TOO SMALL: dist/${f.path} (${size} bytes, expected ≥ ${f.minBytes})`);
    failed = true;
    continue;
  }
  if ("mustContain" in f && f.mustContain) {
    const content = readFileSync(full, "utf8");
    if (!content.includes(f.mustContain)) {
      console.error(`✗ INVALID: dist/${f.path} missing "${f.mustContain}"`);
      failed = true;
      continue;
    }
  }
  if ("validate" in f && f.validate) {
    const content = readFileSync(full, "utf8");
    if (!f.validate(content)) {
      console.error(`✗ INVALID: dist/${f.path} ${f.errorMessage}`);
      failed = true;
      continue;
    }
  }
  console.log(`✓ dist/${f.path} (${size} bytes)`);
}

// The stored home shell is copied into production HTML. Fail the build if a
// local image or hashed font/image URL embedded by the shell/CSS is absent.
const shellPath = resolve(process.cwd(), "scripts/generated/home-shell.html");
const homePath = resolve(DIST, "index.html");
for (const [label, sourcePath] of [["stored home shell", shellPath], ["built home HTML", homePath]] as const) {
  if (!existsSync(sourcePath)) {
    console.error(`✗ MISSING: ${sourcePath}`);
    failed = true;
    continue;
  }
  const source = readFileSync(sourcePath, "utf8");
  const assets = localAssetPaths(source);
  for (const asset of assets) {
    if (!existsSync(resolve(DIST, asset))) {
      console.error(`✗ ${label} references missing local asset: /${asset}`);
      failed = true;
    }
  }
  console.log(`✓ ${label}: ${assets.length} local image/font asset reference(s) exist`);
}

// ---------------------------------------------------------------------------
// SSG semantic-content + JSON-LD checks for GEO-targeted pages.
// These pages must render their semantic <main>/<article>/<dl> content AND
// the full set of structured-data blocks into static HTML so LLM crawlers
// (ChatGPT, Perplexity, Claude, Gemini) and Googlebot can parse them
// without executing client-side JavaScript.
// ---------------------------------------------------------------------------
const ssgChecks: { path: string; mustContainTypes: string[]; mustContainHtml: string[] }[] = [
  {
    path: "ai/index.html",
    mustContainTypes: ["SoftwareApplication", "FAQPage", "HowTo", "BreadcrumbList"],
    mustContainHtml: ["<h1>", "AI", "ЗЗД"],
  },
  {
    path: "karta/index.html",
    mustContainTypes: ["ItemList", "CollectionPage"],
    mustContainHtml: ["<h1>", "<dl>", "<dt>", "/shablon/"],
  },
];

for (const c of ssgChecks) {
  const full = resolve(DIST, c.path);
  if (!existsSync(full)) {
    console.error(`✗ MISSING SSG page: dist/${c.path}`);
    failed = true;
    continue;
  }
  const html = readFileSync(full, "utf8");
  // Extract every <script type="application/ld+json"> payload and parse it.
  // The regex accepts any additional attributes (e.g. data-prerendered="true")
  // because scripts/prerender.ts marks SSG-injected blocks with that attribute.
  const matches = [...html.matchAll(/<script type="application\/ld\+json"(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  if (matches.length === 0) {
    console.error(`✗ dist/${c.path} has no JSON-LD scripts`);
    failed = true;
    continue;
  }
  console.log(`\n[verify-build] dist/${c.path} — scanning ${matches.length} JSON-LD block(s):`);
  const seenTypes = new Set<string>();
  let parseFailed = false;
  let blockIdx = 0;
  for (const m of matches) {
    blockIdx++;
    const raw = m[0];
    const isPrerendered = raw.includes('data-prerendered="true"');
    const origin = isPrerendered ? "prerendered" : "static/Helmet";
    try {
      const obj = JSON.parse(m[1]);
      const ldType = Array.isArray(obj) ? `[array len=${obj.length}]` : (obj && typeof obj["@type"] === "string" ? obj["@type"] : "<no @type>");
      // Walk top-level + nested @type values so e.g. CollectionPage→ItemList counts.
      const collectTypes = (node: any) => {
        if (!node || typeof node !== "object") return;
        if (typeof node["@type"] === "string") seenTypes.add(node["@type"]);
        for (const v of Object.values(node)) {
          if (Array.isArray(v)) v.forEach(collectTypes);
          else if (v && typeof v === "object") collectTypes(v);
        }
      };
      if (Array.isArray(obj)) obj.forEach(collectTypes);
      else collectTypes(obj);
      const name = (obj && (obj.name || obj["@id"])) || "";
      console.log(`  · #${blockIdx} [${origin}] @type=${ldType}${name ? ` name="${String(name).slice(0, 60)}"` : ""}`);
    } catch (e) {
      console.error(`  · #${blockIdx} [${origin}] ✗ invalid JSON-LD: ${(e as Error).message}`);
      console.error(`    payload preview: ${m[1].slice(0, 200).replace(/\s+/g, " ")}…`);
      parseFailed = true;
    }
  }
  console.log(`  → @types seen: ${[...seenTypes].sort().join(", ") || "(none)"}`);
  if (parseFailed) { failed = true; continue; }
  for (const t of c.mustContainTypes) {
    if (!seenTypes.has(t)) {
      console.error(`✗ dist/${c.path} missing JSON-LD @type="${t}" (saw: ${[...seenTypes].join(", ")})`);
      failed = true;
    }
  }
  for (const s of c.mustContainHtml) {
    if (!html.includes(s)) {
      console.error(`✗ dist/${c.path} missing required HTML snippet "${s}"`);
      failed = true;
    }
  }
  if (!failed) console.log(`✓ dist/${c.path} (SSG + ${matches.length} JSON-LD blocks)`);
}

if (failed) {
  console.error("\nBuild verification FAILED. Refusing to publish broken artifacts.");
  process.exit(1);
}
console.log("\n✓ Build artifacts verified.");

// Generates public/sitemap.xml with all SEO-relevant URLs.
// Runs as a prebuild step (see package.json).
//
// Tiered priorities help Google decide what to crawl first on a young domain
// with a low crawl budget. The lastmod for each URL is anchored to a per-route
// "epoch" date (the date that route went live in this repo) — Google ignores
// sitemaps where every URL has the same lastmod = today.
//
// Usage: bun run scripts/build-sitemap.ts

import { writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { CATALOG, TOP_DOCUMENTS } from "../src/data/catalog";
import { SECTORS } from "../src/data/sectors";
import { slugify } from "../src/lib/slugify";

const SITE = "https://dogovori.net";
const today = new Date().toISOString().split("T")[0];

type Entry = { loc: string; changefreq: string; priority: string; lastmod?: string };

// Use the last git/file modification of catalog.ts as a stable "content updated"
// date for catalog-derived pages. Falls back to today if stat fails.
function catalogMtime(): string {
  try {
    const s = statSync(resolve(process.cwd(), "src/data/catalog.ts"));
    return s.mtime.toISOString().split("T")[0];
  } catch {
    return today;
  }
}
const catalogDate = catalogMtime();

const topNames = new Set(TOP_DOCUMENTS.map((d) => d.name));

const staticEntries: Entry[] = [
  { loc: "/", changefreq: "daily", priority: "1.0", lastmod: today },
  { loc: "/catalog", changefreq: "weekly", priority: "0.95", lastmod: catalogDate },
  { loc: "/karta", changefreq: "weekly", priority: "0.9", lastmod: catalogDate },
  { loc: "/build", changefreq: "weekly", priority: "0.85", lastmod: catalogDate },
  { loc: "/blog", changefreq: "weekly", priority: "0.85", lastmod: today },
  { loc: "/auth", changefreq: "monthly", priority: "0.4" },
  { loc: "/contacts", changefreq: "yearly", priority: "0.3" },
  { loc: "/terms", changefreq: "yearly", priority: "0.3" },
  { loc: "/privacy", changefreq: "yearly", priority: "0.3" },
  { loc: "/cookies", changefreq: "yearly", priority: "0.3" },
  { loc: "/refund", changefreq: "yearly", priority: "0.3" },
];

const blogDir = resolve(process.cwd(), "src/content/blog");
const blogEntries: Entry[] = readdirSync(blogDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => {
    const full = resolve(blogDir, f);
    let lastmod = today;
    try {
      lastmod = statSync(full).mtime.toISOString().split("T")[0];
    } catch {}
    return {
      loc: `/blog/${f.replace(/\.ts$/, "")}`,
      changefreq: "monthly",
      priority: "0.75",
      lastmod,
    };
  });

const categoryEntries: Entry[] = CATALOG.map((cat) => ({
  loc: `/kategoria/${cat.id}`,
  changefreq: "weekly",
  priority: "0.9",
  lastmod: catalogDate,
}));

const sectorEntries: Entry[] = SECTORS.map((s) => ({
  loc: `/sektor/${s.id}`,
  changefreq: "weekly",
  priority: "0.85",
  lastmod: catalogDate,
}));

const templateEntries: Entry[] = [];
const used = new Set<string>();
for (const cat of CATALOG) {
  for (const doc of cat.documents) {
    let base = slugify(doc.name);
    if (!base) base = "shablon";
    let slug = base;
    let i = 2;
    while (used.has(slug)) slug = `${base}-${i++}`;
    used.add(slug);
    // Top documents get a higher priority — they're the ones we want indexed first.
    const isTop = topNames.has(doc.name) || doc.badge === "TOP";
    templateEntries.push({
      loc: `/shablon/${slug}`,
      changefreq: "monthly",
      priority: isTop ? "0.85" : "0.65",
      lastmod: catalogDate,
    });
  }
}

const all = [...staticEntries, ...sectorEntries, ...categoryEntries, ...templateEntries, ...blogEntries];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all
  .map(
    (e) =>
      `  <url>\n    <loc>${SITE}${e.loc}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ""}\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
  )
  .join("\n")}
</urlset>
`;

const out = resolve(process.cwd(), "public", "sitemap.xml");
writeFileSync(out, xml, "utf8");
console.log(`✓ sitemap.xml written with ${all.length} URLs → ${out}`);

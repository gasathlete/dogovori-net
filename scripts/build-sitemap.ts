// Generates split sitemaps + a sitemap index for better crawling on a young
// domain. Google crawls smaller sitemaps more often, and a sitemap index lets
// Search Console show coverage per content type.
//
// Output:
//   public/sitemap.xml              — sitemap INDEX (entry point in robots.txt)
//   public/sitemap-static.xml       — homepage + legal/info pages
//   public/sitemap-categories.xml   — /kategoria/* + /sektor/*
//   public/sitemap-templates.xml    — /shablon/*
//   public/sitemap-blog.xml         — /blog/*
//
// Usage: bun run scripts/build-sitemap.ts

import { writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { CATALOG, TOP_DOCUMENTS } from "../src/data/catalog";
import { SECTORS } from "../src/data/sectors";

import { slugify } from "../src/lib/slugify";
import { CALCULATORS } from "../src/data/calculators";


const SITE = "https://dogovori.net";
const today = new Date().toISOString().split("T")[0];

type Entry = { loc: string; changefreq: string; priority: string; lastmod?: string };

function fileMtime(relPath: string): string {
  try {
    return statSync(resolve(process.cwd(), relPath)).mtime.toISOString().split("T")[0];
  } catch {
    return today;
  }
}
const catalogDate = fileMtime("src/data/catalog.ts");
const sectorsDate = fileMtime("src/data/sectors.ts");
const calculatorsDate = fileMtime("src/data/calculators.ts");
const topNames = new Set(TOP_DOCUMENTS.map((d) => d.name));

// ---------- buckets ----------
// Each static URL's lastmod is tied to the mtime of the page source file
// that renders it, so Google sees real change signals (not a daily reset).
const staticEntries: Entry[] = [
  { loc: "/", changefreq: "daily", priority: "1.0", lastmod: fileMtime("src/pages/Index.tsx") },
  { loc: "/catalog", changefreq: "weekly", priority: "0.95", lastmod: catalogDate },
  { loc: "/karta", changefreq: "weekly", priority: "0.9", lastmod: catalogDate },
  { loc: "/build", changefreq: "weekly", priority: "0.85", lastmod: fileMtime("src/pages/BuildContract.tsx") },
  { loc: "/blog", changefreq: "weekly", priority: "0.85", lastmod: fileMtime("src/pages/Blog.tsx") },
  { loc: "/tools", changefreq: "weekly", priority: "0.85", lastmod: calculatorsDate },
  { loc: "/ai", changefreq: "monthly", priority: "0.85", lastmod: fileMtime("src/pages/AIFeatures.tsx") },

  { loc: "/auth", changefreq: "monthly", priority: "0.4", lastmod: fileMtime("src/pages/Auth.tsx") },
  { loc: "/contacts", changefreq: "yearly", priority: "0.3", lastmod: fileMtime("src/pages/Contact.tsx") },
  { loc: "/terms", changefreq: "yearly", priority: "0.3", lastmod: fileMtime("src/pages/Terms.tsx") },
  { loc: "/privacy", changefreq: "yearly", priority: "0.3", lastmod: fileMtime("src/pages/Privacy.tsx") },
  { loc: "/cookies", changefreq: "yearly", priority: "0.3", lastmod: fileMtime("src/pages/Cookies.tsx") },
  { loc: "/refund", changefreq: "yearly", priority: "0.3", lastmod: fileMtime("src/pages/Refund.tsx") },
  // NOTE: /catalog?vid=<type> was previously listed here, but query-string
  // URLs are filtered/deduped by Google ("Alternate page with proper canonical
  // tag") and produced 3 warnings on sitemap-static.xml. The same browse
  // intent is served by /kategoria/* and the per-template /shablon/* pages,
  // both fully SSG-prerendered.

  // /tools/<slug> — calculator detail pages.
  ...CALCULATORS.map<Entry>((c) => ({
    loc: `/tools/${c.slug}`,
    changefreq: "monthly",
    priority: "0.75",
    lastmod: calculatorsDate,
  })),
];



const blogDir = resolve(process.cwd(), "src/content/blog");
const blogEntries: Entry[] = readdirSync(blogDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => {
    let lastmod = today;
    try {
      lastmod = statSync(resolve(blogDir, f)).mtime.toISOString().split("T")[0];
    } catch {}
    return {
      loc: `/blog/${f.replace(/\.ts$/, "")}`,
      changefreq: "monthly",
      priority: "0.75",
      lastmod,
    };
  });

const categoryEntries: Entry[] = [
  ...CATALOG.map<Entry>((cat) => ({
    loc: `/kategoria/${cat.id}`,
    changefreq: "weekly",
    priority: "0.9",
    lastmod: catalogDate,
  })),
  ...SECTORS.map<Entry>((s) => ({
    loc: `/sektor/${s.id}`,
    changefreq: "weekly",
    priority: "0.85",
    lastmod: sectorsDate,
  })),
];

const templateEntries: Entry[] = [];
const used = new Set<string>();
for (const cat of CATALOG) {
  for (const doc of cat.documents) {
    let base = slugify(doc.name) || "shablon";
    let slug = base;
    let i = 2;
    while (used.has(slug)) slug = `${base}-${i++}`;
    used.add(slug);
    const isTop = topNames.has(doc.name) || doc.badge === "TOP";
    templateEntries.push({
      loc: `/shablon/${slug}`,
      changefreq: "monthly",
      priority: isTop ? "0.85" : "0.65",
      lastmod: catalogDate,
    });
  }
}

// ---------- writers ----------
function renderUrlset(entries: Entry[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) =>
      `  <url>\n    <loc>${SITE}${e.loc}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ""}\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
  )
  .join("\n")}
</urlset>
`;
}

function writeSitemap(filename: string, entries: Entry[]) {
  const out = resolve(process.cwd(), "public", filename);
  writeFileSync(out, renderUrlset(entries), "utf8");
  console.log(`✓ ${filename}: ${entries.length} URLs`);
}

writeSitemap("sitemap-static.xml", staticEntries);
writeSitemap("sitemap-categories.xml", categoryEntries);
writeSitemap("sitemap-templates.xml", templateEntries);
writeSitemap("sitemap-blog.xml", blogEntries);

// Sitemap index
const blogLatest = blogEntries.reduce((m, e) => (e.lastmod && e.lastmod > m ? e.lastmod : m), "1970-01-01");
const staticLatest = staticEntries.reduce((m, e) => (e.lastmod && e.lastmod > m ? e.lastmod : m), "1970-01-01");
const categoryLatest = [catalogDate, sectorsDate].sort().reverse()[0];
const children = [
  { loc: "sitemap-static.xml", lastmod: staticLatest },
  { loc: "sitemap-categories.xml", lastmod: categoryLatest },
  { loc: "sitemap-templates.xml", lastmod: catalogDate },
  { loc: "sitemap-blog.xml", lastmod: blogLatest },
];
const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${children
  .map((c) => `  <sitemap>\n    <loc>${SITE}/${c.loc}</loc>\n    <lastmod>${c.lastmod}</lastmod>\n  </sitemap>`)
  .join("\n")}
</sitemapindex>
`;
writeFileSync(resolve(process.cwd(), "public", "sitemap.xml"), indexXml, "utf8");
console.log(`✓ sitemap.xml (index): ${children.length} child sitemaps`);

const total = staticEntries.length + categoryEntries.length + templateEntries.length + blogEntries.length;
console.log(`✓ Total URLs across all sitemaps: ${total}`);

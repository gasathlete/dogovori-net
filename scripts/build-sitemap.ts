// Generates public/sitemap.xml with all SEO-relevant URLs.
// Runs as a prebuild step (see package.json).
//
// Usage: bun run scripts/build-sitemap.ts

import { writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { CATALOG } from "../src/data/catalog";
import { slugify } from "../src/lib/slugify";

const SITE = "https://dogovori.net";
const today = new Date().toISOString().split("T")[0];

type Entry = { loc: string; changefreq: string; priority: string; lastmod?: string };

const staticEntries: Entry[] = [
  { loc: "/", changefreq: "weekly", priority: "1.0", lastmod: today },
  { loc: "/catalog", changefreq: "weekly", priority: "0.9", lastmod: today },
  { loc: "/blog", changefreq: "weekly", priority: "0.9", lastmod: today },
  { loc: "/auth", changefreq: "monthly", priority: "0.5" },
  { loc: "/terms", changefreq: "yearly", priority: "0.3" },
  { loc: "/privacy", changefreq: "yearly", priority: "0.3" },
  { loc: "/cookies", changefreq: "yearly", priority: "0.3" },
  { loc: "/refund", changefreq: "yearly", priority: "0.3" },
];

const blogDir = resolve(process.cwd(), "src/content/blog");
const blogEntries: Entry[] = readdirSync(blogDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({
    loc: `/blog/${f.replace(/\.ts$/, "")}`,
    changefreq: "monthly",
    priority: "0.7",
    lastmod: today,
  }));

const categoryEntries: Entry[] = CATALOG.map((cat) => ({
  loc: `/kategoria/${cat.id}`,
  changefreq: "weekly",
  priority: "0.8",
  lastmod: today,
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
    templateEntries.push({
      loc: `/shablon/${slug}`,
      changefreq: "monthly",
      priority: "0.8",
      lastmod: today,
    });
  }
}

const all = [...staticEntries, ...categoryEntries, ...templateEntries];

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

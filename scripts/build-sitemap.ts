// Split sitemaps make content groups observable in Search Console.
// They do not guarantee crawl frequency or indexing. Google ignores priority/changefreq.
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { CATALOG, TOP_DOCUMENTS } from "../src/data/catalog";
import { SECTORS } from "../src/data/sectors";
import { FEATURED_BLANKS } from "../src/data/featuredBlanks";
import { ONE_TIME_PRODUCT_PATHS } from "../src/lib/products";
import { CALCULATORS } from "../src/data/calculators";
import { SECTOR_PACKAGES } from "../src/data/sectorPackages";
import { DOCUMENT_KITS } from "../src/data/documentKits";
import { allTemplates } from "../src/lib/templateIndex";
import { loadPublishedBlogPosts } from "./lib/blogContent";
import { resolveDateModified } from "../src/lib/blogEditorial";
import { renderUrlset, type SitemapEntry } from "./lib/sitemapXml";

const SITE = "https://dogovori.net";
// No build-date or filesystem-mtime lastmod: a fresh checkout is not a content edit.
// Non-editorial routes omit this optional field until a reliable change ledger exists.
const staticEntries: SitemapEntry[] = [
  { loc: "/" },
  { loc: "/produkti" },
  ...[...ONE_TIME_PRODUCT_PATHS, "/catalog", "/paketi",
  ...SECTOR_PACKAGES.map((p) => `/paketi/${p.slug}`),
  "/komplekti", ...DOCUMENT_KITS.map((k) => `/komplekti/${k.id}`),
  "/karta", "/blog", "/tools", "/ai", "/contacts", "/terms", "/privacy", "/cookies", "/refund",
  ...CALCULATORS.map((c) => `/tools/${c.slug}`),
  ].map((loc) => ({ loc })),
];
// /build, /auth, purchase/results, private routes and query variants stay out.
const blogEntries: SitemapEntry[] = (await loadPublishedBlogPosts(resolve("src/content/blog"))).map((post) => ({
  loc: `/blog/${post.slug}`, lastmod: resolveDateModified(post),
}));
const categoryEntries: SitemapEntry[] = [
  ...CATALOG.map((cat) => ({ loc: `/kategoria/${cat.id}` })),
  ...SECTORS.map((sector) => ({ loc: `/sektor/${sector.id}` })),
];
const topNames = new Set([...TOP_DOCUMENTS, ...FEATURED_BLANKS.map((f) => ({ name: f.docName }))].map((d) => d.name));
const templateEntriesTop: SitemapEntry[] = [];
const templateEntriesRich: SitemapEntry[] = [];
const templateEntriesRest: SitemapEntry[] = [];
for (const entry of allTemplates()) {
  const target = topNames.has(entry.doc.name) || entry.doc.badge === "TOP"
    ? templateEntriesTop
    : existsSync(resolve(`src/data/templateContent/${entry.slug}.ts`)) ? templateEntriesRich : templateEntriesRest;
  target.push({ loc: `/shablon/${entry.slug}` });
}
const groups = [
  ["sitemap-static.xml", staticEntries],
  ["sitemap-categories.xml", categoryEntries],
  ["sitemap-templates-top.xml", templateEntriesTop],
  ["sitemap-templates-rich.xml", templateEntriesRich],
  ["sitemap-templates.xml", templateEntriesRest],
  ["sitemap-blog.xml", blogEntries],
] as const;
const locations = groups.flatMap(([, entries]) => entries.map((e) => e.loc));
if (new Set(locations).size !== locations.length) throw new Error("Duplicate sitemap URL");
for (const [filename, entries] of groups) {
  writeFileSync(resolve("public", filename), renderUrlset(SITE, entries), "utf8");
  console.log(`✓ ${filename}: ${entries.length} URLs`);
}
// An index lastmod describes changes to the sitemap file itself, not the newest article.
// Omit it rather than manufacture a date for additions/removals/rebuilds.
const index = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${groups.map(([name]) => `  <sitemap><loc>${SITE}/${name}</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`;
writeFileSync(resolve("public/sitemap.xml"), index, "utf8");
console.log(`✓ Total URLs across all sitemaps: ${locations.length}`);

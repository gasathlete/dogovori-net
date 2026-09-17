/**
 * Генерира `src/data/footerAnchors.generated.json` — съответствие между
 * името на документа, изписано в SEO футъра, и неговия адрес (slug).
 *
 * Досега футърът зареждаше целия каталог (~160 KB JS) при всяко отваряне на
 * страница, само за да намери адресите на около 30 връзки. Съответствието се
 * пресъздава при всяко сглобяване, така че връзките остават верни.
 *
 * Стартиране: bun run scripts/generate-footer-anchors.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const FOOTER = join(ROOT, "src/components/SeoFooter.tsx");
const OUT = join(ROOT, "src/data/footerAnchors.generated.json");

const source = readFileSync(FOOTER, "utf8");
const names = Array.from(source.matchAll(/docName:\s*"([^"]+)"/g)).map((m) => m[1]);

// Избраните бланки на началната страница ползват същото съответствие, за да не
// се зарежда каталожният индекс само заради пет адреса.
const featured = readFileSync(join(ROOT, "src/data/featuredBlanks.ts"), "utf8");
for (const m of featured.matchAll(/docName:\s*"([^"]+)"/g)) names.push(m[1]);

const unique = Array.from(new Set(names));

const { allTemplates } = (await import(join(ROOT, "src/lib/templateIndex.ts"))) as {
  allTemplates: () => { slug: string; doc: { name: string } }[];
};

const bySlug = new Map<string, string>();
for (const t of allTemplates()) {
  if (!bySlug.has(t.doc.name)) bySlug.set(t.doc.name, t.slug);
}

const map: Record<string, string> = {};
const missing: string[] = [];
for (const name of unique) {
  const slug = bySlug.get(name);
  if (slug) map[name] = slug;
  else missing.push(name);
}

writeFileSync(OUT, `${JSON.stringify(map, null, 2)}\n`, "utf8");
console.log(
  `footer anchors: ${Object.keys(map).length}/${unique.length} намерени → ${OUT}` +
    (missing.length ? `\n  без съответствие: ${missing.join(", ")}` : ""),
);

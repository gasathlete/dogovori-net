/**
 * Възпроизводимо пакетно регенериране и проверка на каталожните документи.
 *
 *   bun run scripts/template-regen.ts          # пише reports/template-regen/*
 *   bun run scripts/template-regen.ts --check  # exit 1, ако регистърът е остарял
 *
 * - Чете каноничния каталог (allTemplates) и пълните текстове (templateDrafts)
 *   през същия resolver, който използва приложението.
 * - Оригиналите не се променят. Кандидатите се сравняват с тях (per-template diff).
 * - Ако оригинал се промени, кандидатът става „candidate_stale_source_changed“,
 *   а комплектите, в които участва, — „needs_recheck“ (dependency invalidation).
 * - Не присвоява правно одобрение.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { allTemplates } from "../src/lib/templateIndex";
import { resolveTemplateDraftSelection } from "../src/lib/templateDraftResolver";
import { TEMPLATE_DRAFT_SLUGS, loadTemplateDraft as loadBySlug } from "../src/data/templateDrafts/index";
import { DOCUMENT_KITS } from "../src/data/documentKits";
import { TEMPLATE_CANDIDATES } from "../src/data/templateCandidates";
import { buildRegistry, type RegistryInput } from "../src/lib/templateRegen/registry";
import { lineDiff } from "../src/lib/templateRegen/lineDiff";
import { scanTemplateText } from "../src/lib/templateRegen/catalogChecks";

const OUT = join(process.cwd(), "reports/template-regen");
const DATE = "2026-10-19";
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

const slugText = new Map<string, string>();
for (const s of TEMPLATE_DRAFT_SLUGS) slugText.set(s, await loadBySlug(s));

const inputs: RegistryInput[] = [];
for (const e of allTemplates()) {
  const sel = resolveTemplateDraftSelection(e.doc.name);
  const text = sel ? slugText.get(sel.slug) ?? null : null;
  inputs.push({
    catalogName: e.doc.name, categoryId: e.category.id, catalogSlug: e.slug,
    draftSlug: sel?.slug ?? null, resolution: sel?.method ?? null, sourceSha256: text ? sha(text) : null, text,
  });
}

const registry = buildRegistry({ date: DATE, inputs, candidates: TEMPLATE_CANDIDATES, kits: DOCUMENT_KITS, allDraftSlugs: TEMPLATE_DRAFT_SLUGS });

const json = JSON.stringify(registry, null, 2) + "\n";
const registryPath = join(OUT, "registry.json");

if (process.argv.includes("--check")) {
  const current = existsSync(registryPath) ? readFileSync(registryPath, "utf8") : "";
  if (current !== json) {
    console.error("template-regen: регистърът е остарял — пуснете bun run scripts/template-regen.ts");
    process.exit(1);
  }
  console.log("template-regen: регистърът е актуален.");
  process.exit(0);
}

rmSync(join(OUT, "diffs"), { recursive: true, force: true });
mkdirSync(join(OUT, "diffs"), { recursive: true });
mkdirSync(join(OUT, "candidates"), { recursive: true });
writeFileSync(registryPath, json);

for (const c of TEMPLATE_CANDIDATES) {
  const original = slugText.get(c.slug) ?? "";
  for (const s of c.scenarios) {
    const header = `# ${c.slug} ${c.version} :: ${s.id}\n# original sha256 ${sha(original)} | candidate sha256 ${sha(s.text)}\n# status: ${c.status}; legal approval: none\n`;
    writeFileSync(join(OUT, "diffs", `${c.slug}__${s.id}.diff`), header + lineDiff(original, s.text) + "\n");
    writeFileSync(join(OUT, "candidates", `${c.slug}__${s.id}.txt`), s.text + "\n");
  }
}

// Пояснителни текстове (templateContent) — същите правила за всички документи.
const contentScan: { slug: string; rules: string[] }[] = [];
let contentFiles = 0;
for (const s of [...new Set(registry.entries.map((e) => e.draftSlug).filter(Boolean) as string[])].sort()) {
  let c: unknown;
  try { c = (await import(`../src/data/templateContent/${s}.ts`)).default; } catch { continue; }
  contentFiles++;
  const text = JSON.stringify(c).replace(/\\n/g, " ");
  const rules = [...new Set(scanTemplateText(text).map((f) => f.ruleId))];
  if (rules.length) contentScan.push({ slug: s, rules });
}
writeFileSync(join(OUT, "content-scan.json"), JSON.stringify({ contentFiles, withFindings: contentScan.length, entries: contentScan }, null, 2) + "\n");
const t = registry.totals;
const byRule = new Map<string, number>();
for (const e of registry.entries) if (e.scope === "scanned_only") for (const f of e.findings) byRule.set(f.ruleId, (byRule.get(f.ruleId) ?? 0) + 1);
const candFindings = TEMPLATE_CANDIDATES.flatMap((c) => c.scenarios.flatMap((s) => scanTemplateText(s.text).map((f) => `${c.slug}/${s.id}: ${f.ruleId}`)));

const md = `# Регистър за регенериране — ${DATE}

Генерирано от \`scripts/template-regen.ts\`. Не е правно одобрение.

| Показател | Брой |
|---|---|
| Канонични каталожни записи | ${t.catalogEntries} |
| С пълен текст (сканирани) | ${t.withFullText} |
| Без пълен текст | ${t.withoutFullText} |
| Файлове с пълни текстове | ${t.distinctDraftFiles} |
| Файлове, достижими от каталога | ${t.reachableDraftFiles} (от тях споделени от няколко записа: ${t.draftFilesSharedByEntries}) |
| Реално пренаписани файлове (кандидат v2) | ${t.rewrittenDraftFiles} / ${t.reachableDraftFiles} |
| Каталожни записи, засегнати от пренаписване | ${t.rewrittenCandidates} / ${t.withFullText} |
| Само сканирани | ${t.scannedOnly} |
| Сканирани с отворени находки | ${t.entriesWithOpenFindings} |
| Находки „правна грешка“ в само сканираните | ${t.legalErrorFindings} |
| Правно одобрени кандидати | 0 |
| Комплекти за повторна проверка | ${registry.kits.filter((k) => k.status === "needs_recheck").length} / ${registry.kits.length} |
| Възможни дублиращи файлове (съкратени slug) | ${registry.duplicateDraftSlugs.length} |
| Файлове, недостижими от каталога | ${registry.orphanDraftSlugs.length} |

## Пояснителни текстове\n- Сканирани файлове: ${contentFiles}; с находки: ${contentScan.length} (виж content-scan.json)\n\n## Находки по правило (само сканирани документи)
${[...byRule].sort((a, b) => b[1] - a[1]).map(([r, n]) => `- ${r}: ${n}`).join("\n") || "- няма"}

## Остатъчни находки в кандидатите
${candFindings.map((f) => `- ${f}`).join("\n") || "- няма"}

## Без пълен текст
${registry.entries.filter((e) => e.scope === "not_available").map((e) => `- ${e.catalogName}`).join("\n")}
`;
writeFileSync(join(OUT, "summary.md"), md);
console.log(md.split("\n").slice(0, 20).join("\n"));

/**
 * Evidence-aware пакетно генериране на КАНДИДАТИ за всички каталожни документи.
 *
 *   bun run ./scripts/template-regen-generate.ts                       # dry-run: опашка за всички документи
 *   bun run ./scripts/template-regen-generate.ts --kind draft --slug <slug> --execute
 *   bun run ./scripts/template-regen-generate.ts --kind content --all --execute LIMIT=20
 *
 * Изходът е само в reports/template-regen/generated/<kind>/ (status: draft_review_required).
 * Никога не презаписва templateDrafts/templateContent и не обновява index файлове.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { allTemplates } from "../src/lib/templateIndex";
import { resolveTemplateDraftSelection } from "../src/lib/templateDraftResolver";
import { TEMPLATE_DRAFT_SLUGS, loadTemplateDraft as loadBySlug } from "../src/data/templateDrafts/index";
import { DOCUMENT_KITS } from "../src/data/documentKits";
import { scanTemplateText } from "../src/lib/templateRegen/catalogChecks";
import { CANDIDATE_OUTPUT_ROOT, assertCandidateOutputPath, buildEvidencePacket, buildGenerationPrompt, candidateOutputPath, type GenerationKind } from "../src/lib/templateRegen/generationPlan";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const kind = (arg("--kind") ?? "draft") as GenerationKind;
const execute = process.argv.includes("--execute");
const onlySlug = arg("--slug");
const LIMIT = Number(process.env.LIMIT ?? Infinity);
const MODEL = process.env.MODEL ?? "openai/gpt-6-astra";
const OUTPUT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["payload", "unverifiedLegalBases", "unresolvedFacts"],
  properties: { payload: { type: "string" }, unverifiedLegalBases: { type: "array", items: { type: "string" } }, unresolvedFacts: { type: "array", items: { type: "string" } } },
} as const;
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

const textBySlug = new Map<string, string>();
for (const s of TEMPLATE_DRAFT_SLUGS) textBySlug.set(s, await loadBySlug(s));

const kitsByName = new Map<string, string[]>();
for (const k of DOCUMENT_KITS) for (const i of k.items) kitsByName.set(i.docName, [...(kitsByName.get(i.docName) ?? []), k.id]);

// Един запис на реален файл (дедупликация на споделените текстове).
const targets = new Map<string, { name: string; kits: Set<string> }>();
for (const e of allTemplates()) {
  const slug = resolveTemplateDraftSelection(e.doc.name)?.slug;
  if (!slug) continue;
  const cur = targets.get(slug) ?? { name: e.doc.name, kits: new Set<string>() };
  for (const k of kitsByName.get(e.doc.name) ?? []) cur.kits.add(k);
  targets.set(slug, cur);
}

async function originalFor(slug: string): Promise<string | null> {
  if (kind === "draft") return textBySlug.get(slug) ?? null;
  try { const m = await import(`../src/data/templateContent/${slug}.ts`); return JSON.stringify(m.default, null, 2); } catch { return null; }
}

const queue: object[] = [];
let done = 0;
for (const [slug, info] of [...targets].sort()) {
  if (onlySlug && slug !== onlySlug) continue;
  const original = await originalFor(slug);
  if (!original) { queue.push({ slug, kind, status: "no_original" }); continue; }
  const packet = buildEvidencePacket({ kind, catalogName: info.name, slug, sourceSha256: sha(original), originalText: original, findings: scanTemplateText(original), kits: [...info.kits] });
  const out = candidateOutputPath(kind, slug, packet.sourceSha256);
  queue.push({ slug, kind, catalogName: info.name, sourceSha256: packet.sourceSha256, findings: packet.findings.map((f) => f.ruleId), kits: packet.kits, output: out, exists: existsSync(out) });
  if (!execute || done >= LIMIT || existsSync(out)) continue;
  const key = process.env.LOVABLE_API_KEY;
  if (!key) { console.error("LOVABLE_API_KEY липсва — dry-run само."); break; }
  const { system, user } = buildGenerationPrompt(packet);
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODEL, stream: true, store: false, reasoning: { effort: "medium" },
      input: [{ role: "system", content: system }, { role: "user", content: user }],
      text: { format: { type: "json_schema", name: "template_candidate", strict: true, schema: OUTPUT_SCHEMA } },
    }),
  });
  if (!res.ok || !res.body) { console.error(`${slug}: gateway ${res.status}`); continue; }
  let raw = "", buf = "";
  const reader = res.body.getReader(); const dec = new TextDecoder();
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      try { const ev = JSON.parse(line.slice(5)); if (ev.type === "response.output_text.delta") raw += ev.delta; } catch { /* keep-alive */ }
    }
  }
  mkdirSync(dirname(assertCandidateOutputPath(out)), { recursive: true });
  writeFileSync(out, JSON.stringify({
    slug, kind, baseSourceSha256: packet.sourceSha256, model: MODEL, promptSha256: sha(system + user), generatedAt: new Date().toISOString(),
    status: "draft_review_required", legalApproval: null, sourcesUsed: packet.sources.map((s) => s.id), raw,
  }, null, 2));
  done++;
  console.log(`кандидат: ${out}`);
}

const qPath = assertCandidateOutputPath(`${CANDIDATE_OUTPUT_ROOT}/queue-${kind}.json`);
mkdirSync(dirname(qPath), { recursive: true });
writeFileSync(qPath, JSON.stringify({ kind, files: queue.length, generatedThisRun: done, entries: queue }, null, 2) + "\n");
console.log(`${kind}: ${queue.length} файла в опашката, генерирани сега: ${done}${execute ? "" : " (dry-run)"}`);

/**
 * Evidence-aware, възобновяемо пакетно генериране на КАНДИДАТИ за каталожните документи.
 *
 *   bun run ./scripts/template-regen-generate.ts --kind draft                      # dry-run: опис + опашка
 *   bun run ./scripts/template-regen-generate.ts --kind draft --execute LIMIT=10   # ограничен пакет
 *   ... --slug <slug> | --retry-failed | BUDGET_CREDITS=20
 *
 * Изходът е само в reports/template-regen/generated/<kind>/. Записите са с
 * статус validated_generated_pending_legal_review | validation_failed | generation_failed
 * и legalApproval: null. Никога не презаписва templateDrafts/templateContent и index.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { allTemplates } from "../src/lib/templateIndex";
import { resolveTemplateDraftSelection } from "../src/lib/templateDraftResolver";
import { TEMPLATE_DRAFT_SLUGS, loadTemplateDraft as loadBySlug } from "../src/data/templateDrafts/index";
import { DOCUMENT_KITS } from "../src/data/documentKits";
import { scanTemplateText } from "../src/lib/templateRegen/catalogChecks";
import { CANDIDATE_OUTPUT_ROOT, assertCandidateOutputPath, buildEvidencePacket, buildGenerationPrompt, candidateOutputPath, type GenerationKind } from "../src/lib/templateRegen/generationPlan";
import { parseResponsesStream } from "../src/lib/templateRegen/sse";
import { CONTENT_OUTPUT_SCHEMA, DRAFT_OUTPUT_SCHEMA, validateContentOutput, validateDraftOutput } from "../src/lib/templateRegen/outputValidation";
import { checkContentCandidate, checkDraftCandidate, type CandidateStatus } from "../src/lib/templateRegen/candidateValidation";
import { selectEvidence, type ExcerptStore } from "../src/lib/templateRegen/evidence";
import { checklistFor } from "../src/lib/templateRegen/checklists";
import { TEMPLATE_CANDIDATES } from "../src/data/templateCandidates/index";
import { MAX_ATTEMPTS, classifyHttp, decideAction } from "../src/lib/templateRegen/batchState";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const kind = (arg("--kind") ?? "draft") as GenerationKind;
const execute = process.argv.includes("--execute");
const retryFailed = process.argv.includes("--retry-failed");
const onlySlug = arg("--slug");
const LIMIT = Number(process.env.LIMIT ?? Infinity);
const BUDGET = Number(process.env.BUDGET_CREDITS ?? 20);
const MODEL = process.env.MODEL ?? "openai/gpt-6-astra";
const TIMEOUT_MS = 240_000;
const HTTP_RETRIES = 2;
// Цена на модела (кредити/токен) от /v1/models, 2026-10-23; само за отчет и бюджет.
const PRICE = { input: 0.00002, output: 0.0001 };
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const store: ExcerptStore = JSON.parse(readFileSync("src/lib/templateRegen/data/legal-excerpts.json", "utf8"));

const textBySlug = new Map<string, string>();
for (const s of TEMPLATE_DRAFT_SLUGS) textBySlug.set(s, await loadBySlug(s));

const kitsByName = new Map<string, string[]>();
for (const k of DOCUMENT_KITS) for (const i of k.items) kitsByName.set(i.docName, [...(kitsByName.get(i.docName) ?? []), k.id]);

// Опис: един запис на реален файл; споделени файлове и записи без оригинал се водят отделно.
const targets = new Map<string, { name: string; names: Set<string>; kits: Set<string> }>();
const noOriginal: string[] = [];
for (const e of allTemplates()) {
  const slug = resolveTemplateDraftSelection(e.doc.name)?.slug;
  if (!slug || !textBySlug.has(slug)) { noOriginal.push(e.doc.name); continue; }
  const cur = targets.get(slug) ?? { name: e.doc.name, names: new Set<string>(), kits: new Set<string>() };
  cur.names.add(e.doc.name);
  for (const k of kitsByName.get(e.doc.name) ?? []) cur.kits.add(k);
  targets.set(slug, cur);
}
const orphans = TEMPLATE_DRAFT_SLUGS.filter((s) => !targets.has(s));
const shared = [...targets].filter(([, v]) => v.names.size > 1).map(([slug, v]) => ({ slug, catalogNames: [...v.names] }));

async function originalFor(slug: string): Promise<string | null> {
  if (kind === "draft") return textBySlug.get(slug) ?? null;
  const p = `src/data/templateContent/${slug}.ts`;
  if (!existsSync(p)) return null;
  try { const m = await import(`../${p}`); return JSON.stringify(m.default, null, 2); } catch { return null; }
}

async function callModel(system: string, user: string, key: string) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST", signal: ctrl.signal,
        headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
        body: JSON.stringify({
          model: MODEL, stream: true, store: false, reasoning: { effort: "low" },
          input: [{ role: "system", content: system }, { role: "user", content: user }],
          text: { format: { type: "json_schema", name: `template_${kind}_candidate`, strict: true, schema: kind === "draft" ? DRAFT_OUTPUT_SCHEMA : CONTENT_OUTPUT_SCHEMA } },
        }),
      });
      if (!res.ok || !res.body) {
        const c = classifyHttp(res.status);
        if (c === "stop_all") return { stop: true as const, error: `http_${res.status}` };
        if (c === "retry" && attempt < HTTP_RETRIES) { await new Promise((r) => setTimeout(r, 5000 * (attempt + 1))); continue; }
        return { error: `http_${res.status}` };
      }
      const out = await parseResponsesStream(res.body as unknown as AsyncIterable<Uint8Array>);
      if (!out.ok) {
        if (out.kind === "truncated" && attempt < HTTP_RETRIES) continue;
        return { error: `stream_${out.kind}:${out.detail}` };
      }
      return { text: out.text, usage: out.usage };
    } catch (e) {
      if (attempt < HTTP_RETRIES) continue;
      return { error: ctrl.signal.aborted ? "timeout" : `network:${String(e).slice(0, 120)}` };
    } finally { clearTimeout(timer); }
  }
}

const baselineSlugs = new Set(TEMPLATE_CANDIDATES.map((c) => c.slug));
const queue: Record<string, unknown>[] = [];
let generated = 0, spent = 0, stopReason: string | null = null;
const tally: Record<string, number> = {};
const key = process.env.LOVABLE_API_KEY;

for (const [slug, info] of [...targets].sort()) {
  if (onlySlug && slug !== onlySlug) continue;
  if (kind === "draft" && baselineSlugs.has(slug)) { queue.push({ slug, kind, status: "baseline_v2_candidate_exists" }); tally.baseline_v2_candidate_exists = (tally.baseline_v2_candidate_exists ?? 0) + 1; continue; }
  const original = await originalFor(slug);
  if (!original) { queue.push({ slug, kind, status: "no_original" }); tally.no_original = (tally.no_original ?? 0) + 1; continue; }
  const packet = buildEvidencePacket({ kind, catalogName: info.name, slug, sourceSha256: sha(original), originalText: original, findings: scanTemplateText(original), kits: [...info.kits] });
  const evidence = selectEvidence(slug, original, store);
  const checklist = checklistFor(slug);
  const out = candidateOutputPath(kind, slug, packet.sourceSha256);
  const existing = existsSync(out) ? (() => { try { return JSON.parse(readFileSync(out, "utf8")); } catch { return null; } })() : null;
  let action = decideAction(existing, packet.sourceSha256, retryFailed);
  const entry: Record<string, unknown> = { slug, kind, catalogNames: [...info.names], docType: checklist.docType, sourceSha256: packet.sourceSha256, evidence: evidence.reason, gapDomains: evidence.gapDomains.map((g) => g.id), uncoveredCitations: evidence.uncoveredCitations.map((c) => c.raw), findings: packet.findings.map((f) => f.ruleId), kits: packet.kits, output: out };
  queue.push(entry);
  if (action === "generate" && (!execute || stopReason || generated >= LIMIT || spent >= BUDGET)) action = "skip_failed";
  entry.status = action === "generate" ? "pending" : (existing?.status ?? "pending");
  if (action !== "generate") { tally[String(entry.status)] = (tally[String(entry.status)] ?? 0) + 1; continue; }
  if (!key) { stopReason = "LOVABLE_API_KEY_missing"; entry.status = "pending"; continue; }

  const { system, user } = buildGenerationPrompt(packet, { excerpts: evidence.excerpts, checklist, evidenceReason: evidence.reason });
  const r = await callModel(system, user, key);
  generated++;
  let status: CandidateStatus; let errors: string[] = []; let value: unknown = null; let usage = null;
  if ("stop" in r && r.stop) { stopReason = r.error; status = "generation_failed"; errors = [r.error]; }
  else if (r.error) { status = "generation_failed"; errors = [r.error]; }
  else {
    usage = r.usage ?? null;
    if (usage) spent += usage.input * PRICE.input + usage.output * PRICE.output;
    const v = kind === "draft" ? validateDraftOutput(r.text!, original) : validateContentOutput(r.text!);
    if (!v.ok) { status = "validation_failed"; errors = v.errors; }
    else {
      value = v.value;
      errors = kind === "draft" ? checkDraftCandidate(v.value as never, evidence.excerpts).errors : checkContentCandidate(v.value as never, evidence.excerpts).errors;
      status = errors.length ? "validation_failed" : "validated_generated_pending_legal_review";
    }
  }
  const record = {
    slug, kind, baseSourceSha256: packet.sourceSha256, status, attempts: (existing?.baseSourceSha256 === packet.sourceSha256 ? existing.attempts ?? 0 : 0) + 1, maxAttempts: MAX_ATTEMPTS, errors,
    legalApproval: null, inheritsHistoricalAcceptance: false, model: MODEL, promptSha256: sha(system + user), generatedAt: new Date().toISOString(), usage,
    docType: checklist.docType, evidence: { reason: evidence.reason, fetchedOn: store.fetchedOn, excerpts: evidence.excerpts.map((e) => ({ law: e.law, article: e.article, url: e.url, sha256: e.sha256 })), gapDomains: evidence.gapDomains, uncoveredCitations: evidence.uncoveredCitations.map((c) => c.raw) },
    candidate: value, rawRejected: value ? null : ("text" in r ? r.text?.slice(0, 4000) ?? null : null),
  };
  mkdirSync(dirname(assertCandidateOutputPath(out)), { recursive: true });
  writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
  entry.status = status; entry.errors = errors;
  tally[status] = (tally[status] ?? 0) + 1;
  console.log(`${status}: ${slug} ${errors.slice(0, 3).join(" ")} (≈${spent.toFixed(2)} кр.)`);
}

const qPath = assertCandidateOutputPath(`${CANDIDATE_OUTPUT_ROOT}/manifest-${kind}.json`);
mkdirSync(dirname(qPath), { recursive: true });
writeFileSync(qPath, JSON.stringify({
  kind, generatedAt: new Date().toISOString(), model: MODEL, legalApproval: null,
  counts: { uniqueOriginals: targets.size, inQueue: queue.length, catalogEntriesWithoutOriginal: noOriginal.length, orphanFiles: orphans.length, sharedFiles: shared.length, callsThisRun: generated, ...tally },
  estimatedCreditsThisRun: Number(spent.toFixed(3)), stopReason,
  catalogEntriesWithoutOriginal: noOriginal, orphanFiles: orphans, sharedFiles: shared, entries: queue,
}, null, 2) + "\n");
console.log(`${kind}: ${queue.length} в опашката, извиквания: ${generated}, ≈${spent.toFixed(2)} кр.${execute ? "" : " (dry-run)"}${stopReason ? ` спряно: ${stopReason}` : ""}`, tally);

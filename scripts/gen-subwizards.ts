/**
 * For every catalog doc that doesn't have an explicit sub-wizard in
 * `src/data/sectors.ts`, generates a *specific* sub-wizard (3-7 targeted
 * questions) via the Lovable AI gateway.
 *
 * Output:
 *   - scripts/.subwizards-cache.json    (incremental cache, resume-friendly)
 *   - src/data/subWizardsGenerated.ts   (single registry file)
 *
 * Runtime: `getSubWizard` (in src/data/sectors.ts) consults the registry
 * before falling back to `buildGenericSubWizard`. The base sector questions
 * + commonTail are still added on top, so this only contains DOC-SPECIFIC
 * fields.
 *
 * Usage:
 *   bun run scripts/gen-subwizards.ts                # generate missing + write registry
 *   LIMIT=10 bun run scripts/gen-subwizards.ts       # cap
 *   bun run scripts/gen-subwizards.ts finalize       # rebuild registry only from cache
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CATALOG } from "../src/data/catalog";
import { SECTORS } from "../src/data/sectors";

const API_KEY = process.env.LOVABLE_API_KEY;
if (!API_KEY) {
  console.error("LOVABLE_API_KEY not set");
  process.exit(1);
}

const MODEL = process.env.MODEL || "google/gemini-2.5-flash";
const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const CACHE = join(process.cwd(), "scripts/.subwizards-cache.json");
const OUT_FILE = join(process.cwd(), "src/data/subWizardsGenerated.ts");
const CONC = Number(process.env.CONC || 15);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const MODE = (process.argv[2] || "").toLowerCase();

const RESERVED_IDS = new Set([
  "party_a_name", "party_a_type", "party_a_extra",
  "party_b_name", "party_b_type", "party_b_extra",
  "penalty_pct", "penalty_cap", "termination", "notice_days",
  "force_majeure", "jurisdiction", "extra_notes",
  "group_parties", "group_terms", "group_signing",
  "subject_summary", "value_amount", "payment_terms",
  "confidentiality", "ip_rights", "special_clauses",
]);

interface GenQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "radio";
  options?: string[];
  required?: boolean;
  placeholder?: string;
  help?: string;
}
interface GenSubWizard {
  questions: GenQuestion[];
  contractName?: string;
  parties?: { a: string; b: string };
}

interface Target {
  name: string;
  sectorId: string;
  categoryId: string;
}

function loadCache(): Record<string, GenSubWizard> {
  if (!existsSync(CACHE)) return {};
  try { return JSON.parse(readFileSync(CACHE, "utf8")); }
  catch { return {}; }
}
function saveCache(cache: Record<string, GenSubWizard>) {
  writeFileSync(CACHE, JSON.stringify(cache, null, 2), "utf8");
}

function collectMissing(): Target[] {
  const explicit = new Set<string>();
  for (const s of SECTORS) for (const sw of s.subWizards || []) explicit.add(sw.documentName);
  const out: Target[] = [];
  const seen = new Set<string>();
  for (const cat of CATALOG) for (const doc of cat.documents) {
    if (explicit.has(doc.name) || seen.has(doc.name)) continue;
    seen.add(doc.name);
    out.push({ name: doc.name, sectorId: cat.sectorId, categoryId: cat.id });
  }
  return out;
}

const SYSTEM = `Ти си български юрист, който проектира wizard-формуляри за съставяне на документи. Връщаш само валиден JSON, без обяснения.`;

function prompt(t: Target): string {
  return `Проектирай 3-7 СПЕЦИФИЧНИ въпроса (полета) за wizard, който генерира документ:

Име на документа: "${t.name}"
Сектор: ${t.sectorId}

Базовите въпроси (страни, неустойка, прекратяване, подсъдност, форсмажор) се добавят АВТОМАТИЧНО — НЕ ги повтаряй.

Върни СТРОГО JSON:
{
  "parties": { "a": "...", "b": "..." },
  "contractName": "...",
  "questions": [
    {
      "id": "snake_case_unique_id",
      "label": "Кратък въпрос на български",
      "type": "text" | "textarea" | "number" | "date" | "select" | "radio",
      "options": ["...", "..."],
      "required": true,
      "placeholder": "...",
      "help": "..."
    }
  ]
}

ПРАВИЛА:
- parties: имена на страните за ТОЗИ конкретен документ (напр. за наем: "Наемодател"/"Наемател"; за пълномощно: "Упълномощител"/"Упълномощен"; за декларация — само "Декларатор" в "a", "b" може да е празен низ).
- contractName: финалното заглавие на документа (обикновено = name).
- questions: 3-7 въпроса САМО за СПЕЦИФИЧНИТЕ за този документ полета. Без общи неща като "име на страна", "ЕГН", "адрес" — те се питат от базовия слой.
- type "select" / "radio" ИЗИСКВАТ "options" с 2-6 кратки варианта.
- "options" САМО за select/radio.
- "required" по подразбиране true; false само за "по желание" полета.
- id: snake_case, латиница, уникален в рамките на този wizard. Не използвай тези резервирани: party_a_name, party_a_type, party_b_name, party_b_type, penalty_pct, penalty_cap, termination, notice_days, force_majeure, jurisdiction, extra_notes, subject_summary, value_amount, payment_terms, confidentiality, ip_rights, special_clauses.
- Валута: EUR (не лв).
- За декларации/молби/пълномощни — питай ЗА КАКВО се отнася, конкретни обстоятелства, орган, основания.
- За договори — питай за предмета, обем, срок, стойност, специфични за този ТИП клаузи.
- Българско право; стегнато и практично.

Никакъв markdown, обяснения или текст извън JSON.`;
}

async function callAI(t: Target): Promise<GenSubWizard | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: prompt(t) },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 10000 + attempt * 5000));
        continue;
      }
      if (!res.ok) {
        const tx = await res.text();
        console.error(`[${t.name}] HTTP ${res.status}: ${tx.slice(0, 200)}`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      const j: any = await res.json();
      const txt = j.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(txt) as GenSubWizard;
      if (!Array.isArray(parsed?.questions) || parsed.questions.length < 2) {
        console.error(`[${t.name}] too few questions`);
        continue;
      }
      // Sanitize
      const cleaned: GenQuestion[] = [];
      const idsSeen = new Set<string>();
      for (const q of parsed.questions) {
        if (!q || typeof q.id !== "string" || typeof q.label !== "string") continue;
        const id = q.id.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        if (!id || RESERVED_IDS.has(id) || idsSeen.has(id)) continue;
        idsSeen.add(id);
        const type = ["text", "textarea", "number", "date", "select", "radio"].includes(q.type) ? q.type : "text";
        const out: GenQuestion = { id, label: q.label.trim(), type: type as any };
        if ((type === "select" || type === "radio") && Array.isArray(q.options) && q.options.length >= 2) {
          out.options = q.options.map((o) => String(o)).slice(0, 6);
        } else if (type === "select" || type === "radio") {
          continue;
        }
        if (q.placeholder) out.placeholder = String(q.placeholder).slice(0, 200);
        if (q.help) out.help = String(q.help).slice(0, 300);
        out.required = q.required !== false;
        cleaned.push(out);
      }
      if (cleaned.length < 2) continue;
      return {
        questions: cleaned.slice(0, 7),
        contractName: parsed.contractName?.trim() || undefined,
        parties: parsed.parties && parsed.parties.a ? { a: String(parsed.parties.a), b: String(parsed.parties.b || "") } : undefined,
      };
    } catch (e: any) {
      console.error(`[${t.name}] attempt ${attempt}: ${e?.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return null;
}

async function runConc<T>(items: T[], conc: number, fn: (x: T) => Promise<any>) {
  let i = 0, done = 0;
  const workers = Array.from({ length: conc }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
      done++;
      if (done % 10 === 0 || done === items.length) {
        console.log(`  progress ${done}/${items.length}`);
      }
    }
  });
  await Promise.all(workers);
}

function writeRegistry(cache: Record<string, GenSubWizard>) {
  const entries = Object.keys(cache).sort();
  const body = `// AUTO-GENERATED by scripts/gen-subwizards.ts
// Maps catalog document name → doc-specific sub-wizard. Consumed by
// getSubWizard() in src/data/sectors.ts as a fallback before the generic
// keyword-based builder.
import type { SubWizard } from "./sectors";

const REGISTRY: Record<string, SubWizard> = ${JSON.stringify(
    Object.fromEntries(entries.map((name) => [name, { documentName: name, ...cache[name] }])),
    null,
    2,
  )};

export function getGeneratedSubWizard(documentName: string): SubWizard | undefined {
  return REGISTRY[documentName];
}

export const GENERATED_SUBWIZARD_NAMES: string[] = Object.keys(REGISTRY);
`;
  writeFileSync(OUT_FILE, body, "utf8");
  console.log(`[registry] wrote ${entries.length} entries to ${OUT_FILE}`);
}

async function main() {
  const cache = loadCache();
  if (MODE === "finalize") {
    writeRegistry(cache);
    return;
  }
  let targets = collectMissing().filter((t) => !cache[t.name]);
  if (LIMIT < targets.length) targets = targets.slice(0, LIMIT);
  console.log(`Targets to generate: ${targets.length} (conc=${CONC}). Cache has ${Object.keys(cache).length}.`);

  let ok = 0, fail = 0, since = 0;
  await runConc(targets, CONC, async (t) => {
    const r = await callAI(t);
    if (r) {
      cache[t.name] = r;
      ok++;
      since++;
      if (since >= 25) { saveCache(cache); since = 0; }
    } else {
      fail++;
    }
  });
  saveCache(cache);
  console.log(`Generated: ${ok} ok, ${fail} fail. Cache total: ${Object.keys(cache).length}`);
  writeRegistry(cache);
}

main().catch((e) => { console.error(e); process.exit(1); });

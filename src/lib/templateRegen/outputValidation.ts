/**
 * Структурирани схеми и строга валидация на AI изхода (без двойно JSON-кодиране).
 */
import type { TemplateContent } from "@/data/templateContentTypes";

const strArr = { type: "array", items: { type: "string" } } as const;
const changes = { type: "array", items: { type: "object", additionalProperties: false, required: ["finding", "change"], properties: { finding: { type: "string" }, change: { type: "string" } } } } as const;

export const DRAFT_OUTPUT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["scenarios", "unverifiedLegalBases", "unresolvedFacts", "changes"],
  properties: {
    scenarios: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label", "text", "decisiveFields"], properties: { id: { type: "string" }, label: { type: "string" }, text: { type: "string" }, decisiveFields: strArr } } },
    unverifiedLegalBases: strArr, unresolvedFacts: strArr, changes,
  },
} as const;

export const CONTENT_OUTPUT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["content", "unverifiedLegalBases", "changes"],
  properties: {
    content: {
      type: "object", additionalProperties: false, required: ["intro", "usageCases", "requirements", "mistakes", "faq"],
      properties: {
        intro: { type: "string" }, usageCases: strArr, requirements: strArr, mistakes: strArr,
        faq: { type: "array", items: { type: "object", additionalProperties: false, required: ["q", "a", "law"], properties: { q: { type: "string" }, a: { type: "string" }, law: { type: ["string", "null"] } } } },
      },
    },
    unverifiedLegalBases: strArr, changes,
  },
} as const;

export interface DraftOutput { scenarios: { id: string; label: string; text: string; decisiveFields: string[] }[]; unverifiedLegalBases: string[]; unresolvedFacts: string[]; changes: { finding: string; change: string }[] }
export interface ContentOutput { content: Omit<TemplateContent, "faq"> & { faq: { q: string; a: string; law: string | null }[] }; unverifiedLegalBases: string[]; changes: { finding: string; change: string }[] }

const isStrArr = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");
const nonEmpty = (s: unknown) => typeof s === "string" && s.trim().length > 0;
const balanced = (t: string) => { let d = 0; for (const c of t) { if (c === "[") d++; else if (c === "]" && --d < 0) return false; } return d === 0; };

export function validateDraftOutput(raw: string, originalText: string): { ok: true; value: DraftOutput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let v: DraftOutput;
  try { v = JSON.parse(raw); } catch { return { ok: false, errors: ["invalid_json"] }; }
  if (!v || typeof v !== "object" || !Array.isArray(v.scenarios)) return { ok: false, errors: ["schema_scenarios"] };
  if (!v.scenarios.length) errors.push("no_scenarios");
  const ids = new Set<string>();
  for (const s of v.scenarios) {
    if (!nonEmpty(s?.id) || !nonEmpty(s?.label) || !nonEmpty(s?.text) || !isStrArr(s?.decisiveFields)) { errors.push("schema_scenario"); continue; }
    if (ids.has(s.id)) errors.push(`duplicate_id:${s.id}`); ids.add(s.id);
    if (/^\s*[{["]/.test(s.text) && /"text"\s*:/.test(s.text)) errors.push(`nested_json_in_text:${s.id}`);
    if (/```/.test(s.text)) errors.push(`markdown_fence:${s.id}`);
    if (!balanced(s.text)) errors.push(`unbalanced_brackets:${s.id}`);
    // Защита от отрязан изход — не целева дължина: сценарият не може да е под 25% от оригинала.
    if (s.text.length < Math.min(400, originalText.length * 0.25)) errors.push(`suspiciously_short:${s.id}`);
  }
  if (!isStrArr(v.unverifiedLegalBases) || !isStrArr(v.unresolvedFacts) || !Array.isArray(v.changes)) errors.push("schema_lists");
  return errors.length ? { ok: false, errors } : { ok: true, value: v };
}

export function validateContentOutput(raw: string): { ok: true; value: ContentOutput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let v: ContentOutput;
  try { v = JSON.parse(raw); } catch { return { ok: false, errors: ["invalid_json"] }; }
  const c = v?.content;
  if (!c || typeof c !== "object") return { ok: false, errors: ["schema_content"] };
  if (!nonEmpty(c.intro)) errors.push("empty_intro");
  for (const k of ["usageCases", "requirements", "mistakes"] as const) if (!isStrArr(c[k]) || !c[k].length || !c[k].every(nonEmpty)) errors.push(`empty_${k}`);
  if (!Array.isArray(c.faq) || !c.faq.length || !c.faq.every((f) => nonEmpty(f?.q) && nonEmpty(f?.a))) errors.push("empty_faq");
  if (JSON.stringify(c).includes("```")) errors.push("markdown_fence");
  if (!isStrArr(v.unverifiedLegalBases) || !Array.isArray(v.changes)) errors.push("schema_lists");
  return errors.length ? { ok: false, errors } : { ok: true, value: v };
}

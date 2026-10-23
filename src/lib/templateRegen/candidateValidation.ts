/**
 * Проверки върху вече структурно валидиран AI изход — преди да се маркира
 * като „validated_generated“. Нищо тук не е правно одобрение.
 */
import { parseCitations, type EvidenceExcerpt } from "./evidence";
import { scanTemplateText } from "./catalogChecks";
import type { ContentOutput, DraftOutput } from "./outputValidation";

export type CandidateStatus = "validated_generated_pending_legal_review" | "validation_failed" | "generation_failed";

const BAD_TOKENS = /\b(null|undefined|NaN)\b|\[\s*\]|\{\{|\}\}/;

function citationIssues(text: string, excerpts: readonly EvidenceExcerpt[], flagged: readonly string[]): string[] {
  const have = new Set(excerpts.map((e) => `${e.law}:${e.article}`));
  const flaggedText = flagged.join(" ");
  const out: string[] = [];
  for (const c of parseCitations(text)) {
    if (have.has(`${c.law}:${c.article}`)) continue;
    // Непрочетено основание е допустимо само ако е изрично маркирано.
    const marked = text.includes(`НЕПРОВЕРЕНО ОСНОВАНИЕ`) && (flaggedText.includes(c.article) || flaggedText.includes(c.raw));
    if (!marked && !flaggedText.includes(c.raw) && !flaggedText.includes(`чл. ${c.article}`)) out.push(`unflagged_unverified_citation:${c.law} ${c.article}`);
  }
  return out;
}

export function checkDraftCandidate(v: DraftOutput, excerpts: readonly EvidenceExcerpt[]): { errors: string[]; residualFindings: string[] } {
  const errors: string[] = [];
  const residual: string[] = [];
  for (const s of v.scenarios) {
    if (BAD_TOKENS.test(s.text)) errors.push(`bad_token:${s.id}`);
    errors.push(...citationIssues(s.text, excerpts, v.unverifiedLegalBases).map((e) => `${e}@${s.id}`));
    for (const f of scanTemplateText(s.text)) if (f.severity === "legal_error" || f.severity === "material_risk") residual.push(`${f.ruleId}@${s.id}`);
    const fields = new Set([...s.text.matchAll(/\[([^[\]]+)\]/gu)].map((m) => m[1]));
    for (const d of s.decisiveFields) if (!fields.has(d)) errors.push(`decisive_field_not_in_text:${s.id}:${d.slice(0, 40)}`);
  }
  if (residual.length) errors.push(...residual.map((r) => `residual_finding:${r}`));
  return { errors, residualFindings: residual };
}

export function checkContentCandidate(v: ContentOutput, excerpts: readonly EvidenceExcerpt[]): { errors: string[] } {
  const text = JSON.stringify(v.content);
  const errors: string[] = [];
  if (BAD_TOKENS.test(text.replace(/"law":null/g, ""))) errors.push("bad_token");
  const lawText = [text, ...v.content.faq.map((f) => f.law ?? "")].join(" ");
  errors.push(...citationIssues(lawText, excerpts, v.unverifiedLegalBases));
  return { errors };
}

/**
 * Conditional Clause Engine.
 *
 * Given a set of clauses (each with an `include_when` predicate and an
 * ordered body) and an `answers` context, assemble the final document text
 * with token substitution. Tokens look like `{{ field_name }}` and resolve
 * against the same answers object. Missing tokens render as an empty string
 * and are reported in the result so the UI can warn about unfilled fields.
 *
 * Clauses can be sourced from either a static per-template definition file
 * or from the `template_clauses` Supabase table (DB-backed editing).
 */

import { evaluateExpression, type Ctx } from "./expressionEvaluator";
import { resolveAnswerLabel, type QuestionGraph } from "./questionGraph";

export interface ClauseDefinition {
  clause_id: string;
  template_slug: string;
  title: string;
  /** Markdown body with `{{tokens}}` to be substituted at render time. */
  body_md: string;
  /** Predicate; clause is included only when truthy. Empty = always. */
  include_when?: string | null;
  /** Order index within the assembled document. */
  order: number;
  /** "required" | "recommended" | "optional" — for risk reporting. */
  severity?: "required" | "recommended" | "optional";
}

export interface AssembledClause {
  clause_id: string;
  title: string;
  body: string;
  order: number;
  included: boolean;
}

export interface AssembledDocument {
  clauses: AssembledClause[];
  /** Concatenated body, in order, for included clauses. */
  body_md: string;
  /** Token names that appeared in clauses but had no value in `answers`. */
  unfilledTokens: string[];
  /** Excluded clauses (kept for diff/preview UIs). */
  excluded: AssembledClause[];
}

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function resolveToken(path: string, ctx: Ctx): unknown {
  const parts = path.split(".");
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function substitute(
  body: string,
  ctx: Ctx,
  unfilled: Set<string>,
  graph?: QuestionGraph | null,
): string {
  return body.replace(TOKEN_RE, (_m, name: string) => {
    const v = resolveToken(name, ctx);
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) {
      unfilled.add(name);
      const label = name.split(".").pop()!.toUpperCase();
      return `[${label}]`;
    }
    // Resolve top-level question ids to their human label (so enum values
    // like "as_is" render as "Във вида, в който е", not the raw key).
    if (graph && !name.includes(".")) {
      const resolved = resolveAnswerLabel(graph, name, v);
      if (resolved != null) return resolved;
    }
    if (Array.isArray(v)) return v.join(", ");
    return String(v);
  });
}


export function assembleDocument(
  clauses: ClauseDefinition[],
  answers: Ctx,
  graph?: QuestionGraph | null,
): AssembledDocument {
  const unfilled = new Set<string>();
  const sorted = [...clauses].sort((a, b) => a.order - b.order);
  const out: AssembledClause[] = [];
  const excluded: AssembledClause[] = [];

  for (const c of sorted) {
    const include = evaluateExpression(c.include_when, answers);
    const body = include ? substitute(c.body_md, answers, unfilled, graph) : c.body_md;
    const entry: AssembledClause = {
      clause_id: c.clause_id,
      title: c.title,
      body,
      order: c.order,
      included: include,
    };
    if (include) out.push(entry);
    else excluded.push(entry);
  }

  const body_md = out
    .map((c) => (c.title ? `## ${c.title}\n\n${c.body}` : c.body))
    .join("\n\n");

  return { clauses: out, body_md, unfilledTokens: [...unfilled], excluded };
}

/**
 * Compute which clause IDs changed inclusion between two answer sets.
 * Useful for highlighting in the live-preview pane.
 */
export function diffInclusion(
  clauses: ClauseDefinition[],
  before: Ctx,
  after: Ctx,
): { added: string[]; removed: string[] } {
  const wasIn = new Set<string>();
  const isIn = new Set<string>();
  for (const c of clauses) {
    if (evaluateExpression(c.include_when, before)) wasIn.add(c.clause_id);
    if (evaluateExpression(c.include_when, after)) isIn.add(c.clause_id);
  }
  const added = [...isIn].filter((id) => !wasIn.has(id));
  const removed = [...wasIn].filter((id) => !isIn.has(id));
  return { added, removed };
}

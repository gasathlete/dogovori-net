/**
 * Question Graph — single source of truth for dynamic decision trees.
 *
 * A question graph defines:
 *   - the questions the wizard can ask for a template,
 *   - the conditions under which each question is visible/required,
 *   - the clause IDs each answer may activate or deactivate.
 *
 * Per-template graphs live in `src/data/questionGraphs/<slug>.ts`.
 * The runtime resolver in this file evaluates the graph against a partial
 * `answers` object and returns the active question list, completion %, and
 * the set of clause IDs that should be included in the assembled document.
 */

import { evaluateExpression, type Ctx } from "./expressionEvaluator";

export type FieldType =
  | "text"
  | "longtext"
  | "number"
  | "money"
  | "date"
  | "select"
  | "multiselect"
  | "boolean"
  | "party_list"
  | "signature";

export interface QuestionOption {
  value: string;
  label: string;
  /** Optional helper text shown under the option. */
  description?: string;
}

export interface QuestionNode {
  /** Stable identifier; used as the answers key and in expressions. */
  id: string;
  /** Section grouping for the wizard progress indicator. */
  section: string;
  label: string;
  help?: string;
  field_type: FieldType;
  options?: QuestionOption[];
  /** Whitelist of clause IDs this question may turn on/off. Informational. */
  affects_clauses?: string[];
  /** Predicate; question is shown only when this evaluates truthy. */
  visible_when?: string;
  /** Predicate; question is required when this evaluates truthy. */
  required_when?: string;
  /** Default value if user has not answered. */
  default?: unknown;
  /** Optional client-side validation expression returning boolean. */
  valid_when?: string;
  /** Free-form metadata for the renderer. */
  meta?: Record<string, unknown>;
}

export interface QuestionGraph {
  template_slug: string;
  /** Display title shown in the wizard header. */
  title: string;
  /** Ordered section list for the progress stepper. */
  sections: { id: string; title: string; description?: string }[];
  questions: QuestionNode[];
}

export interface ResolvedQuestion extends QuestionNode {
  required: boolean;
}

export interface ResolvedGraph {
  /** Questions currently visible, in declared order. */
  active: ResolvedQuestion[];
  /** Active questions grouped by section, in declared section order. */
  sections: { id: string; title: string; description?: string; questions: ResolvedQuestion[] }[];
  /** Completion percentage based on required-and-answered count. */
  progress: number;
  /** IDs of required questions that are still unanswered. */
  missingRequired: string[];
  /** Whether the answers satisfy every required-visible question. */
  isComplete: boolean;
}

function isAnswered(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function resolveGraph(graph: QuestionGraph, answers: Ctx): ResolvedGraph {
  const ctx: Ctx = { ...answers };
  const active: ResolvedQuestion[] = [];
  const missing: string[] = [];
  let requiredCount = 0;
  let satisfied = 0;

  for (const q of graph.questions) {
    const visible = evaluateExpression(q.visible_when, ctx);
    if (!visible) continue;
    const required = evaluateExpression(q.required_when, ctx);
    active.push({ ...q, required });
    if (required) {
      requiredCount++;
      if (isAnswered(ctx[q.id])) satisfied++;
      else missing.push(q.id);
    }
  }

  const sections = graph.sections
    .map((s) => ({
      ...s,
      questions: active.filter((q) => q.section === s.id),
    }))
    .filter((s) => s.questions.length > 0);

  return {
    active,
    sections,
    progress: requiredCount === 0 ? 100 : Math.round((satisfied / requiredCount) * 100),
    missingRequired: missing,
    isComplete: missing.length === 0,
  };
}

/**
 * Return only the answers belonging to currently-visible questions. Use this
 * before persisting/exporting to drop stale answers from branches the user
 * has since navigated away from.
 */
export function pruneAnswers(graph: QuestionGraph, answers: Ctx): Ctx {
  const resolved = resolveGraph(graph, answers);
  const allowed = new Set(resolved.active.map((q) => q.id));
  const out: Ctx = {};
  for (const [k, v] of Object.entries(answers)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

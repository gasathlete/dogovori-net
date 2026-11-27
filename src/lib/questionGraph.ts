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

/**
 * Resolve a question's suggested default for auto-accept-on-empty UX.
 * Returns null if there's nothing to suggest.
 */
export function resolveQuestionDefault(q: QuestionNode, ctx: Ctx): unknown {
  if (q.default == null) return null;
  if (typeof q.default === "string") {
    // Try expression evaluation; if it fails or returns null, fall back to the literal string.
    try {
      const evald = evaluateExpression(q.default, ctx);
      if (evald != null && evald !== false) return evald;
    } catch { /* noop */ }
    return q.default;
  }
  return q.default;
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
    // Missing required_when => optional by default (only explicit predicate marks required)
    const required = q.required_when ? evaluateExpression(q.required_when, ctx) : false;
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

/**
 * Resolve a stored answer to a human-readable label for document
 * interpolation. For `select` it returns the matching option's `label`,
 * for `multiselect` joined labels, for `boolean` "Да"/"Не", and for
 * everything else the raw value. Returns null on empty values.
 */
export function resolveAnswerLabel(
  graph: QuestionGraph | null | undefined,
  questionId: string,
  value: unknown,
): string | null {
  if (value == null || value === "") return null;
  const q = graph?.questions.find((x) => x.id === questionId);
  if (!q) {
    if (Array.isArray(value)) return value.length ? value.join(", ") : null;
    return String(value);
  }
  if (q.field_type === "select") {
    const opt = q.options?.find((o) => o.value === value);
    return opt?.label ?? String(value);
  }
  if (q.field_type === "multiselect") {
    if (!Array.isArray(value) || value.length === 0) return null;
    const labels = value.map((v) => {
      const opt = q.options?.find((o) => o.value === v);
      return opt?.label ?? String(v);
    });
    return labels.join(", ");
  }
  if (q.field_type === "boolean") {
    return value === true ? "Да" : value === false ? "Не" : String(value);
  }
  if (Array.isArray(value)) return value.length ? value.join(", ") : null;
  return String(value);
}

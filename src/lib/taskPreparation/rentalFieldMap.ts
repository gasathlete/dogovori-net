/**
 * Изрични, проверени съответствия: отговор от подготовката → поле в
 * съществуващия въпросник на документа. Само графи, които реално съществуват
 * и имат същия смисъл на полето. Всичко немапнато остава за попълване в
 * самия документ.
 *
 * Стойностите се превръщат във формата, която класическият въпросник пази:
 * етикет на опцията за select, „Да“/„Не“ за boolean, текст за останалото.
 * Страните се пренасят като правно-организационна форма — точно това, което
 * PartyBlock на въпросника пази (той не събира имена).
 */
import type { Ctx } from "@/lib/expressionEvaluator";
import type { QuestionGraph } from "@/lib/questionGraph";
import { getQuestionGraph } from "@/data/questionGraphs/dogovor-za-naem-na-zhilishte";

export const LEASE_SLUG = "dogovor-za-naem-na-zhilishte";
export const RECEIPT_SLUG = "razpiska-za-poluchena-suma-naem-depozit";

type Mapping = { from: string; to: string; value?: (v: unknown) => unknown };

export const RENTAL_FIELD_MAPS: Readonly<Record<string, readonly Mapping[]>> = {
  [LEASE_SLUG]: [
    { from: "landlord", to: "landlord" },
    { from: "tenant", to: "tenant" },
    { from: "property_type", to: "property_type" },
    { from: "property_address", to: "property_address" },
    { from: "furniture_included", to: "furniture_included" },
    { from: "term_type", to: "term_type" },
    { from: "start_date", to: "start_date" },
    { from: "end_date", to: "end_date" },
    { from: "monthly_rent", to: "monthly_rent" },
    { from: "payment_day", to: "payment_day" },
    { from: "payment_method", to: "payment_method" },
    { from: "has_deposit", to: "has_deposit" },
    { from: "deposit_amount", to: "deposit_amount" },
  ],
  [RECEIPT_SLUG]: [
    { from: "landlord", to: "landlord" },
    { from: "tenant", to: "tenant" },
    { from: "property_address", to: "property_address" },
    // Различни стойности в двата графа — изрично съответствие.
    { from: "payment_method", to: "payment_method", value: (v) => (v === "cash" ? "cash" : v === "bank_transfer" ? "bank" : undefined) },
  ],
};

function toWizardString(graph: QuestionGraph, id: string, v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  const q = graph.questions.find((x) => x.id === id);
  if (!q) return undefined;
  if (q.field_type === "boolean") return v === true ? "Да" : v === false ? "Не" : undefined;
  if (q.field_type === "select") return q.options?.find((o) => o.value === v)?.label;
  if (q.field_type === "party_list") return typeof v === "string" ? v : undefined;
  return String(v);
}

export function hasRentalPrefill(slug: string): boolean {
  return slug in RENTAL_FIELD_MAPS;
}

/** Стойности за предварително попълване на въпросника на документа `slug`. */
export function buildRentalPrefill(slug: string, prep: Ctx): Record<string, string> {
  const maps = RENTAL_FIELD_MAPS[slug];
  const graph = maps ? getQuestionGraph(slug) : null;
  if (!maps || !graph) return {};
  const out: Record<string, string> = {};
  for (const m of maps) {
    const raw = m.value ? m.value(prep[m.from]) : prep[m.from];
    const s = toWizardString(graph, m.to, raw);
    if (s !== undefined) out[m.to] = s;
  }
  return out;
}

export interface PrefillPlan {
  /** Безопасно за прилагане: празни или непроменени от потребителя полета. */
  apply: Record<string, string>;
  /** Полета, редактирани от потребителя, които подготовката би сменила. */
  conflicts: Record<string, string>;
}

/**
 * Решава какво може да се приложи без да се презапише редакция на
 * потребителя. `previous` е последно приложеното от подготовката.
 */
export function planPrefill(
  next: Record<string, string>,
  current: Record<string, string>,
  previous: Record<string, string> | undefined,
): PrefillPlan {
  const apply: Record<string, string> = {};
  const conflicts: Record<string, string> = {};
  for (const [id, val] of Object.entries(next)) {
    const cur = current[id] ?? "";
    if (cur === val) continue;
    const untouched = cur.trim() === "" || (previous !== undefined && previous[id] === cur);
    if (untouched) apply[id] = val;
    else conflicts[id] = val;
  }
  return { apply, conflicts };
}

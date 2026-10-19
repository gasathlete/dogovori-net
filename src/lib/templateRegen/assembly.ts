/**
 * Сглобяване на кандидат-текст от одобрени модули (сценарии).
 *
 * - Бланка: незапълнените полета остават видимо маркирани.
 * - Персонализиран окончателен документ: блокира при липса на решаващо поле
 *   или при отговор „Не знам“. „Не знам“ никога не се превръща в „не“.
 * - Свободно написан текст (напр. от AI) не е одобрен модул; ако бъде подаден,
 *   резултатът е само чернова за преглед.
 */
import type { AssemblyMode, CandidateScenario, TriStateAnswer } from "./types";
import { PLACEHOLDER } from "./catalogChecks";

export type AssemblyResult =
  | { status: "blank"; text: string; openFields: string[] }
  | { status: "final_ready"; text: string }
  | { status: "blocked"; missingDecisive: string[]; unknownDecisive: string[] }
  | { status: "draft_review_required"; text: string; reason: "free_text_material_clause" };

const label = (ph: string) => ph.slice(1, -1).trim();

export function assembleScenario(
  scenario: CandidateScenario,
  answers: Readonly<Record<string, TriStateAnswer>>,
  mode: AssemblyMode,
  freeTextClauses: readonly string[] = [],
): AssemblyResult {
  if (mode === "personalized_final") {
    const missing: string[] = [];
    const unknown: string[] = [];
    for (const f of scenario.decisiveFields) {
      const a = answers[f];
      if (!a) missing.push(f);
      else if (a.state === "unknown") unknown.push(f);
      else if (a.state === "value" && !a.value.trim()) missing.push(f);
    }
    if (missing.length || unknown.length) return { status: "blocked", missingDecisive: missing, unknownDecisive: unknown };
  }

  const text = scenario.text.replace(PLACEHOLDER, (ph) => {
    const a = answers[label(ph)];
    if (a?.state === "value" && a.value.trim()) return a.value;
    if (a?.state === "no") return "НЕ СЕ ПРИЛАГА";
    return ph; // „Не знам“ и липсващо остават маркирани
  });
  const withFree = freeTextClauses.length ? `${text}\n\n${freeTextClauses.join("\n\n")}` : text;

  if (freeTextClauses.length) return { status: "draft_review_required", text: withFree, reason: "free_text_material_clause" };
  if (mode === "blank") return { status: "blank", text: withFree, openFields: [...new Set((withFree.match(PLACEHOLDER) ?? []).map(label))] };
  return { status: "final_ready", text: withFree };
}

/**
 * Сглобяване на кандидат-текст от одобрени модули (сценарии).
 *
 * - Бланка: незапълнените полета остават видимо маркирани.
 * - Персонализиран документ: блокира, ако решаващо поле няма стойност, ако
 *   положителна предпоставка не е изрично потвърдена ({state:"confirmed"}),
 *   ако остане какъвто и да е незапълнен/вложен placeholder или условна
 *   инструкция, или ако сценарният валидатор (напр. капитал) намери грешка.
 * - „Не“ ({state:"no"}) е допустимо само за изрично nullable поле или за
 *   условен блок „[ПРИ …: …]“ (тогава блокът се премахва). „Не знам“ никога
 *   не е „не“.
 * - Резултатът никога не е „окончателен/правно одобрен“: всички кандидати са
 *   legalApproval:null, затова най-доброто състояние е filled_candidate_draft.
 *   Одобрението не може да дойде от caller/client флаг.
 * - Свободно написан текст (напр. от AI) не е одобрен модул → чернова за преглед.
 */
import type { AssemblyMode, CandidateScenario, TemplateCandidate, TriStateAnswer } from "./types";
import { validateCapital } from "./capital";

export type AssemblyResult =
  | { status: "blank"; text: string; openFields: string[] }
  | { status: "filled_candidate_draft"; text: string; legallyApproved: false }
  | {
      status: "blocked";
      missingDecisive: string[];
      unknownDecisive: string[];
      invalidNo: string[];
      unconfirmedPreconditions: string[];
      residualPlaceholders: string[];
      validationIssues: string[];
    }
  | { status: "draft_review_required"; text: string; reason: "free_text_material_clause" };

type Answers = Readonly<Record<string, TriStateAnswer>>;

const CONDITIONAL = /^ПРИ\s[^:]*:\s*/;

/** Разделя текста на най-външни групи в квадратни скоби (поддържа влагане). */
function renderGroups(text: string, render: (inner: string) => string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch !== "[") { out += ch; i++; continue; }
    let depth = 0; let j = i;
    for (; j < text.length; j++) {
      if (text[j] === "[") depth++;
      else if (text[j] === "]" && --depth === 0) break;
    }
    if (j >= text.length) { out += text.slice(i); break; } // небалансирана — остава
    out += render(text.slice(i + 1, j));
    i = j + 1;
  }
  return out;
}

function substitute(text: string, answers: Answers, nullable: ReadonlySet<string>): string {
  return renderGroups(text, (inner) => {
    const lbl = inner.trim();
    const a = answers[lbl];
    if (CONDITIONAL.test(lbl)) {
      if (a?.state === "no") return "";
      if (a?.state === "confirmed") return substitute(lbl.replace(CONDITIONAL, ""), answers, nullable);
      return `[${substitute(inner, answers, nullable)}]`;
    }
    if (a?.state === "value" && a.value.trim()) return a.value;
    if (a?.state === "no" && nullable.has(lbl)) return "НЕ СЕ ПРИЛАГА";
    return `[${substitute(inner, answers, nullable)}]`;
  });
}

function residual(text: string): string[] {
  const found: string[] = [];
  renderGroups(text, (inner) => { found.push(inner.trim()); return ""; });
  if (/[[\]]/.test(renderGroups(text, () => ""))) found.push("небалансирана скоба");
  return [...new Set(found)];
}

const num = (s: string | undefined) => {
  if (!s) return NaN;
  const t = s.replace(/\s/g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
};
const val = (a: Answers, k: string) => { const x = a[k]; return x?.state === "value" ? x.value : undefined; };

/** Сценарни валидатори по slug — извикват се задължително при персонализация. */
export const SCENARIO_VALIDATORS: Readonly<Record<string, (s: CandidateScenario, a: Answers) => string[]>> = {
  "uchreditelen-akt-na-eood": (s, a) => {
    const issues: string[] = [];
    const capitalEur = num(val(a, "КАПИТАЛ В EUR"));
    const sharesCount = num(val(a, "БРОЙ ДЯЛОВЕ"));
    const shareNominalEur = num(val(a, "НОМИНАЛ НА ДЯЛ В EUR"));
    if ([capitalEur, sharesCount, shareNominalEur].some(Number.isNaN)) issues.push("capital_not_numeric");
    else issues.push(...validateCapital({ capitalEur, sharesCount, shareNominalEur }));
    if (s.id === "public_copy") issues.push("public_copy_redaction_rules_unresolved");
    return issues;
  },
};

export function assembleScenario(
  candidate: Pick<TemplateCandidate, "slug" | "legalApproval">,
  scenario: CandidateScenario,
  answers: Answers,
  mode: AssemblyMode,
  freeTextClauses: readonly string[] = [],
): AssemblyResult {
  const nullable = new Set(scenario.nullableFields ?? []);
  const text = substitute(scenario.text, answers, nullable);
  const withFree = freeTextClauses.length ? `${text}\n\n${freeTextClauses.join("\n\n")}` : text;

  if (mode === "blank") {
    if (freeTextClauses.length) return { status: "draft_review_required", text: withFree, reason: "free_text_material_clause" };
    return { status: "blank", text: withFree, openFields: residual(withFree) };
  }

  const missing: string[] = []; const unknown: string[] = []; const invalidNo: string[] = [];
  for (const f of scenario.decisiveFields) {
    const a = answers[f];
    if (!a || (a.state === "value" && !a.value.trim())) missing.push(f);
    else if (a.state === "unknown") unknown.push(f);
    else if (a.state === "no" && !nullable.has(f)) invalidNo.push(f);
    else if (a.state === "confirmed") invalidNo.push(f); // потвърждението не е стойност
  }
  const unconfirmed = (scenario.preconditions ?? []).filter((p) => answers[p]?.state !== "confirmed");
  const residualPlaceholders = residual(text);
  const validator = SCENARIO_VALIDATORS[candidate.slug];
  const validationIssues = validator ? validator(scenario, answers) : [];

  if (missing.length || unknown.length || invalidNo.length || unconfirmed.length || residualPlaceholders.length || validationIssues.length) {
    return { status: "blocked", missingDecisive: missing, unknownDecisive: unknown, invalidNo, unconfirmedPreconditions: unconfirmed, residualPlaceholders, validationIssues };
  }
  if (freeTextClauses.length) return { status: "draft_review_required", text: withFree, reason: "free_text_material_clause" };
  // legalApproval е типово null за всички кандидати — няма път към одобрен окончателен документ.
  return { status: "filled_candidate_draft", text: withFree, legallyApproved: false };
}

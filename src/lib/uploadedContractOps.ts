/**
 * Q2b2 — чиста логика за екрана на качен договор: защита срещу закъснели
 * отговори, оптимистичен запис (compare-and-set) и ТОЧЕН избор на корекции.
 *
 * Нищо тук не пипа мрежата — заявките се подават като инжектирани функции, за да
 * може реалното поведение да се тества с отложени обещания.
 */

import {
  isSourceBindingEqual,
  type AnalysisSourceBinding,
  type SnapshotFreshness,
} from "@/lib/analysisSourceBinding";

/** Идентичност на изгледа: закъснял отговор за друг документ/потребител се отхвърля. */
export interface ViewIdentity {
  docId: string | null | undefined;
  userId: string | null | undefined;
}

export function isSameViewIdentity(a: ViewIdentity, b: ViewIdentity): boolean {
  return !!a.docId && !!a.userId && a.docId === b.docId && a.userId === b.userId;
}

/**
 * Резултат от асинхронна заявка се прилага само ако е стартиран от текущия
 * токен И идентичността на изгледа не е сменена (маршрут, изход от профила).
 */
export function shouldApplyAsyncResult(input: {
  startedToken: number;
  currentToken: number;
  startedIdentity: ViewIdentity;
  currentIdentity: ViewIdentity;
}): boolean {
  if (input.startedToken !== input.currentToken) return false;
  return isSameViewIdentity(input.startedIdentity, input.currentIdentity);
}

// ---------------------------------------------------------------------------
// Оптимистичен запис (CAS по updated_at)
// ---------------------------------------------------------------------------

export type CasOutcome<TRow> =
  | { kind: "ok"; row: TRow }
  | { kind: "conflict" }
  | { kind: "error"; message: string };

/**
 * `0` върнати реда означава, че документът е бил променен другаде — това НЕ е
 * успех и НЕ е грешка на сървъра. Локалните чернови се запазват.
 */
export function classifyCasResult<TRow>(result: {
  data: TRow | null | undefined;
  error: { message?: string } | null | undefined;
}): CasOutcome<TRow> {
  if (result.error) return { kind: "error", message: result.error.message || "Грешка при запис" };
  if (!result.data) return { kind: "conflict" };
  return { kind: "ok", row: result.data };
}

export const CAS_CONFLICT_MESSAGE =
  "Документът е променен на друго място. Вашият текст не е презаписан — прегледайте разликите и опитайте пак.";

// ---------------------------------------------------------------------------
// Точен избор на корекции
// ---------------------------------------------------------------------------

export interface CorrectionSelection {
  selectedIssueIndices: number[];
  selectedMissingIndices: number[];
}

function pickIndices(count: number, sel: Record<number, boolean>): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) if (sel[i]) out.push(i);
  return out;
}

/**
 * Празна категория остава ПРАЗНА — никакво „падане" към всички находки.
 */
export function buildCorrectionSelection(input: {
  issuesCount: number;
  missingCount: number;
  issueSel: Record<number, boolean>;
  missingSel: Record<number, boolean>;
}): CorrectionSelection {
  return {
    selectedIssueIndices: pickIndices(input.issuesCount, input.issueSel),
    selectedMissingIndices: pickIndices(input.missingCount, input.missingSel),
  };
}

export function selectionTotal(sel: CorrectionSelection): number {
  return sel.selectedIssueIndices.length + sel.selectedMissingIndices.length;
}

export interface CorrectionRequestPayload {
  uploadedContractId: string;
  analysisId: string;
  expectedSourceBinding: AnalysisSourceBinding;
  selectedIssueIndices: number[];
  selectedMissingIndices: number[];
  userConfirmed: boolean;
}

/**
 * Заявката се изгражда САМО при актуална снимка и валидно обвързване.
 * Ако нещо липсва, връщаме причина — без AI повикване.
 */
export function buildCorrectionRequest(input: {
  uploadedContractId: string | null | undefined;
  analysisId: string | null | undefined;
  currentBinding: AnalysisSourceBinding | null;
  freshness: SnapshotFreshness;
  selection: CorrectionSelection;
  userConfirmed: boolean;
}):
  | { ok: true; payload: CorrectionRequestPayload }
  | { ok: false; reason: "no_document" | "no_analysis" | "not_current" | "empty_selection" } {
  if (!input.uploadedContractId) return { ok: false, reason: "no_document" };
  if (!input.analysisId) return { ok: false, reason: "no_analysis" };
  if (input.freshness !== "current" || !input.currentBinding) {
    return { ok: false, reason: "not_current" };
  }
  if (selectionTotal(input.selection) === 0) return { ok: false, reason: "empty_selection" };
  return {
    ok: true,
    payload: {
      uploadedContractId: input.uploadedContractId,
      analysisId: input.analysisId,
      expectedSourceBinding: input.currentBinding,
      selectedIssueIndices: [...input.selection.selectedIssueIndices],
      selectedMissingIndices: [...input.selection.selectedMissingIndices],
      userConfirmed: input.userConfirmed,
    },
  };
}

export const CORRECTION_REQUEST_MESSAGES: Record<
  "no_document" | "no_analysis" | "not_current" | "empty_selection",
  string
> = {
  no_document: "Документът не е зареден.",
  no_analysis: "Нужен е анализ, преди да предложим корекции.",
  not_current:
    "Анализът не се отнася за текущия текст. Запазете промените и направете нов анализ, преди да поискате корекции.",
  empty_selection: "Изберете поне едно подобрение.",
};

// ---------------------------------------------------------------------------
// Резултат от корекция — валиден само за източника, върху който е направен
// ---------------------------------------------------------------------------

export interface CorrectionResult {
  corrected_text: string;
  changes: string[];
  analysisId: string | null;
  sourceBinding: AnalysisSourceBinding | null;
}

/**
 * Закъснял или изостарял резултат: липсваща идентичност, различен документ/
 * анализ или променен източник. Еднакъв отпечатък САМ по себе си не е
 * достатъчен — резултат без известен анализ от двете страни се смята изостанал.
 */
export function isCorrectionStale(input: {
  correction: Pick<CorrectionResult, "analysisId" | "sourceBinding"> | null;
  analysisId: string | null | undefined;
  currentBinding: AnalysisSourceBinding | null;
  freshness: SnapshotFreshness;
}): boolean {
  if (!input.correction) return false;
  if (!input.correction.sourceBinding) return true;
  if (!input.correction.analysisId || !input.analysisId) return true;
  if (input.correction.analysisId !== input.analysisId) return true;
  if (input.freshness !== "current" || !input.currentBinding) return true;
  return !isSourceBindingEqual(input.correction.sourceBinding, input.currentBinding);
}


export const STALE_CORRECTION_NOTICE =
  "Документът е променен, след като тази редакция беше изготвена. Тя не отговаря на текущия текст — направете нов анализ и нова корекция.";

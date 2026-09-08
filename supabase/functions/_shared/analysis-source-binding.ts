// Q2b1 — обвързване на анализа с ТОЧНИЯ източник (чиста логика: без мрежа, без база).
//
// Защо: досегашният кеш-ключ беше `PROMPT_VERSION + normalizeText(text)` — той
// ИЗПУСКАШЕ заглавието (а промптът праща `contract.title`) и заличаваше разлики
// в празно място/регистър. Затова стойността в `risk_analyses.text_hash` е
// ВЕРСИОНИРАН КЕШ-КЛЮЧ, а не отпечатък на суровия източник.
//
// Тук се въвежда отделен, версиониран „отпечатък на снимката" (snapshot binding):
//   - `text_sha256`  — SHA-256 на ТОЧНИЯ ПЪЛЕН текст, използван като източник на
//     анализа (след съществуващия външен trim, ПРЕДИ компактиране и съкращаване);
//   - `title_sha256` — SHA-256 на ТОЧНИЯ низ със заглавен контекст, който наистина
//     е изпратен на модела.
//
// Метаданните съдържат САМО дайджести — никакви идентификатори на документ или
// потребител и никакъв суров текст, в съответствие с коментара за поверителност
// на колоната.
//
// Отпечатъкът НЕ е доказателство за правна правилност. Той доказва единствено
// „анализиран е точно този текст с точно този заглавен контекст" — нищо повече.
//
// Статусите са РАЗДЕЛНИ: доказателственият статус (Q2a) описва покритието на
// находките, обвързването описва идентичността на входа. Едното не отменя другото.

import { sha256Hex } from "./normalize.ts";
import { validateAnalysisVerification } from "./analysis-evidence.ts";

export const ANALYSIS_SOURCE_BINDING_VERSION = 1 as const;

/**
 * Явна версия на политиката за промпт/кеш. Влиза в кеш-ключа, за да може
 * поведението на кеша да се обезсили без промяна на доказателствената схема.
 */
export const ANALYSIS_CACHE_POLICY_VERSION = "q2b1-source-bound-1" as const;

export interface AnalysisSourceBinding {
  version: typeof ANALYSIS_SOURCE_BINDING_VERSION;
  /** SHA-256 (hex, малки букви) на точния пълен източников текст. */
  text_sha256: string;
  /** SHA-256 (hex, малки букви) на точния изпратен заглавен контекст. */
  title_sha256: string;
}

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Точният низ със заглавен контекст, който се изпраща на модела. Изнесен тук, за
 * да е гарантирано, че отпечатъкът покрива същия низ, който влиза в промпта.
 */
export function buildTitleContext(title: unknown): string {
  return `Заглавие на документа: ${typeof title === "string" ? title : ""}`;
}

/** Изчислява обвързването за точно този източник и точно този заглавен контекст. */
export async function buildAnalysisSourceBinding(input: {
  sourceText: string;
  titleContext: string;
}): Promise<AnalysisSourceBinding> {
  return {
    version: ANALYSIS_SOURCE_BINDING_VERSION,
    text_sha256: await sha256Hex(input.sourceText),
    title_sha256: await sha256Hex(input.titleContext),
  };
}

/**
 * Строга валидация — при липсващо/непознато/повредено обвързване връща `null`
 * (fail closed). Никакви подразбирани стойности.
 */
export function validateAnalysisSourceBinding(value: unknown): AnalysisSourceBinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== ANALYSIS_SOURCE_BINDING_VERSION) return null;
  if (typeof v.text_sha256 !== "string" || !HEX64.test(v.text_sha256)) return null;
  if (typeof v.title_sha256 !== "string" || !HEX64.test(v.title_sha256)) return null;
  return {
    version: ANALYSIS_SOURCE_BINDING_VERSION,
    text_sha256: v.text_sha256,
    title_sha256: v.title_sha256,
  };
}

/** Равенство на снимката: и текстът, и заглавният контекст трябва да съвпадат. */
export function isSourceBindingEqual(a: unknown, b: unknown): boolean {
  const left = validateAnalysisSourceBinding(a);
  const right = validateAnalysisSourceBinding(b);
  if (!left || !right) return false;
  return left.text_sha256 === right.text_sha256 && left.title_sha256 === right.title_sha256;
}

/**
 * Кеш-ключ: включва точните дайджести на текста и заглавието + версията на
 * промпта и на кеш-политиката. Всяка промяна в текста (пунктуация, число,
 * отрицание, Unicode) или в заглавието дава различен ключ.
 */
export async function computeAnalysisCacheKey(input: {
  promptVersion: string;
  binding: AnalysisSourceBinding;
}): Promise<string> {
  const b = input.binding;
  return await sha256Hex(
    [
      input.promptVersion,
      ANALYSIS_CACHE_POLICY_VERSION,
      `binding:v${b.version}`,
      `text:${b.text_sha256}`,
      `title:${b.title_sha256}`,
    ].join("|"),
  );
}

/**
 * Добавя обвързването като вложено `source` в метаданните за проверка — адитивно,
 * без да пипа или „бумпва" доказателствената схема (v1 метаданни БЕЗ `source`
 * остават четими от Q2a UI, но не могат да дадат нов кеш-хит).
 */
export function attachSourceBinding<T extends Record<string, unknown>>(
  verification: T,
  binding: AnalysisSourceBinding,
): T & { source: AnalysisSourceBinding } {
  return { ...verification, source: { ...binding } };
}

/** Извлича обвързването от метаданните (или `null`, ако липсва/е невалидно). */
export function readSourceBinding(verification: unknown): AnalysisSourceBinding | null {
  if (!verification || typeof verification !== "object" || Array.isArray(verification)) return null;
  return validateAnalysisSourceBinding((verification as Record<string, unknown>).source);
}

/**
 * Кеш-хит е доверен САМО ако:
 *   1) доказателствените метаданни са СТРИКТНО валидни (Q2a, непроменен валидатор), И
 *   2) обвързването е стриктно валидно И е РАВНО на текущата снимка.
 * Само форматът не е достатъчен. Обхватът по потребител се пази от заявката.
 */
export function isCacheReusable(input: {
  verification: unknown;
  currentBinding: AnalysisSourceBinding;
}): boolean {
  if (validateAnalysisVerification(input.verification) === null) return false;
  const stored = readSourceBinding(input.verification);
  if (!stored) return false;
  return isSourceBindingEqual(stored, input.currentBinding);
}

// ---------------------------------------------------------------------------
// Оркестрация на кеша (инжектируема — тества се със spy-ове, без база)
// ---------------------------------------------------------------------------

export interface CachedAnalysisRow {
  uploaded_contract_id?: unknown;
  verification?: unknown;
  [k: string]: unknown;
}

export type CacheResolution =
  | { kind: "reuse"; row: CachedAnalysisRow }
  | { kind: "cloned"; row: CachedAnalysisRow }
  | { kind: "clone_failed" }
  | { kind: "recompute" };

/** Полето, което клонът трябва да носи дословно (иначе би изглеждал непроверен). */
export const CLONE_COPIED_FIELDS = [
  "model",
  "score",
  "contract_type",
  "summary",
  "issues",
  "missing_clauses",
  "text_hash",
  "verification",
] as const;

export function buildClonePayload(input: {
  cached: CachedAnalysisRow;
  uploadedContractId: string;
  userId: string;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    uploaded_contract_id: input.uploadedContractId,
    user_id: input.userId,
  };
  for (const f of CLONE_COPIED_FIELDS) out[f] = input.cached[f];
  return out;
}

/**
 * Решава какво да стане с намерения кеш-запис.
 * Ако клонирането за друг `uploaded_contract_id` се провали, НИКОГА не връщаме
 * чуждия запис като успех — връща се `clone_failed` (контролирана грешка нагоре,
 * без AI-fallback и без ефекти върху таксуването).
 */
export async function resolveCachedAnalysis(input: {
  cached: CachedAnalysisRow | null | undefined;
  currentBinding: AnalysisSourceBinding;
  uploadedContractId: string;
  userId: string;
  cloneAnalysis: (payload: Record<string, unknown>) => Promise<CachedAnalysisRow | null>;
}): Promise<CacheResolution> {
  const cached = input.cached;
  if (!cached) return { kind: "recompute" };
  if (!isCacheReusable({ verification: cached.verification, currentBinding: input.currentBinding })) {
    return { kind: "recompute" };
  }
  if (cached.uploaded_contract_id === input.uploadedContractId) {
    return { kind: "reuse", row: cached };
  }
  const cloned = await input.cloneAnalysis(
    buildClonePayload({
      cached,
      uploadedContractId: input.uploadedContractId,
      userId: input.userId,
    }),
  );
  return cloned ? { kind: "cloned", row: cloned } : { kind: "clone_failed" };
}

/**
 * Полезен товар за НОВ запис: доказателствените метаданни + обвързването,
 * плюс кеш-ключа, който вече е изчислен от същата снимка.
 */
export function buildFreshAnalysisPayload(input: {
  uploadedContractId: string;
  userId: string;
  model: string;
  score: number;
  contractType: string;
  summary: string;
  issues: unknown;
  missingClauses: unknown;
  cacheKey: string;
  verification: Record<string, unknown>;
  binding: AnalysisSourceBinding;
}): Record<string, unknown> {
  return {
    uploaded_contract_id: input.uploadedContractId,
    user_id: input.userId,
    model: input.model,
    score: input.score,
    contract_type: input.contractType,
    summary: input.summary,
    issues: input.issues,
    missing_clauses: input.missingClauses,
    text_hash: input.cacheKey,
    verification: attachSourceBinding(input.verification, input.binding),
  };
}

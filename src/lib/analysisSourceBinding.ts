/**
 * Q2b2 — обвързване на анализа с ТОЧНИЯ запазен източник, от страната на браузъра.
 *
 * Огледално на `supabase/functions/_shared/analysis-source-binding.ts`, но БЕЗ
 * никакъв импорт от edge-функциите (те не влизат в браузърния бъндъл).
 *
 * Двата отпечатъка се смятат върху:
 *   - `extracted_text.trim()` — точният ПЪЛЕН запазен текст;
 *   - `buildTitleContext(title)` — точният заглавен контекст, който сървърът праща.
 *
 * Отпечатъкът НЕ е доказателство за правна правилност. Той отговаря само на
 * въпроса „този анализ ли е правен върху точно този текст и заглавие".
 *
 * Никакви сурови текстове и никакви дайджести не се пращат към аналитика/логове.
 */

export const ANALYSIS_SOURCE_BINDING_VERSION = 1 as const;

export interface AnalysisSourceBinding {
  version: typeof ANALYSIS_SOURCE_BINDING_VERSION;
  text_sha256: string;
  title_sha256: string;
}

const HEX64 = /^[0-9a-f]{64}$/;

/** Точният низ със заглавен контекст — идентичен с този на сървъра. */
export function buildTitleContext(title: unknown): string {
  return `Заглавие на документа: ${typeof title === "string" ? title : ""}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeSourceBinding(input: {
  sourceText: string;
  titleContext: string;
}): Promise<AnalysisSourceBinding> {
  return {
    version: ANALYSIS_SOURCE_BINDING_VERSION,
    text_sha256: await sha256Hex(input.sourceText),
    title_sha256: await sha256Hex(input.titleContext),
  };
}

/** Отпечатък за запазен документ: пълен `trim()`-нат текст + заглавен контекст. */
export async function computeSavedSnapshotBinding(input: {
  savedText: string;
  savedTitle: string;
}): Promise<AnalysisSourceBinding> {
  return await computeSourceBinding({
    sourceText: input.savedText.trim(),
    titleContext: buildTitleContext(input.savedTitle),
  });
}

/** Строга валидация — fail closed при липса/непозната версия/повреда. */
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

/** Изважда обвързването от `risk_analyses.verification` (или `null`). */
export function readSourceBinding(verification: unknown): AnalysisSourceBinding | null {
  if (!verification || typeof verification !== "object" || Array.isArray(verification)) return null;
  return validateAnalysisSourceBinding((verification as Record<string, unknown>).source);
}

export function isSourceBindingEqual(a: unknown, b: unknown): boolean {
  const left = validateAnalysisSourceBinding(a);
  const right = validateAnalysisSourceBinding(b);
  if (!left || !right) return false;
  return left.text_sha256 === right.text_sha256 && left.title_sha256 === right.title_sha256;
}

// ---------------------------------------------------------------------------
// Актуалност на снимката (отделно от доказателствения статус)
// ---------------------------------------------------------------------------

/**
 * `checking`  — отпечатъкът за текущия вход още не е готов (нищо не се твърди);
 * `unsaved`   — има незапазени промени в текста или заглавието;
 * `current`   — анализът е правен точно върху текущия запазен текст и заглавие;
 * `stale`     — обвързването е валидно, но сочи друга версия;
 * `unknown`   — липсващо/повредено обвързване — НИКОГА не е актуално.
 */
export type SnapshotFreshness = "checking" | "unsaved" | "current" | "stale" | "unknown";

/**
 * Идентичността на изчислението: потребител + документ + точният вход. Само
 * дайджест, изчислен за същия ключ, може да каже нещо за текущия текст —
 * закъснял отговор не удостоверява нов текст дори за един рендер.
 */
export function buildSnapshotIdentityKey(input: {
  userId: string | null | undefined;
  docId: string | null | undefined;
  savedText: string | null | undefined;
  savedTitle: string | null | undefined;
}): string {
  return [
    input.userId ?? "",
    input.docId ?? "",
    input.savedText ?? "",
    input.savedTitle ?? "",
  ].join("\u0000");
}

export interface ResolvedSnapshotDigest {
  identityKey: string;
  binding: AnalysisSourceBinding;
}

export function resolveSnapshotFreshness(input: {
  hasUnsavedChanges: boolean;
  identityKey: string;
  digest: ResolvedSnapshotDigest | null;
  storedVerification: unknown;
}): SnapshotFreshness {
  if (input.hasUnsavedChanges) return "unsaved";
  if (!input.digest || input.digest.identityKey !== input.identityKey) return "checking";
  const stored = readSourceBinding(input.storedVerification);
  if (!stored) return "unknown";
  return isSourceBindingEqual(stored, input.digest.binding) ? "current" : "stale";
}

/** Действия върху AI (анализ/корекция/преговорна стратегия) — само при `current`. */
export function isSnapshotActionable(freshness: SnapshotFreshness): boolean {
  return freshness === "current";
}

/** Кратко обяснение на български; `null` само когато няма какво да се каже. */
export function snapshotFreshnessNotice(freshness: SnapshotFreshness): string | null {
  switch (freshness) {
    case "current":
      return null;
    case "checking":
      return "Проверяваме дали този анализ се отнася за текущия текст.";
    case "unsaved":
      return "Има незапазени промени в документа. Оценката е скрита, докато не запазите текста и името.";
    case "stale":
      return "Този анализ е направен върху по-ранна версия на документа. Находките остават като история — направете нов анализ за актуална оценка.";
    case "unknown":
      return "Не можем да свържем този анализ с текущия текст на документа. Находките остават като история.";
  }
}

/** Пояснение над списъците с находки, когато не са актуални. */
export function historicalFindingsNotice(freshness: SnapshotFreshness): string | null {
  if (freshness === "current") return null;
  if (freshness === "checking") return "Актуалността още се проверява.";
  return "Показаните находки са от предишна проверка и не описват задължително текущия текст.";
}

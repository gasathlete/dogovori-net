/**
 * ДОКАЗАТЕЛСТВЕН ПЛИК НА ПРЕГОВОРНАТА СТРАТЕГИЯ.
 *
 * Стар запис (без плик) НЕ се показва като текущ резултат: създаден е без
 * проверима правна основа и не може да бъде удостоверен наново. Показва се само
 * стратегия, чийто плик е обвързан с точно този анализ и съдържа извлечените
 * източници с тяхната версия.
 */

export const STRATEGY_EVIDENCE_VERSION = "v1";

export interface StrategyEvidence {
  version: string;
  analysis_id: string;
  source_digest: string;
  generated_at: string;
  citations: Array<{ short_code?: string | null; version?: string | null }>;
}

export interface StrategyEnvelope {
  __evidence?: unknown;
  [key: string]: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Валиден ли е пликът за точно този анализ. */
export function hasValidStrategyEvidence(value: unknown, analysisId: string): boolean {
  if (!value || typeof value !== "object") return false;
  const evidence = (value as StrategyEnvelope).__evidence;
  if (!evidence || typeof evidence !== "object") return false;
  const e = evidence as Partial<StrategyEvidence>;
  if (e.version !== STRATEGY_EVIDENCE_VERSION) return false;
  if (!isNonEmptyString(e.analysis_id) || e.analysis_id !== analysisId) return false;
  if (!isNonEmptyString(e.source_digest)) return false;
  if (!isNonEmptyString(e.generated_at) || Number.isNaN(Date.parse(e.generated_at))) return false;
  if (!Array.isArray(e.citations) || e.citations.length === 0) return false;
  return e.citations.every((c) => c && typeof c === "object" && isNonEmptyString((c as { version?: unknown }).version as string));
}

/**
 * Връща стратегията само когато пликът е валиден; иначе null, за да се изготви
 * наново през строгата правна преграда.
 */
export function readVerifiedStrategy<T extends object>(value: unknown, analysisId: string): T | null {
  return hasValidStrategyEvidence(value, analysisId) ? (value as T) : null;
}

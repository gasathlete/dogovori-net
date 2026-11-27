/**
 * ПРЕГОВОРНА СТРАТЕГИЯ — ДОВЕРИЕТО Е САМО СЪРВЪРНО.
 *
 * Пликът е подписан със сървърен ключ (HMAC). Браузърът НЕ може да провери
 * подписа, затова тук няма проверка, която да „разрешава“ показване. Запазен
 * резултат се показва само след като сървърът го е удостоверил (режим
 * `cached_only`): собственост, обвързване със съдържанието и текущи версии на
 * цитираните източници. Всичко останало остава скрито с ръчно повторно
 * изготвяне.
 */

export const STRATEGY_EVIDENCE_VERSION = "v2";

export interface StrategyEnvelope {
  __evidence?: unknown;
  [key: string]: unknown;
}

/**
 * Клиентът никога не удостоверява плик. Функцията се запазва, за да няма път,
 * по който компонент да покаже непроверен запис.
 */
export function hasValidStrategyEvidence(): false {
  return false;
}

/** Локално прочетен запис не се показва. Резултат идва само от сървъра. */
export function readVerifiedStrategy(): null {
  return null;
}

/** Има ли изобщо какво да се провери на сървъра (за да няма излишна заявка). */
export function looksLikeStrategyEnvelope(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const ev = (value as StrategyEnvelope).__evidence;
  return !!ev && typeof ev === "object";
}

/** Проверява запазената стратегия през сървъра; null, ако не е удостоверена. */
export async function fetchVerifiedStrategy<T extends object>(
  analysisId: string,
): Promise<T | null> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.functions.invoke("negotiation-strategy", {
    body: { analysis_id: analysisId, cached_only: true },
  });
  if (error) return null;
  const strategy = (data as { strategy?: unknown } | null)?.strategy;
  return strategy && typeof strategy === "object" ? (strategy as T) : null;
}

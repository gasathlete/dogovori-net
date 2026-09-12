/**
 * Контракт на посветения вътрешен операционен cron ключ.
 *
 * Стойността живее САМО в PostgreSQL Vault под фиксиран идентификатор и се
 * проверява през public.verify_internal_cron_secret. Тук няма стойности, няма
 * достъп до средата и няма зависимости.
 */

/** Точен формат: 64 малки шестнайсетични символа (256 бита). */
export const DEDICATED_CRON_SECRET_PATTERN = /^[0-9a-f]{64}$/;

/** Единственото позволено DB извикване по време на авторизация. */
export const INTERNAL_CRON_VERIFIER_RPC = "verify_internal_cron_secret";

/** Фиксираният Vault идентификатор (само име, не стойност). */
export const INTERNAL_CRON_VAULT_IDENTIFIER = "internal_operational_cron_secret_v1";

export function isDedicatedCronCandidate(token: string): boolean {
  return DEDICATED_CRON_SECRET_PATTERN.test(token);
}

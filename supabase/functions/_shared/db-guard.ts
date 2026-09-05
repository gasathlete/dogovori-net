/**
 * Fail-closed helpers за критични (платени) DB writes.
 *
 * Правилото: entitlement / billing state НЕ бива да се "успява" тихо. Всяка
 * Supabase грешка се превръща в изключение, което достига HTTP слоя (за
 * webhook → non-2xx, за да повтори Stripe).
 */

export type DbResult<T> = { data: T; error: { message?: string } | null };

/** Хвърля при Supabase error; иначе връща data. */
export function mustSucceed<T>(result: DbResult<T>, label: string): T {
  if (result?.error) {
    const msg = result.error.message ?? String(result.error);
    throw new Error(`${label} failed: ${msg}`);
  }
  return result?.data as T;
}

/**
 * Хвърля при грешка ИЛИ когато нито един ред не е засегнат.
 * Изисква заявката да е с `.select(...)`, за да върне засегнатите редове.
 */
export function mustAffectRows<T>(result: DbResult<T[] | T | null>, label: string): void {
  const data = mustSucceed(result, label);
  const count = Array.isArray(data) ? data.length : data ? 1 : 0;
  if (count === 0) throw new Error(`${label} matched no rows`);
}

/**
 * ПРАВО НА БЕЗПЛАТНИ СЪОБЩЕНИЯ (анонимен асистент) — СЪРВЪРНО.
 *
 * Досега броят се четеше от историята, изпратена от браузъра: изчистването ѝ
 * даваше неограничен безплатен достъп. Тук правото се брои на сървъра.
 *
 * Принципи:
 * - Брои се САМО ДОСТАВЕН отговор. Неуспешен или незаземен опит не изразходва
 *   съобщение (потреблението се записва СЛЕД успешния отговор).
 * - Съхранява се само необратим хеш на IP и число — без съдържание и без PII.
 * - Ограниченията срещу злоупотреба остават отделни (те са защита от
 *   натоварване, а не изразходвано право).
 */

export const ANON_FREE_MESSAGES = 5;
/** Прозорец на правото: 30 дни. */
export const ANON_ENTITLEMENT_WINDOW_S = 30 * 24 * 3600;

interface BucketDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{
          data: { count: number; window_start: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
    delete?(): {
      eq(col: string, val: string): Promise<{ error: { message: string } | null }>;
    };
  };
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export function anonEntitlementKey(ipHash: string): string {
  return `anon-chat-delivered:${ipHash}`;
}

export interface EntitlementState {
  readonly used: number;
  readonly remaining: number;
  readonly exhausted: boolean;
  /**
   * Инфраструктурен отказ. НЕ е ново право и НЕ е изчерпан лимит — извикващият
   * ТРЯБВА да върне повторяем 503.
   */
  readonly unavailable?: boolean;
}

/** Само ЧЕТЕ състоянието — не изразходва право. FAIL-CLOSED при грешка. */
export async function readAnonEntitlement(
  db: BucketDb,
  ipHash: string,
  now: Date = new Date(),
): Promise<EntitlementState> {
  const { data, error } = await db
    .from("rate_limit_buckets")
    .select("count, window_start")
    .eq("key", anonEntitlementKey(ipHash))
    .maybeSingle();

  // Грешка при четене НЕ дава свежо право (иначе всеки срив = безкраен достъп).
  if (error) {
    return { used: 0, remaining: 0, exhausted: false, unavailable: true };
  }
  // Липсващ запис = наистина нов посетител.
  if (!data) {
    return { used: 0, remaining: ANON_FREE_MESSAGES, exhausted: false };
  }
  const started = new Date(data.window_start).getTime();
  const elapsed = (now.getTime() - started) / 1000;
  // Изтекъл прозорец = ново право.
  const used = elapsed >= ANON_ENTITLEMENT_WINDOW_S ? 0 : Math.max(0, Number(data.count ?? 0));
  const remaining = Math.max(0, ANON_FREE_MESSAGES - used);
  return { used, remaining, exhausted: remaining <= 0 };
}


/**
 * Изразходва ЕДНО съобщение — извиква се СЛЕД доказано доставен отговор.
 * Броенето е атомарно в SQL, затова паралелни заявки не могат да надхвърлят
 * лимита.
 */
export async function consumeAnonDelivered(
  db: BucketDb,
  ipHash: string,
): Promise<EntitlementState & { ok: boolean }> {
  const { data, error } = await db.rpc("rate_limit_check", {
    _key: anonEntitlementKey(ipHash),
    _max: ANON_FREE_MESSAGES,
    _window_s: ANON_ENTITLEMENT_WINDOW_S,
  });
  if (error) {
    // Записът не успя: правото не се твърди за изразходвано И това НЕ е
    // изчерпан лимит — извикващият връща повторяем 503.
    return { ok: false, used: 0, remaining: 0, exhausted: false, unavailable: true };
  }

  const row = (data ?? {}) as { ok?: boolean; remaining?: number };
  const remaining = Math.max(0, Number(row.remaining ?? 0));
  return {
    ok: row.ok === true,
    used: ANON_FREE_MESSAGES - remaining,
    remaining,
    exhausted: remaining <= 0,
  };
}

/**
 * ЕДНОКРАТНОСТ НА ОПИТА (повторение при загубен отговор).
 * Ключът е обвързан с идентичността и клиентския UUID на заявката. Резервира се
 * ПРЕДИ модела: повторен опит със същия ключ не генерира и не таксува отново.
 */
export function anonOperationKey(ipHash: string, requestId: string): string {
  return `anon-chat-op:${ipHash}:${requestId}`;
}

export async function reserveAnonOperation(
  db: BucketDb,
  ipHash: string,
  requestId: string,
): Promise<{ ok: boolean; replay: boolean; infraFailed: boolean }> {
  const { data, error } = await db.rpc("rate_limit_check", {
    _key: anonOperationKey(ipHash, requestId),
    _max: 1,
    _window_s: 3600,
  });
  if (error) return { ok: false, replay: false, infraFailed: true };
  const row = (data ?? {}) as { ok?: boolean };
  return { ok: row.ok === true, replay: row.ok !== true, infraFailed: false };
}

/**
 * ОСВОБОЖДАВА резервацията на опит, когато отговорът НЕ е доставен (правна
 * преграда, грешка в модела, липсващо заземяване). Така повторният опит със
 * същия UUID не се отказва като „вече обработен" — неуспехът не изгаря опит.
 *
 * ВАЖНО (остатъчно ограничение): това НЕ е трайно повторение на точния отговор.
 * Пълната таблица с анонимни доставки изисква нова миграция, която в този
 * обхват не е прилагана.
 */
export async function releaseAnonOperation(
  db: BucketDb,
  ipHash: string,
  requestId: string,
): Promise<{ released: boolean }> {
  try {
    const table = db.from("rate_limit_buckets");
    if (!table.delete) return { released: false };
    const { error } = await table.delete().eq("key", anonOperationKey(ipHash, requestId));
    return { released: !error };
  } catch {
    return { released: false };
  }
}


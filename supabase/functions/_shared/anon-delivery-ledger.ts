/**
 * ТРАЕН ЛЕДЖЪР НА АНОНИМНИТЕ ДОСТАВКИ.
 *
 * Заменя стария псевдо-резерв през брояча за натоварване
 * (`rate_limit_buckets` / `rate_limit_check`). Сега всяка анонимна доставка е
 * ТРАЙНА операция, обвързана с:
 *  - хеш на идентичността (без IP),
 *  - ЗАДЪЛЖИТЕЛЕН UUID на заявката,
 *  - каноничен малки букви SHA-256 отпечатък на заявката (без текст на въпроса).
 *
 * Правила:
 *  - Резервацията НЕ изразходва право, но атомарно заема едно от местата.
 *  - Само ПОТВЪРДЕНА доставка става изразходвано право.
 *  - Отмяната освобождава мястото и позволява повторен опит със същия ключ.
 *  - Инфраструктурна грешка е НЕДОСТЪПНОСТ — никога „свежо право" и никога
 *    „достигнат лимит".
 */

export const ANON_DELIVERY_CAP = 5;
export const ANON_DELIVERY_WINDOW_S = 30 * 24 * 3600;
export const ANON_DELIVERY_PURPOSE = "anon-assistant";

export interface LedgerDb {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Каноничен отпечатък на заявката — без суров текст навън. */
export async function anonRequestDigest(
  parts: readonly string[],
): Promise<string> {
  const canon = JSON.stringify(["anon-delivery-1", ...parts]);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canon));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type ReserveOutcome =
  | {
    readonly kind: "reserved";
    readonly remaining: number;
    readonly delivered: number;
    /** Повторно резервиране на доказано отменена операция. */
    readonly retry: boolean;
  }
  | { readonly kind: "replay"; readonly response: Record<string, unknown> }
  | { readonly kind: "in_progress"; readonly retryAfterSeconds: number }
  | { readonly kind: "limit_reached"; readonly delivered: number }
  | { readonly kind: "conflict"; readonly reason: string }
  /** Запазеният точен отговор е изтекъл: нужна е НОВА заявка с нов ключ. */
  | { readonly kind: "expired"; readonly reason: string }
  | { readonly kind: "unavailable"; readonly reason: string };


function row(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
}

export async function reserveAnonDelivery(
  db: LedgerDb,
  input: {
    operationId: string;
    identityHash: string;
    requestDigest: string;
    purpose?: string;
    cap?: number;
    windowSeconds?: number;
    leaseSeconds?: number;
  },
): Promise<ReserveOutcome> {
  if (!UUID_RE.test(input.operationId)) {
    return { kind: "conflict", reason: "operation_id_invalid" };
  }
  if (!/^[0-9a-f]{64}$/.test(input.requestDigest)) {
    return { kind: "conflict", reason: "request_digest_invalid" };
  }
  const { data, error } = await db.rpc("anon_delivery_reserve", {
    p_operation_id: input.operationId,
    p_identity_hash: input.identityHash,
    p_request_digest: input.requestDigest,
    p_purpose: input.purpose ?? ANON_DELIVERY_PURPOSE,
    p_cap: input.cap ?? ANON_DELIVERY_CAP,
    p_window_seconds: input.windowSeconds ?? ANON_DELIVERY_WINDOW_S,
    p_lease_seconds: input.leaseSeconds ?? 300,
  });
  // Инфраструктурен отказ НИКОГА не е ново право и НИКОГА не е лимит.
  if (error) return { kind: "unavailable", reason: "ledger_error" };
  const r = row(data);
  if (r.ok === true && r.replay === true && r.state === "committed") {
    const response = row(r.response);
    // Потвърдена операция без запазен отговор не може да се повтори честно.
    if (Object.keys(response).length === 0) {
      return { kind: "unavailable", reason: "response_missing" };
    }
    return { kind: "replay", response };
  }
  if (r.ok === true && r.state === "reserved") {
    return {
      kind: "reserved",
      remaining: Math.max(0, Number(r.remaining ?? 0)),
      delivered: Math.max(0, Number(r.delivered ?? 0)),
      retry: r.retry === true,
    };
  }
  const reason = typeof r.reason === "string" ? r.reason : "unknown";
  if (reason === "in_progress") {
    return {
      kind: "in_progress",
      retryAfterSeconds: Math.max(1, Number(r.retry_after_seconds ?? 5)),
    };
  }
  if (reason === "limit_reached") {
    return { kind: "limit_reached", delivered: Math.max(0, Number(r.delivered ?? 0)) };
  }
  if (reason === "binding_conflict") return { kind: "conflict", reason };
  // Изтекъл запазен отговор: същият ключ НИКОГА няма да върне резултат.
  if (reason === "response_expired") return { kind: "expired", reason };

  if (reason === "reconciliation_required" || reason === "cancellation_unproven") {
    return { kind: "unavailable", reason };
  }
  return { kind: "unavailable", reason };
}

export type CommitOutcome =
  | {
    readonly kind: "committed";
    readonly remaining: number;
    readonly replay: boolean;
    /**
     * ТОЧНИЯТ траен отговор, както е записан в базата (включително
     * авторитетното `remaining`). Крайната точка връща ИМЕННО него — никога
     * локално доизменен товар.
     */
    readonly response: Record<string, unknown>;
  }
  | { readonly kind: "limit_reached" }
  | { readonly kind: "unavailable"; readonly reason: string };

export async function commitAnonDelivery(
  db: LedgerDb,
  input: {
    operationId: string;
    identityHash: string;
    requestDigest: string;
    response: Record<string, unknown>;
    purpose?: string;
  },
): Promise<CommitOutcome> {
  const { data, error } = await db.rpc("anon_delivery_commit", {
    p_operation_id: input.operationId,
    p_identity_hash: input.identityHash,
    p_request_digest: input.requestDigest,
    p_response: input.response,
    p_purpose: input.purpose ?? ANON_DELIVERY_PURPOSE,
  });
  // Неизвестен изход НЕ е успех: отговорът не се доставя като безплатно право.
  // ВАЖНО: тук НИКОГА не се прави отмяна — записът може да е успял.
  if (error) return { kind: "unavailable", reason: "commit_uncertain" };
  const r = row(data);
  if (r.ok === true) {
    const stored = row(r.response);
    // Без траен отговор не можем да върнем точния резултат — това е
    // изравняване, не успех.
    if (Object.keys(stored).length === 0) {
      return { kind: "unavailable", reason: "response_missing" };
    }
    return {
      kind: "committed",
      remaining: Math.max(0, Number(r.remaining ?? stored.remaining ?? 0)),
      replay: r.replay === true,
      response: stored,
    };
  }
  if (r.reason === "limit_reached") return { kind: "limit_reached" };
  return {
    kind: "unavailable",
    reason: typeof r.reason === "string" ? r.reason : "commit_failed",
  };
}

export type CancelOutcome =
  /** Доказана отмяна: мястото е свободно, същият ключ може да опита пак. */
  | { readonly kind: "cancelled" }
  /** Операцията вече е потвърдена — отмяна НЕ се прави и не се твърди. */
  | { readonly kind: "already_committed" }
  /** Недоказана отмяна: изисква изравняване, ключът се ЗАПАЗВА. */
  | { readonly kind: "uncertain"; readonly reason: string };

/** Отмяна при НЕдоставен отговор — освобождава мястото, не изразходва право. */
export async function cancelAnonDelivery(
  db: LedgerDb,
  input: {
    operationId: string;
    identityHash: string;
    requestDigest: string;
    reason: string;
    purpose?: string;
  },
): Promise<CancelOutcome> {
  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    const out = await db.rpc("anon_delivery_cancel", {
      p_operation_id: input.operationId,
      p_identity_hash: input.identityHash,
      p_request_digest: input.requestDigest,
      p_reason: input.reason,
      p_purpose: input.purpose ?? ANON_DELIVERY_PURPOSE,
    });
    data = out.data;
    error = out.error;
  } catch {
    return { kind: "uncertain", reason: "cancel_threw" };
  }
  if (error) return { kind: "uncertain", reason: "cancel_uncertain" };
  const r = row(data);
  if (r.ok === true) return { kind: "cancelled" };
  if (r.reason === "already_committed") return { kind: "already_committed" };
  return {
    kind: "uncertain",
    reason: typeof r.reason === "string" ? r.reason : "cancel_failed",
  };
}

export interface DeliveryState {
  readonly remaining: number;
  readonly delivered: number;
  readonly unavailable?: boolean;
}

/** Само ЧЕТЕ трайното състояние. FAIL-CLOSED при грешка. */
export async function readAnonDeliveryState(
  db: LedgerDb,
  identityHash: string,
  purpose: string = ANON_DELIVERY_PURPOSE,
): Promise<DeliveryState> {
  const { data, error } = await db.rpc("anon_delivery_state", {
    p_identity_hash: identityHash,
    p_purpose: purpose,
    p_cap: ANON_DELIVERY_CAP,
    p_window_seconds: ANON_DELIVERY_WINDOW_S,
  });
  if (error) return { remaining: 0, delivered: 0, unavailable: true };
  const r = row(data);
  if (r.ok !== true) return { remaining: 0, delivered: 0, unavailable: true };
  return {
    remaining: Math.max(0, Number(r.remaining ?? 0)),
    delivered: Math.max(0, Number(r.delivered ?? 0)),
  };
}

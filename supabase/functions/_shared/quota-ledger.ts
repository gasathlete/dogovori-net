/**
 * КЛИЕНТ КЪМ ЛЕДЖЪРА НА ОПЕРАЦИИТЕ (миграция 0029, НЕприложена).
 *
 * Инварианти, които този модул налага в код:
 * 1. Резервация се прави само след всички безплатни проверки (валидация,
 *    класификация, редакция, правно заземяване).
 * 2. Всеки неуспешен край отменя резервацията точно веднъж.
 * 3. „charged: false" се твърди САМО при потвърдена отмяна. При неясен изход
 *    връщаме типизирана грешка billing_reconciliation_required и записваме
 *    траен запис за изравняване — не лъжем клиента.
 */

export type LedgerState = "reserved" | "committed" | "cancelled";
export type LedgerAction = "reserve" | "commit" | "cancel";

export interface LedgerTransition {
  readonly state: LedgerState;
  readonly ok: boolean;
  /** Повторение по същия ключ — без второ таксуване/възстановяване. */
  readonly replay: boolean;
  readonly reason?:
    | "commit_after_cancel"
    | "cancel_after_commit"
    | "reconciliation_required"
    | "cancellation_unproven";
  /** Ново таксуване по СЪЩИЯ ключ след доказана отмяна (нормален нов опит). */
  readonly retry?: boolean;
}

/**
 * Състоянието на отменена операция: ново таксуване по същия ключ е допустимо
 * САМО когато отмяната е доказана и не чака изравняване.
 */
export interface CancelledBinding {
  /** cancelled_at е записано (базата е потвърдила отмяната). */
  readonly cancellationProven: boolean;
  /** detail.reconciliation_required = true. */
  readonly reconciliationRequired?: boolean;
}

/**
 * Чист контракт на състоянията. Същата семантика е реализирана в SQL
 * (quota_reserve / quota_commit / quota_cancel) и се тества и тук.
 */
export function nextLedgerState(
  current: LedgerState | null,
  action: LedgerAction,
  cancelled?: CancelledBinding,
): LedgerTransition {
  if (action === "reserve") {
    if (current === null) return { state: "reserved", ok: true, replay: false };
    if (current === "cancelled") {
      // Неизравнена отмяна НИКОГА не се таксува повторно.
      if (cancelled?.reconciliationRequired) {
        return {
          state: "cancelled",
          ok: false,
          replay: true,
          reason: "reconciliation_required",
        };
      }
      if (cancelled?.cancellationProven !== true) {
        return {
          state: "cancelled",
          ok: false,
          replay: true,
          reason: "cancellation_unproven",
        };
      }
      // Доказана отмяна със същото обвързване: нормалният „Опитайте отново"
      // резервира наново точно веднъж.
      return { state: "reserved", ok: true, replay: false, retry: true };
    }
    // Повторна резервация по същия ключ не таксува втори път.
    return { state: current, ok: true, replay: true };
  }
  if (action === "commit") {
    if (current === "reserved") return { state: "committed", ok: true, replay: false };
    if (current === "committed") return { state: "committed", ok: true, replay: true };
    return { state: "cancelled", ok: false, replay: false, reason: "commit_after_cancel" };
  }
  if (current === "reserved") return { state: "cancelled", ok: true, replay: false };
  if (current === "cancelled") return { state: "cancelled", ok: true, replay: true };
  return { state: "committed", ok: false, replay: false, reason: "cancel_after_commit" };
}

export const BILLING_RECONCILIATION_REQUIRED = "billing_reconciliation_required";

export const BILLING_RECONCILIATION_MESSAGE_BG =
  "Операцията не завърши и състоянието на квотата ви се изравнява. " +
  "Не предприемайте повторно плащане — ще проверим и коригираме записа.";

export type QuotaKind = "contract" | "template" | "analysis";

interface Rpc {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    insert(rows: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  };
}

export interface ReserveInput {
  readonly operationId: string;
  readonly userId: string;
  readonly kind: QuotaKind;
  readonly purpose: string;
  /** Нормализиран UUID на таба или null — НИКОГА празен текст. */
  readonly sessionId?: string | null;
  readonly docKey?: string | null;
  /** UUID на партидата (вълна поправки) или null. Част от обвързването. */
  readonly batchId?: string | null;
  /** ЗАДЪЛЖИТЕЛЕН каноничен SHA-256 отпечатък (64 hex) на заявката. */
  readonly requestDigest: string;
  /** Наем на резервацията в секунди (изтеклите се изравняват от метача). */
  readonly leaseSeconds?: number;
}

export const IDEMPOTENCY_KEY_CONFLICT = "idempotency_key_conflict";

/**
 * САМО-ЧЕТЯЩО състояние на операция по ЦЯЛОТО обвързване. Не резервира, не
 * освобождава и не таксува. Използва се ПРЕДИ скъпите/чупливи стъпки (правно
 * заземяване, модел), за да не бъде блокиран нормален повторен опит по вече
 * завършена и вече таксувана операция.
 */
export type LookupOutcome =
  /** Няма такава операция или е ДОКАЗАНО отменена — нормален нов опит. */
  | { readonly status: "absent"; readonly reason?: string }
  /** Ключът е ползван с ДРУГ товар. */
  | { readonly status: "conflict"; readonly reason: string }
  /** Завършена операция: връща се САМО трайно записаният резултат. */
  | {
      readonly status: "committed";
      readonly resultRef: Record<string, unknown> | null;
      readonly charged: boolean;
      readonly source: string;
    }
  /** Активна резервация по същия ключ — никакво второ изпълнение. */
  | { readonly status: "in_progress"; readonly retryAfterSeconds: number }
  /** Недоказан изход: изравняване, не нов опит. */
  | { readonly status: "reconciliation"; readonly reason: string }
  | { readonly status: "unavailable"; readonly message: string };

export async function lookupCommittedOperation(
  db: Rpc,
  input: ReserveInput,
): Promise<LookupOutcome> {
  if (typeof input.requestDigest !== "string" || !SHA256_HEX.test(input.requestDigest)) {
    return { status: "conflict", reason: "request_digest_required" };
  }
  const { data, error } = await db.rpc("quota_operation_lookup", {
    p_operation_id: input.operationId,
    p_user_id: input.userId,
    p_kind: input.kind,
    p_purpose: input.purpose,
    p_session_id: input.sessionId ?? null,
    p_doc_key: input.docKey ?? null,
    p_batch_id: input.batchId ?? null,
    p_request_digest: input.requestDigest,
  });
  if (error) {
    if (isConflict(error.message)) {
      return { status: "conflict", reason: IDEMPOTENCY_KEY_CONFLICT };
    }
    return { status: "unavailable", message: error.message };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  const status = String(row.status ?? "");
  if (status === "committed") {
    return {
      status: "committed",
      resultRef: row.result_ref && typeof row.result_ref === "object"
        ? (row.result_ref as Record<string, unknown>)
        : null,
      charged: row.charged === true,
      source: String(row.source ?? "unknown"),
    };
  }
  if (status === "conflict") {
    return { status: "conflict", reason: String(row.reason ?? IDEMPOTENCY_KEY_CONFLICT) };
  }
  if (status === "in_progress") {
    return {
      status: "in_progress",
      retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds ?? 4)),
    };
  }
  if (status === "reconciliation") {
    return { status: "reconciliation", reason: String(row.reason ?? "reconciliation_required") };
  }
  if (status === "absent") {
    return { status: "absent", reason: row.reason ? String(row.reason) : undefined };
  }
  // Непознат отговор НЕ се третира като „няма операция".
  return { status: "unavailable", message: `unexpected_lookup_status:${status || "empty"}` };
}



/** Причини, при които НЕ се таксува и се иска изравняване, а не нов опит. */
const RECONCILIATION_REASONS = new Set([
  "reconciliation_required",
  "cancellation_unproven",
]);

export type ReserveOutcome =
  | {
      readonly status: "reserved";
      readonly charged: boolean;
      readonly replay: boolean;
      /** Ново таксуване по същия ключ след ДОКАЗАНА отмяна. */
      readonly retry: boolean;
      /** Реалното състояние в леджъра (committed при вече завършена операция). */
      readonly ledgerState: "reserved" | "committed";
      readonly source: string;
      /** Записан резултат при повторение по същия ключ (иначе null). */
      readonly resultRef: Record<string, unknown> | null;
      readonly raw: Record<string, unknown>;
    }
  | { readonly status: "denied"; readonly reason: string; readonly raw: Record<string, unknown> }
  /** Ключът е ползван с ДРУГ товар — нищо не се таксува и не се подава. */
  | { readonly status: "conflict"; readonly reason: string }
  /** Недоказан изход по този ключ: нито нов опит, нито твърдение за такса. */
  | { readonly status: "reconciliation"; readonly reason: string }
  | { readonly status: "unavailable"; readonly message: string };

function isConflict(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes(IDEMPOTENCY_KEY_CONFLICT) ||
    m.includes("operation key conflict") ||
    m.includes("request_digest_required");
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

export async function reserveQuota(db: Rpc, input: ReserveInput): Promise<ReserveOutcome> {
  // Без валиден отпечатък НЕ се прави повикване към базата и нищо не се таксува.
  if (typeof input.requestDigest !== "string" || !SHA256_HEX.test(input.requestDigest)) {
    return { status: "conflict", reason: "request_digest_required" };
  }
  const { data, error } = await db.rpc("quota_reserve", {
    p_operation_id: input.operationId,
    p_user_id: input.userId,
    p_kind: input.kind,
    p_purpose: input.purpose,
    p_session_id: input.sessionId ?? null,
    p_doc_key: input.docKey ?? null,
    p_batch_id: input.batchId ?? null,
    p_request_digest: input.requestDigest,
    p_lease_seconds: input.leaseSeconds ?? 900,
  });
  if (error) {
    if (isConflict(error.message)) {
      return { status: "conflict", reason: IDEMPOTENCY_KEY_CONFLICT };
    }
    return { status: "unavailable", message: error.message };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) {
    const reason = String(row.reason ?? "quota_denied");
    if (RECONCILIATION_REASONS.has(reason)) {
      return { status: "reconciliation", reason };
    }
    return { status: "denied", reason, raw: row };
  }
  const resultRef = row.result_ref && typeof row.result_ref === "object"
    ? (row.result_ref as Record<string, unknown>)
    : null;
  return {
    status: "reserved",
    charged: row.charged === true,
    replay: row.replay === true,
    retry: row.retry === true,
    ledgerState: row.state === "committed" ? "committed" : "reserved",
    source: String(row.source ?? "unknown"),
    resultRef,
    raw: row,
  };
}

/** Изравняване на изтекли резервации (извиква се от retention-sweeper). */
export async function reconcileStaleOperations(
  db: Rpc,
  limit = 50,
): Promise<{ examined: number; cancelled: number; unresolved: number; error?: string }> {
  const { data, error } = await db.rpc("quota_reconcile_stale", { p_limit: limit });
  if (error) return { examined: 0, cancelled: 0, unresolved: 0, error: error.message };
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    examined: Number(row.examined ?? 0),
    cancelled: Number(row.cancelled ?? 0),
    unresolved: Number(row.unresolved ?? 0),
  };
}

export type SettleOutcome =
  /** Изходът е доказан: committed или cancelled. */
  | {
      readonly status: "settled";
      readonly state: LedgerState;
      readonly replay: boolean;
      readonly resultRef?: Record<string, unknown> | null;
    }
  /** Изходът НЕ е доказан — клиентът не получава „не сте таксувани". */
  | { readonly status: "unresolved"; readonly reason: string };

/**
 * Потвърждение с ОБВЪРЗВАНЕ на готовия резултат към ключа. Така повторение
 * след загубен отговор връща същия резултат, без ново генериране и таксуване.
 */
export async function commitQuota(
  db: Rpc,
  operationId: string,
  resultRef?: Record<string, unknown> | null,
): Promise<SettleOutcome> {
  const { data, error } = await db.rpc("quota_commit", {
    p_operation_id: operationId,
    p_result_ref: resultRef ?? null,
  });
  if (error) return { status: "unresolved", reason: error.message };
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) return { status: "unresolved", reason: String(row.reason ?? "commit_failed") };
  const ref = row.result_ref && typeof row.result_ref === "object"
    ? (row.result_ref as Record<string, unknown>)
    : null;
  return { status: "settled", state: "committed", replay: row.replay === true, resultRef: ref };
}

/**
 * Отмяна точно веднъж. Повторно извикване по същия ключ е безопасно и не
 * връща втори път квота (гарантирано от SQL състоянието).
 */
export async function cancelQuota(
  db: Rpc,
  operationId: string,
  reason: string,
): Promise<SettleOutcome> {
  const { data, error } = await db.rpc("quota_cancel", {
    p_operation_id: operationId,
    p_reason: reason,
  });
  if (error) {
    await recordReconciliation(db, operationId, `cancel_rpc_error:${error.message}`);
    return { status: "unresolved", reason: error.message };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) {
    await recordReconciliation(db, operationId, String(row.reason ?? "cancel_failed"));
    return { status: "unresolved", reason: String(row.reason ?? "cancel_failed") };
  }
  return { status: "settled", state: "cancelled", replay: row.replay === true };
}

export async function recordReconciliation(
  db: Rpc,
  operationId: string | null,
  reason: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.from("billing_reconciliation_items").insert({
      operation_id: operationId,
      reason,
      detail,
    });
  } catch {
    // Записът за изравняване е best-effort; типизираната грешка към клиента
    // остава същата, за да не се твърди нищо невярно.
  }
}

export const OPERATION_IN_PROGRESS = "operation_in_progress";

/**
 * ЕДНОВРЕМЕННО ИЗПЪЛНЕНИЕ ПО СЪЩИЯ КЛЮЧ.
 *
 * Резервация, която е ПОВТОРЕНИЕ на още незавършена операция (state=reserved,
 * без записан резултат и без доказана отмяна), НИКОГА не стартира второ
 * генериране/повикване към модела. Доказано отменената операция има retry=true
 * и е нормален нов опит — тя НЕ е „в ход".
 */
export function isOperationInProgress(
  reservation: {
    status: string;
    replay?: boolean;
    retry?: boolean;
    resultRef?: unknown;
    ledgerState?: string;
  },
): boolean {
  return reservation.status === "reserved" &&
    reservation.replay === true &&
    reservation.retry !== true &&
    reservation.ledgerState !== "committed" &&
    (reservation.resultRef === null || reservation.resultRef === undefined);
}

/** Типизиран отговор „операцията е в ход" — повторяем, без ново таксуване. */
export function operationInProgressResponse(
  headers: Record<string, string>,
  retryAfterSeconds = 4,
): Response {
  const wait = Math.max(1, Math.floor(retryAfterSeconds));
  return new Response(
    JSON.stringify({
      error: "Същата заявка вече се обработва. Изчакайте няколко секунди.",
      code: OPERATION_IN_PROGRESS,
      retryable: true,
      retry_after_seconds: wait,
      // Резервацията вече е направена от първото изпълнение — не се таксува пак.
      charge_state: "reserved",
    }),
    {
      status: 409,
      headers: { ...headers, "Content-Type": "application/json", "Retry-After": String(wait) },
    },
  );
}

/** Типизиран 5xx отговор при недоказана компенсация. */
export function billingReconciliationResponse(headers: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: BILLING_RECONCILIATION_MESSAGE_BG,
      code: BILLING_RECONCILIATION_REQUIRED,
      // Съзнателно НЕ се твърди charged:false — изходът не е доказан.
      charge_state: "unresolved",
    }),
    { status: 503, headers: { ...headers, "Content-Type": "application/json" } },
  );
}

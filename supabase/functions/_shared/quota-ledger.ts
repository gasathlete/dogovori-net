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
  /**
   * Операцията е завършила и е таксувана, но точният товар вече НЕ се пази
   * (граница на задържане). Никога не се връща празен или друг отговор — иска
   * се НОВА заявка с нов ключ.
   */
  | { readonly status: "response_expired"; readonly charged: boolean }
  | { readonly status: "unavailable"; readonly message: string };

export const RESPONSE_EXPIRED = "response_expired";

/**
 * Типизиран отговор при изтекъл точен товар. Клиентът освобождава ключа и
 * следващият ИЗРИЧЕН опит е НОВА операция — без мълчаливо повторение.
 */
export function responseExpiredResponse(
  headers: Record<string, string>,
  charged = true,
): Response {
  return new Response(
    JSON.stringify({
      error: "Този резултат вече не се пази. Изпратете заявката отново.",
      code: RESPONSE_EXPIRED,
      reason: "new_request_required",
      retryable: false,
      charge_state: charged ? "charged" : "not_charged",
    }),
    { status: 409, headers: { ...headers, "Content-Type": "application/json" } },
  );
}

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
  if (status === "response_expired") {
    return { status: "response_expired", charged: row.charged !== false };
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

/**
 * Резервация БЕЗ такса (0035, quota_reserve_no_charge): същият точно-веднъж
 * леджър, но не консумира абонамент/топъп/бонус/сесийно право и не докосва
 * download_quota. Ползва се, когато операцията (напр. build-custom-contract)
 * остава безплатна на този етап — квотата се плаща отделно, по-късно.
 * Връща СЪЩИЯ типизиран съюз като reserveQuota, за да могат извикващите да
 * обработват reserved/replay/committed/in_progress/conflict/unavailable
 * идентично, без разклоняване по вид резервация.
 */
export async function reserveQuotaNoCharge(db: Rpc, input: ReserveInput): Promise<ReserveOutcome> {
  // Без валиден отпечатък НЕ се прави повикване към базата и нищо не се записва.
  if (typeof input.requestDigest !== "string" || !SHA256_HEX.test(input.requestDigest)) {
    return { status: "conflict", reason: "request_digest_required" };
  }
  const { data, error } = await db.rpc("quota_reserve_no_charge", {
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
    source: String(row.source ?? "no_charge"),
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

// =============================================================================
// АТОМАРНА ВЪЛНА ПОПРАВКИ (0036, quota_wave_reserve/commit/cancel, НЕприложена).
//
// За разлика от `reserveQuota`/`commitQuota`/`cancelQuota` (по единица),
// тези помощници обвързват ЦЯЛАТА вълна поправки (N единици) в ЕДНА
// резервация/потвърждение/отмяна — атомарно, всичко-или-нищо, в самата база.
// Няма повече „такса-единица по единица": леджърът пази ЕДИН ред за
// operation_id с точния брой единици (ops_count) и точното разпределение
// (allocation) план/topup, потвърдени или отменени заедно.
// =============================================================================

/** Разширение на {@link Rpc} със самостоятелна САМО-ЧЕТЯЩА заявка. */
interface RpcWithSelect extends Rpc {
  from(table: string): {
    insert(rows: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
    select(columns: string): {
      eq(column: string, value: unknown): {
        maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
  };
}

export interface WaveBinding {
  readonly operationId: string;
  readonly userId: string;
  readonly kind: QuotaKind;
  readonly purpose: string;
  readonly sessionId?: string | null;
  readonly docKey?: string | null;
  readonly batchId?: string | null;
  readonly requestDigest: string;
  /** Точният брой единици за ЦЯЛАТА вълна (ceil(corrections_count/5), мин. 1). */
  readonly opsCount: number;
  readonly leaseSeconds?: number;
}

/**
 * САМО-ЧЕТЯЩО състояние на цялата вълна по operation_id, ПРЕДИ скъпите/
 * чупливи безплатни проверки (правно заземяване и т.н.) и ПРЕДИ резервацията.
 * Проста директна селекция от таблицата — НЯМА отделен SQL RPC за това в
 * 0036, затова логиката огледално повтаря проверките в `quota_wave_reserve`.
 */
export type WaveLookupOutcome =
  | { readonly status: "absent" }
  | { readonly status: "conflict"; readonly reason: string }
  | { readonly status: "committed"; readonly result: Record<string, unknown> | null }
  | { readonly status: "response_expired"; readonly charged: boolean }
  | { readonly status: "in_progress"; readonly retryAfterSeconds: number }
  | { readonly status: "reconciliation"; readonly reason: string }
  | { readonly status: "unavailable"; readonly message: string };

export async function lookupCommittedWave(
  db: Rpc,
  input: WaveBinding,
): Promise<WaveLookupOutcome> {
  if (typeof input.requestDigest !== "string" || !SHA256_HEX.test(input.requestDigest)) {
    return { status: "conflict", reason: "request_digest_required" };
  }
  const { data, error } = await (db as RpcWithSelect)
    .from("quota_wave_operations")
    .select("*")
    .eq("operation_id", input.operationId)
    .maybeSingle();
  if (error) return { status: "unavailable", message: error.message };
  if (!data) return { status: "absent" };
  const row = data;
  const sameBinding =
    row.user_id === input.userId &&
    row.kind === input.kind &&
    row.purpose === input.purpose &&
    (row.session_id ?? null) === (input.sessionId ?? null) &&
    (row.doc_key ?? null) === (input.docKey ?? null) &&
    (row.batch_id ?? null) === (input.batchId ?? null) &&
    row.request_digest === input.requestDigest &&
    Number(row.ops_count) === input.opsCount;
  if (!sameBinding) {
    return { status: "conflict", reason: IDEMPOTENCY_KEY_CONFLICT };
  }
  const state = String(row.state ?? "");
  if (state === "committed") {
    const result = row.result && typeof row.result === "object"
      ? (row.result as Record<string, unknown>)
      : null;
    // Точният отговор се пази ограничено (24 ч). След изтичане НИКОГА не се
    // връща празен или друг резултат — изисква се нова заявка.
    const expiresAtMs = row.result_expires_at
      ? new Date(String(row.result_expires_at)).getTime()
      : 0;
    if (!result || (expiresAtMs > 0 && expiresAtMs <= Date.now())) {
      return { status: "response_expired", charged: true };
    }
    return { status: "committed", result };
  }
  if (state === "reserved") {
    const leaseExpiresAtMs = row.lease_expires_at ? new Date(String(row.lease_expires_at)).getTime() : 0;
    if (leaseExpiresAtMs > Date.now()) {
      return {
        status: "in_progress",
        retryAfterSeconds: Math.max(1, Math.ceil((leaseExpiresAtMs - Date.now()) / 1000)),
      };
    }
    return { status: "reconciliation", reason: "lease_expired" };
  }
  if (state === "cancelled") {
    if (!row.cancelled_at) return { status: "reconciliation", reason: "cancellation_unproven" };
    return { status: "absent" };
  }
  return { status: "unavailable", message: `unexpected_wave_state:${state || "empty"}` };
}

export type ReserveWaveOutcome =
  | {
      readonly status: "reserved";
      readonly allocation: unknown[];
      readonly opsCount: number;
      readonly raw: Record<string, unknown>;
    }
  /** Вълната вече е потвърдена — ТОЧНИЯТ пазен резултат, без ново таксуване. */
  | {
      readonly status: "replay";
      readonly allocation: unknown[];
      readonly result: Record<string, unknown> | null;
    }
  | { readonly status: "in_progress"; readonly retryAfterSeconds: number }
  | { readonly status: "conflict"; readonly reason: string }
  | { readonly status: "denied"; readonly reason: string; readonly raw: Record<string, unknown> }
  | { readonly status: "unavailable"; readonly message: string };

export async function reserveQuotaWave(
  db: Rpc,
  input: WaveBinding,
): Promise<ReserveWaveOutcome> {
  if (typeof input.requestDigest !== "string" || !SHA256_HEX.test(input.requestDigest)) {
    return { status: "conflict", reason: "request_digest_required" };
  }
  const { data, error } = await db.rpc("quota_wave_reserve", {
    p_operation_id: input.operationId,
    p_user_id: input.userId,
    p_kind: input.kind,
    p_purpose: input.purpose,
    p_session_id: input.sessionId ?? null,
    p_doc_key: input.docKey ?? null,
    p_batch_id: input.batchId ?? null,
    p_request_digest: input.requestDigest,
    p_ops_count: input.opsCount,
    p_lease_seconds: input.leaseSeconds ?? 300,
  });
  if (error) {
    if (isConflict(error.message)) {
      return { status: "conflict", reason: IDEMPOTENCY_KEY_CONFLICT };
    }
    return { status: "unavailable", message: error.message };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  const status = String(row.status ?? "");
  if (status === "reserved") {
    return {
      status: "reserved",
      allocation: Array.isArray(row.allocation) ? row.allocation : [],
      opsCount: Number(row.ops_count ?? input.opsCount),
      raw: row,
    };
  }
  if (status === "replay") {
    return {
      status: "replay",
      allocation: Array.isArray(row.allocation) ? row.allocation : [],
      result: row.response && typeof row.response === "object"
        ? (row.response as Record<string, unknown>)
        : null,
    };
  }
  if (status === "in_progress") {
    return {
      status: "in_progress",
      retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds ?? 4)),
    };
  }
  if (status === "conflict") {
    return { status: "conflict", reason: String(row.reason ?? IDEMPOTENCY_KEY_CONFLICT) };
  }
  if (status === "denied") {
    return { status: "denied", reason: String(row.reason ?? "quota_denied"), raw: row };
  }
  if (status === "unavailable") {
    return { status: "unavailable", message: String(row.reason ?? "wave_reserve_unavailable") };
  }
  return { status: "unavailable", message: `unexpected_wave_reserve_status:${status || "empty"}` };
}

export type SettleWaveOutcome =
  | { readonly status: "settled"; readonly replay: boolean; readonly result: Record<string, unknown> | null }
  | { readonly status: "unresolved"; readonly reason: string };

/**
 * Потвърждение на ЦЯЛАТА вълна в ЕДНА транзакция. Без второ повикване към
 * модела при повторение по същия ключ — точният резултат се връща обратно.
 */
export async function commitQuotaWave(
  db: Rpc,
  operationId: string,
  userId: string,
  result: Record<string, unknown>,
): Promise<SettleWaveOutcome> {
  const { data, error } = await db.rpc("quota_wave_commit", {
    p_operation_id: operationId,
    p_user_id: userId,
    p_result: result,
  });
  if (error) return { status: "unresolved", reason: error.message };
  const row = (data ?? {}) as Record<string, unknown>;
  const status = String(row.status ?? "");
  if (status === "committed") {
    return {
      status: "settled",
      replay: row.replay === true,
      result: row.result && typeof row.result === "object" ? (row.result as Record<string, unknown>) : null,
    };
  }
  return { status: "unresolved", reason: String(row.reason ?? (status || "wave_commit_failed")) };
}

export type CancelWaveOutcome =
  | { readonly status: "settled"; readonly replay: boolean; readonly restored: unknown }
  /** Вече потвърдена преди отмяната — нищо за връщане, вълната Е таксувана. */
  | { readonly status: "already_committed" }
  | { readonly status: "unresolved"; readonly reason: string };

/** Отмяна на ЦЯЛАТА вълна точно веднъж (всичко-или-нищо възстановяване). */
export async function cancelQuotaWave(
  db: Rpc,
  operationId: string,
  userId: string,
  reason: string,
): Promise<CancelWaveOutcome> {
  const { data, error } = await db.rpc("quota_wave_cancel", {
    p_operation_id: operationId,
    p_user_id: userId,
    p_reason: reason,
  });
  if (error) {
    await recordReconciliation(db, operationId, `wave_cancel_rpc_error:${error.message}`);
    return { status: "unresolved", reason: error.message };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  const status = String(row.status ?? "");
  if (status === "cancelled") {
    return { status: "settled", replay: row.replay === true, restored: row.restored ?? null };
  }
  if (status === "already_committed") {
    return { status: "already_committed" };
  }
  const failReason = String(row.reason ?? (status || "wave_cancel_failed"));
  await recordReconciliation(db, operationId, `wave_${failReason}`);
  return { status: "unresolved", reason: failReason };
}

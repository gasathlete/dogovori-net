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
  readonly reason?: "commit_after_cancel" | "cancel_after_commit";
}

/**
 * Чист контракт на състоянията. Същата семантика е реализирана в SQL
 * (quota_reserve / quota_commit / quota_cancel) и се тества и тук.
 */
export function nextLedgerState(
  current: LedgerState | null,
  action: LedgerAction,
): LedgerTransition {
  if (action === "reserve") {
    if (current === null) return { state: "reserved", ok: true, replay: false };
    // Повторна резервация по същия ключ не таксува втори път.
    return { state: current, ok: current !== "cancelled", replay: true };
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
  readonly sessionId?: string | null;
  readonly docKey?: string | null;
}

export type ReserveOutcome =
  | {
      readonly status: "reserved";
      readonly charged: boolean;
      readonly replay: boolean;
      readonly source: string;
      readonly raw: Record<string, unknown>;
    }
  | { readonly status: "denied"; readonly reason: string; readonly raw: Record<string, unknown> }
  | { readonly status: "unavailable"; readonly message: string };

export async function reserveQuota(db: Rpc, input: ReserveInput): Promise<ReserveOutcome> {
  const { data, error } = await db.rpc("quota_reserve", {
    p_operation_id: input.operationId,
    p_user_id: input.userId,
    p_kind: input.kind,
    p_purpose: input.purpose,
    p_session_id: input.sessionId ?? null,
    p_doc_key: input.docKey ?? null,
  });
  if (error) return { status: "unavailable", message: error.message };
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) {
    return { status: "denied", reason: String(row.reason ?? "quota_denied"), raw: row };
  }
  return {
    status: "reserved",
    charged: row.charged === true,
    replay: row.replay === true,
    source: String(row.source ?? "unknown"),
    raw: row,
  };
}

export type SettleOutcome =
  /** Изходът е доказан: committed или cancelled. */
  | { readonly status: "settled"; readonly state: LedgerState; readonly replay: boolean }
  /** Изходът НЕ е доказан — клиентът не получава „не сте таксувани". */
  | { readonly status: "unresolved"; readonly reason: string };

export async function commitQuota(db: Rpc, operationId: string): Promise<SettleOutcome> {
  const { data, error } = await db.rpc("quota_commit", { p_operation_id: operationId });
  if (error) return { status: "unresolved", reason: error.message };
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) return { status: "unresolved", reason: String(row.reason ?? "commit_failed") };
  return { status: "settled", state: "committed", replay: row.replay === true };
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

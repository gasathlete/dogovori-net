/**
 * P0-E2 — типизирана обвивка над трайния леджър на ходовете (миграция 0039).
 *
 * Правила:
 *  - Търсенето е САМО четене и се прави ПРЕДИ ограниченията, правната база,
 *    ключа на доставчика и всяка резервация.
 *  - Инфраструктурна грешка НИКОГА не се представя като изчерпан лимит и
 *    НИКОГА не води до втори модел: неясното е изравняване.
 */

export type LedgerClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type TurnLookup =
  | { kind: "absent" }
  | { kind: "committed"; result: Record<string, unknown>; threadId: string | null }
  | { kind: "response_expired" }
  | { kind: "in_progress"; modelStarted: boolean }
  | { kind: "reconciliation"; reason: string }
  | { kind: "conflict" }
  | { kind: "unavailable" };

function asObject(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

export async function lookupTurn(
  client: LedgerClient,
  operationId: string,
  userId: string,
  binding: string,
): Promise<TurnLookup> {
  const { data, error } = await client.rpc("assistant_turn_lookup", {
    p_operation_id: operationId,
    p_user_id: userId,
    p_binding: binding,
  });
  if (error) return { kind: "unavailable" };
  const row = asObject(data);
  const status = row ? String(row.status ?? "") : "";
  switch (status) {
    case "absent":
      return { kind: "absent" };
    case "committed": {
      const result = asObject(row?.result);
      if (!result) return { kind: "response_expired" };
      return {
        kind: "committed",
        result,
        threadId: typeof row?.thread_id === "string" ? row.thread_id : null,
      };
    }
    case "response_expired":
      return { kind: "response_expired" };
    case "in_progress":
      return { kind: "in_progress", modelStarted: row?.model_started === true };
    case "reconciliation":
      return { kind: "reconciliation", reason: String(row?.reason ?? "unknown") };
    case "conflict":
      return { kind: "conflict" };
    default:
      return { kind: "unavailable" };
  }
}

export type AllocationSource = "team" | "pro" | "free";

export type TurnReserve =
  | { kind: "reserved"; threadId: string; priorTurnRevision: number }
  | { kind: "replay"; result: Record<string, unknown>; threadId: string | null }
  | { kind: "response_expired" }
  | { kind: "in_progress"; modelStarted: boolean }
  | { kind: "reconciliation"; reason: string }
  | { kind: "conflict"; reason: string }
  | { kind: "denied"; reason: string }
  | { kind: "invalid"; reason: string }
  | { kind: "unavailable" };

export async function reserveTurn(
  client: LedgerClient,
  params: {
    operationId: string;
    userId: string;
    binding: string;
    requestedThreadId: string | null;
    mode: string;
    charge: boolean;
    allocationSource: AllocationSource | null;
    teamId: string | null;
    leaseSeconds?: number;
    newThread?: Record<string, unknown> | null;
    freeAiCap?: number;
  },
): Promise<TurnReserve> {
  const { data, error } = await client.rpc("assistant_turn_reserve", {
    p_operation_id: params.operationId,
    p_user_id: params.userId,
    p_binding: params.binding,
    p_requested_thread_id: params.requestedThreadId,
    p_mode: params.mode,
    p_charge: params.charge,
    p_alloc_source: params.allocationSource,
    p_team_id: params.teamId,
    p_lease_seconds: params.leaseSeconds ?? 180,
    p_new_thread: params.newThread ?? {},
    p_free_ai_cap: params.freeAiCap ?? 3,
  });
  if (error) return { kind: "unavailable" };
  const row = asObject(data);
  const status = row ? String(row.status ?? "") : "";
  const reason = String(row?.reason ?? "unknown");
  switch (status) {
    case "reserved": {
      const threadId = typeof row?.thread_id === "string" ? row.thread_id : "";
      if (!threadId) return { kind: "unavailable" };
      return {
        kind: "reserved",
        threadId,
        priorTurnRevision: Number(row?.prior_turn_revision ?? 0),
      };
    }
    case "replay": {
      const result = asObject(row?.result);
      if (!result) return { kind: "response_expired" };
      return {
        kind: "replay",
        result,
        threadId: typeof row?.thread_id === "string" ? row.thread_id : null,
      };
    }
    case "response_expired":
      return { kind: "response_expired" };
    case "in_progress":
      return { kind: "in_progress", modelStarted: row?.model_started === true };
    case "reconciliation":
      return { kind: "reconciliation", reason };
    case "conflict":
      return { kind: "conflict", reason };
    case "denied":
      return { kind: "denied", reason };
    case "error":
      return { kind: "invalid", reason };
    default:
      return { kind: "unavailable" };
  }
}

export async function markTurnModelStarted(
  client: LedgerClient,
  operationId: string,
  userId: string,
): Promise<{ ok: boolean; conflict: boolean }> {
  const { data, error } = await client.rpc("assistant_turn_mark_model_started", {
    p_operation_id: operationId,
    p_user_id: userId,
  });
  if (error) return { ok: false, conflict: false };
  const status = String(asObject(data)?.status ?? "");
  if (status === "ok") return { ok: true, conflict: false };
  if (status === "already_started") return { ok: false, conflict: true };
  return { ok: false, conflict: status === "conflict" };
}

export type TurnCommit =
  | { kind: "committed"; result: Record<string, unknown> }
  | { kind: "replay"; result: Record<string, unknown> }
  | { kind: "response_expired" }
  | { kind: "conflict"; reason: string }
  | { kind: "unavailable" };

export async function commitTurn(
  client: LedgerClient,
  params: {
    operationId: string;
    userId: string;
    userMessage: string;
    assistantMessage: string | null;
    events: unknown[];
    proposal: Record<string, unknown> | null;
    resultTtlSeconds?: number;
  },
): Promise<TurnCommit> {
  const { data, error } = await client.rpc("assistant_turn_commit", {
    p_operation_id: params.operationId,
    p_user_id: params.userId,
    p_user_message: params.userMessage,
    p_assistant_message: params.assistantMessage,
    p_events: params.events,
    p_proposal: params.proposal,
    p_result_ttl_seconds: params.resultTtlSeconds ?? 86400,
  });
  if (error) return { kind: "unavailable" };
  const row = asObject(data);
  const status = String(row?.status ?? "");
  const result = asObject(row?.result);
  if ((status === "committed" || status === "replay") && result) {
    return { kind: status === "committed" ? "committed" : "replay", result };
  }
  if (status === "response_expired") return { kind: "response_expired" };
  if (status === "conflict") return { kind: "conflict", reason: String(row?.reason ?? "unknown") };
  return { kind: "unavailable" };
}

/**
 * ДОКАЗУЕМ преход към изравняване. Извиква се при ВСЯКА несигурност СЛЕД като
 * моделът е стартиран: провал на доставчика, прекъсната мрежа, неочакван
 * изключение, нечетим отговор. НЕ отменя, НЕ възстановява, НЕ пуска втори модел.
 * Резултатът е трайно състояние, а не само HTTP отговор.
 */
export async function markTurnReconciliation(
  client: LedgerClient,
  operationId: string,
  userId: string,
  reason: string,
): Promise<{ ok: boolean }> {
  const { data, error } = await client.rpc("assistant_turn_mark_reconciliation", {
    p_operation_id: operationId,
    p_user_id: userId,
    p_reason: reason.slice(0, 120),
  });
  if (error) return { ok: false };
  const status = String(asObject(data)?.status ?? "");
  return { ok: status === "reconciliation" || status === "already_reconciliation" };
}

export type TurnCancel =
  | { kind: "cancelled"; restored: boolean }
  | { kind: "reconciliation"; reason: string }
  | { kind: "conflict"; reason: string }
  | { kind: "unavailable" };

export async function cancelTurn(
  client: LedgerClient,
  operationId: string,
  userId: string,
  reason: string,
): Promise<TurnCancel> {
  const { data, error } = await client.rpc("assistant_turn_cancel", {
    p_operation_id: operationId,
    p_user_id: userId,
    p_reason: reason.slice(0, 120),
  });
  if (error) return { kind: "unavailable" };
  const row = asObject(data);
  const status = String(row?.status ?? "");
  if (status === "cancelled") return { kind: "cancelled", restored: row?.restored === true };
  if (status === "reconciliation") {
    return { kind: "reconciliation", reason: String(row?.reason ?? "unknown") };
  }
  if (status === "conflict") return { kind: "conflict", reason: String(row?.reason ?? "unknown") };
  return { kind: "unavailable" };
}
